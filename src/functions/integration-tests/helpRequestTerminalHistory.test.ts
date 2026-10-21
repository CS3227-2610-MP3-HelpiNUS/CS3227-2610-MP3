import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { collection, connectFirestoreEmulator, doc, documentId, getDocFromServer, getDocs, getFirestore, limit, orderBy, query, startAfter, where } from 'firebase/firestore'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-terminal-history-admin')
const db = getAdminFirestore(admin)
const roles = ['student', 'mentor', 'foreignStudent'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-terminal-history-${role}` }, `f01-terminal-history-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const ids: Record<Role, string> = { student: '', mentor: '', foreignStudent: '' }
const prefix = `f01-terminal-${crypto.randomUUID().slice(0, 8)}`
const requestIds = Array.from({ length: 22 }, (_, index) => `${prefix}-${String(index).padStart(2, '0')}`)
const foreignId = `${prefix}-foreign`
const older = Timestamp.fromDate(new Date('2026-10-15T08:00:00.000Z'))
const tied = Timestamp.fromDate(new Date('2026-10-16T08:00:00.000Z'))
const acceptedAt = Timestamp.fromDate(new Date('2026-10-16T09:00:00.000Z'))
const rejectedAt = Timestamp.fromDate(new Date('2026-10-16T10:00:00.000Z'))

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getFirestore(apps[role]), '127.0.0.1', 8080)
    const email = `${prefix}-${role}@integration.invalid`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'mentor' ? 'MENTOR' : 'STUDENT', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  const batch = db.batch()
  for (const [index, id] of requestIds.entries()) {
    const status = index % 2 === 0 ? 'ACCEPTED' : 'REJECTED'
    batch.set(db.collection('helpRequests').doc(id), {
      id, studentId: ids.student, mentorId: ids.mentor, moduleId: 'historical-module',
      studentDisplayName: 'Current Student', mentorDisplayName: 'Persisted Mentor Name',
      title: `Terminal question ${index}`, description: `Persisted question ${index}`,
      status, createdAt: index === 0 ? older : tied, updatedAt: status === 'ACCEPTED' ? acceptedAt : rejectedAt,
    })
  }
  batch.set(db.collection('helpRequests').doc(foreignId), {
    id: foreignId, studentId: ids.foreignStudent, mentorId: ids.mentor, moduleId: 'historical-module',
    studentDisplayName: 'Foreign Student', mentorDisplayName: 'Persisted Mentor Name',
    title: 'Foreign terminal question', description: 'Must not enter Student history',
    status: 'REJECTED', createdAt: tied, updatedAt: rejectedAt,
  })
  await batch.commit()
}, 30000)

afterAll(async () => {
  const batch = db.batch()
  for (const id of [...requestIds, foreignId]) batch.delete(db.collection('helpRequests').doc(id))
  await batch.commit()
  for (const role of roles) {
    if (ids[role]) {
      await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(ids[role]).delete()
      await getAdminAuth(admin).deleteUser(ids[role])
    }
    await signOut(getAuth(apps[role]))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

describe('F01-TC-014 terminal Student history and detail under actual Rules', () => {
  it('returns own accepted/rejected rows in exact time and document-ID order across the cursor, and persisted detail', async () => {
    const client = getFirestore(apps.student)
    const clauses = [where('studentId', '==', ids.student), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc')]
    const first = await getDocs(query(collection(client, 'helpRequests'), ...clauses, limit(20)))
    const cursor = first.docs.at(-1)!
    const second = await getDocs(query(collection(client, 'helpRequests'), ...clauses, startAfter(cursor.data().createdAt, cursor.id), limit(20)))
    const expected = [...requestIds.slice(1).reverse(), requestIds[0]!]
    const actual = [...first.docs, ...second.docs]
    expect(first.size).toBe(20)
    expect(second.size).toBe(2)
    expect(actual.map((item) => item.id)).toEqual(expected)
    expect(new Set(actual.map((item) => item.id)).size).toBe(22)
    expect(actual.some((item) => item.id === foreignId)).toBe(false)
    expect(first.metadata.fromCache).toBe(false)
    expect(second.metadata.fromCache).toBe(false)

    for (const index of [0, 1, 20, 21]) {
      const id = requestIds[index]!
      const saved = (await db.collection('helpRequests').doc(id).get()).data()!
      const detail = await getDocFromServer(doc(client, 'helpRequests', id))
      expect(detail.exists()).toBe(true)
      expect({ ...detail.data(), createdAt: detail.data()?.createdAt.toDate().toISOString(), updatedAt: detail.data()?.updatedAt.toDate().toISOString() })
        .toEqual({ ...saved, createdAt: saved.createdAt.toDate().toISOString(), updatedAt: saved.updatedAt.toDate().toISOString() })
      expect(detail.data()).toMatchObject({ id, studentId: ids.student, mentorId: ids.mentor,
        mentorDisplayName: 'Persisted Mentor Name', moduleId: 'historical-module',
        title: `Terminal question ${index}`, description: `Persisted question ${index}`,
        status: index % 2 === 0 ? 'ACCEPTED' : 'REJECTED' })
      expect(detail.data()?.createdAt.toDate().toISOString()).toBe((index === 0 ? older : tied).toDate().toISOString())
      expect(detail.data()?.updatedAt.toDate().toISOString()).toBe((index % 2 === 0 ? acceptedAt : rejectedAt).toDate().toISOString())
      expect(detail.data()).not.toHaveProperty('rejectionReason')
    }
    await expect(getDocFromServer(doc(client, 'helpRequests', foreignId))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDocs(query(collection(client, 'helpRequests'), where('studentId', '==', ids.foreignStudent), limit(20))))
      .rejects.toMatchObject({ code: 'permission-denied' })
  }, 30000)
})
