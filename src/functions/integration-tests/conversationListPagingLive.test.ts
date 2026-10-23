import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { collection, connectFirestoreEmulator, documentId, getDocs, getFirestore as getClientFirestore, limit, onSnapshot, orderBy, query, startAfter, where } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { SendMessageInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f02-list-paging-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor'] as const
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f02-list-${role}` }, `f02-list-${role}`)])) as Record<typeof roles[number], ReturnType<typeof initializeApp>>
const ids: Record<string, string> = {}
const fixtureIds: string[] = []
const moduleId = `f02-list-module-${crypto.randomUUID()}`
const timestamp = (index: number) => Timestamp.fromMillis(Date.parse('2026-10-16T08:00:00.000Z') + (index < 7 ? 0 : index * 1000))
const ownerQuery = (role: typeof roles[number]) => {
  const owner = role === 'student' ? 'studentId' : 'mentorId'
  return [where(owner, '==', ids[role]), where('status', '==', 'ACCEPTED'), orderBy('updatedAt', 'desc'), orderBy(documentId(), 'desc')] as const
}
const parentData = (id: string, acceptedAt: Timestamp, studentId = ids.student, mentorId = ids.mentor) => ({
  id, studentId, mentorId, moduleId, studentDisplayName: 'Historical student', mentorDisplayName: 'Historical mentor',
  title: `Accepted ${id}`, description: 'List paging fixture', status: 'ACCEPTED',
  createdAt: acceptedAt, updatedAt: acceptedAt,
})
const pairData = (id: string, acceptedAt: Timestamp, studentId = ids.student, mentorId = ids.mentor) => ({
  id, helpRequestId: id, studentId, mentorId, participantIds: [studentId, mentorId],
  createdAt: acceptedAt, updatedAt: acceptedAt,
})
const expectedOrder = (items: Array<{ id: string; time: Timestamp }>) => [...items].sort((a, b) => b.time.toMillis() - a.time.toMillis() || b.id.localeCompare(a.id)).map((item) => item.id)

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getClientFirestore(apps[role]), '127.0.0.1', 8080)
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f02-list-${role}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'CS3227', title: 'Software Engineering', active: true })
  const batch = db.batch()
  for (let index = 0; index < 22; index++) {
    const id = `f02-list-${String(index).padStart(2, '0')}-${crypto.randomUUID()}`
    fixtureIds.push(id)
    const at = timestamp(index)
    batch.set(db.collection('helpRequests').doc(id), parentData(id, at))
    batch.set(db.collection('conversations').doc(id), pairData(id, at))
  }
  const foreignId = `f02-list-foreign-${crypto.randomUUID()}`
  fixtureIds.push(foreignId)
  batch.set(db.collection('helpRequests').doc(foreignId), parentData(foreignId, timestamp(23), 'foreign-student', 'foreign-mentor'))
  batch.set(db.collection('conversations').doc(foreignId), pairData(foreignId, timestamp(23), 'foreign-student', 'foreign-mentor'))
  await batch.commit()
}, 30000)

afterAll(async () => {
  for (const id of fixtureIds) {
    const messages = await db.collection('conversations').doc(id).collection('messages').get()
    for (const message of messages.docs) await message.ref.delete()
    await db.collection('conversations').doc(id).delete()
    await db.collection('helpRequests').doc(id).delete()
  }
  await db.collection('modules').doc(moduleId).delete()
  for (const role of roles) {
    if (ids[role]) { await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(ids[role]).delete(); await getAdminAuth(admin).deleteUser(ids[role]) }
    await signOut(getAuth(apps[role]))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

describe('F02 owner list paging and live shift (TC-013/014)', () => {
  it('uses native timestamp/ID order in bounded 20+probe pages and keeps older-chat send out of list order', async () => {
    const expected = expectedOrder(fixtureIds.slice(0, 22).map((id, index) => ({ id, time: timestamp(index) })))
    const olderId = expected.at(-1)!
    const parent = db.collection('helpRequests').doc(olderId)
    const pair = db.collection('conversations').doc(olderId)
    const before = [(await parent.get()).data(), (await pair.get()).data()]
    for (const role of roles) {
      const source = collection(getClientFirestore(apps[role]), 'helpRequests')
      const clauses = ownerQuery(role)
      const first = await getDocs(query(source, ...clauses, limit(20)))
      expect(first.docs.map((item) => item.id)).toEqual(expected.slice(0, 20))
      const boundary = first.docs.at(-1)!
      const probe = await getDocs(query(source, ...clauses, startAfter(boundary), limit(1)))
      expect(probe.docs.map((item) => item.id)).toEqual(expected.slice(20, 21))
      const older = await getDocs(query(source, ...clauses, startAfter(boundary), limit(20)))
      expect(older.docs.map((item) => item.id)).toEqual(expected.slice(20))
      expect(new Set([...first.docs, ...older.docs].map((item) => item.id)).size).toBe(22)
    }
    const send = httpsCallable<SendMessageInput, unknown>(getFunctions(apps.student, 'asia-southeast1'), 'sendMessage')
    const messageId = crypto.randomUUID()
    expect((await send({ requestId: olderId, messageId, body: 'Older list chat' })).data).toMatchObject({ message: { id: messageId } })
    expect([(await parent.get()).data(), (await pair.get()).data()]).toEqual(before)
    for (const role of roles) {
      const source = collection(getClientFirestore(apps[role]), 'helpRequests')
      expect((await getDocs(query(source, ...ownerQuery(role), limit(20)))).docs.map((item) => item.id)).toEqual(expected.slice(0, 20))
    }
  }, 30000)

  it('retains evicted twentieth row across a live first-page shift and bounded bridge for both roles', async () => {
    const expected = expectedOrder(fixtureIds.slice(0, 22).map((id, index) => ({ id, time: timestamp(index) })))
    const listeners: Array<() => void> = []
    const live = new Map<string, string[]>()
    const waitFor = async (ready: () => boolean) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (ready()) return
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error('Timed out waiting for owner list listener')
    }
    try {
      for (const role of roles) {
        const source = collection(getClientFirestore(apps[role]), 'helpRequests')
        listeners.push(onSnapshot(query(source, ...ownerQuery(role), limit(20)), (snapshot) => {
          live.set(role, snapshot.docs.map((item) => item.id))
        }))
      }
      await waitFor(() => roles.every((role) => live.get(role)?.length === 20))
      for (const role of roles) expect(live.get(role)).toEqual(expected.slice(0, 20))
      const insertedId = `f02-list-new-${crypto.randomUUID()}`
      const insertedAt = Timestamp.now()
      fixtureIds.push(insertedId)
      await db.collection('helpRequests').doc(insertedId).set(parentData(insertedId, insertedAt))
      await db.collection('conversations').doc(insertedId).set(pairData(insertedId, insertedAt))
      await waitFor(() => roles.every((role) => live.get(role)?.[0] === insertedId))
      for (const role of roles) {
        const current = live.get(role)!
        expect(current).toEqual([insertedId, ...expected.slice(0, 19)])
        const source = collection(getClientFirestore(apps[role]), 'helpRequests')
        const boundary = await getDocs(query(source, ...ownerQuery(role), limit(20)))
        const bridge = await getDocs(query(source, ...ownerQuery(role), startAfter(boundary.docs.at(-1)!), limit(20)))
        const merged = [...current, ...bridge.docs.map((item) => item.id)]
        expect(merged).toEqual([insertedId, ...expected])
        expect(new Set(merged).size).toBe(23)
        expect(!merged.includes(fixtureIds[22]!)).toBe(true)
      }
    } finally { listeners.forEach((unsubscribe) => unsubscribe()) }
  }, 30000)
})
