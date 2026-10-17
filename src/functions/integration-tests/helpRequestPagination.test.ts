import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import {
  collection, connectFirestoreEmulator, documentId, getDocs, getFirestore, limit,
  onSnapshot, orderBy, query, startAfter, where,
  type DocumentData, type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore'
import type { RespondToHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-pagination-admin')
const db = getAdminFirestore(admin)
const roles = ['student', 'mentor', 'outsiderStudent', 'outsiderMentor', 'emptyStudent', 'emptyMentor'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-pagination-${role}` }, `f01-pagination-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const ids: Record<Role, string> = { student: '', mentor: '', outsiderStudent: '', outsiderMentor: '', emptyStudent: '', emptyMentor: '' }
const prefix = `f01-page-${crypto.randomUUID().slice(0, 8)}`
const requestIds = Array.from({ length: 22 }, (_, index) => `${prefix}-${String(index).padStart(2, '0')}`)
const foreignId = `${prefix}-foreign`
const createdRefs: Array<ReturnType<typeof db.doc>> = []

const tupleHash = (studentId: string, mentorId: string, moduleId: string) =>
  createHash('sha256').update(JSON.stringify([studentId, mentorId, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')

type PageKind = 'student' | 'pending' | 'decided'
function requestPage(role: 'student' | 'mentor' | 'emptyStudent' | 'emptyMentor', kind: PageKind, cursor?: QueryDocumentSnapshot<DocumentData>) {
  const owner = role === 'student' || role === 'emptyStudent' ? 'studentId' : 'mentorId'
  const direction = kind === 'pending' ? 'asc' : 'desc'
  const clauses: QueryConstraint[] = [where(owner, '==', ids[role])]
  if (kind === 'pending') clauses.push(where('status', '==', 'PENDING'))
  if (kind === 'decided') clauses.push(where('status', 'in', ['ACCEPTED', 'REJECTED']))
  clauses.push(orderBy('createdAt', direction), orderBy(documentId(), direction))
  if (cursor) clauses.push(startAfter(cursor.data().createdAt, cursor.id))
  clauses.push(limit(20))
  return query(collection(getFirestore(apps[role]), 'helpRequests'), ...clauses)
}

async function waitForEvents(predicate: () => boolean, failures: unknown[], timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (failures.length) throw failures[0]
    if (Date.now() > deadline) throw new Error('Timed out waiting for F01 listener events')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  if (failures.length) throw failures[0]
}

beforeAll(async () => {
  for (const role of roles) {
    const app = apps[role]
    const auth = getAuth(app)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getFirestore(app), '127.0.0.1', 8080)
    connectFunctionsEmulator(getFunctions(app, 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `${prefix}-${role.toLowerCase()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection('users').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role.toLowerCase().includes('student') ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }

  const older = Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 60 * 1000))
  const tied = Timestamp.fromDate(new Date(Date.now() - 60 * 60 * 1000))
  const batch = db.batch()
  for (const [index, id] of requestIds.entries()) {
    const moduleId = `${prefix}-module-${index}`
    const createdAt = index === 0 ? older : tied
    const requestRef = db.collection('helpRequests').doc(id)
    const keyRef = db.collection('pendingHelpRequestKeys').doc(tupleHash(ids.student, ids.mentor, moduleId))
    createdRefs.push(requestRef, keyRef)
    batch.set(requestRef, {
      id, studentId: ids.student, mentorId: ids.mentor, moduleId,
      studentDisplayName: 'student', mentorDisplayName: 'mentor', title: `Question ${index}`,
      description: 'A persisted pagination fixture.', status: 'PENDING', createdAt, updatedAt: createdAt,
    })
    batch.set(keyRef, { studentId: ids.student, mentorId: ids.mentor, moduleId, helpRequestId: id })
  }
  const foreignRef = db.collection('helpRequests').doc(foreignId)
  const summaryRef = db.collection('helpRequestSummaries').doc(ids.student)
  createdRefs.push(foreignRef, summaryRef)
  batch.set(foreignRef, {
    id: foreignId, studentId: ids.outsiderStudent, mentorId: ids.outsiderMentor, moduleId: `${prefix}-foreign-module`,
    studentDisplayName: 'outsiderStudent', mentorDisplayName: 'outsiderMentor', title: 'Foreign question',
    description: 'Must not enter either owner page.', status: 'PENDING', createdAt: tied, updatedAt: tied,
  })
  batch.set(summaryRef, { pendingCount: requestIds.length, acceptedCount: 0, rejectedCount: 0, openCount: requestIds.length, updatedAt: tied })
  await batch.commit()
}, 30000)

afterAll(async () => {
  if (createdRefs.length) {
    const batch = db.batch()
    for (const ref of createdRefs) batch.delete(ref)
    await batch.commit()
  }
  for (const role of roles) {
    if (ids[role]) {
      await db.collection('users').doc(ids[role]).delete()
      await getAdminAuth(admin).deleteUser(ids[role])
    }
    await signOut(getAuth(apps[role]))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

describe('F01 real owner pagination and live membership (TC-014, 015, 018, 019, 020, 040)', () => {
  it('uses bounded owner queries with stable timestamp/ID cursors and migrates a decision live', async () => {
    const studentFirst = await getDocs(requestPage('student', 'student'))
    const studentOlder = await getDocs(requestPage('student', 'student', studentFirst.docs.at(-1)))
    const mentorFirst = await getDocs(requestPage('mentor', 'pending'))
    const mentorOlder = await getDocs(requestPage('mentor', 'pending', mentorFirst.docs.at(-1)))
    const descending = [...requestIds.slice(1).reverse(), requestIds[0]!]
    const ascending = [requestIds[0]!, ...requestIds.slice(1)]
    expect(studentFirst.docs.map((item) => item.id)).toEqual(descending.slice(0, 20))
    expect(studentOlder.docs.map((item) => item.id)).toEqual(descending.slice(20))
    expect(mentorFirst.docs.map((item) => item.id)).toEqual(ascending.slice(0, 20))
    expect(mentorOlder.docs.map((item) => item.id)).toEqual(ascending.slice(20))
    expect(new Set([...studentFirst.docs, ...studentOlder.docs].map((item) => item.id)).size).toBe(requestIds.length)
    expect(new Set([...mentorFirst.docs, ...mentorOlder.docs].map((item) => item.id)).size).toBe(requestIds.length)
    expect([...studentFirst.docs, ...studentOlder.docs, ...mentorFirst.docs, ...mentorOlder.docs].some((item) => item.id === foreignId)).toBe(false)

    const events: Record<PageKind, Array<Array<{ id: string; status: string }>>> = { student: [], pending: [], decided: [] }
    const failures: unknown[] = []
    const unsubscribers = (['student', 'pending', 'decided'] as const).map((kind) => onSnapshot(
      requestPage(kind === 'student' ? 'student' : 'mentor', kind),
      (snapshot) => events[kind].push(snapshot.docs.map((item) => ({ id: item.id, status: item.data().status as string }))),
      (error) => failures.push(error),
    ))
    try {
      await waitForEvents(() => events.student.length > 0 && events.pending.length > 0 && events.decided.length > 0, failures)
      expect(events.student.at(-1)?.map((item) => item.id)).toEqual(descending.slice(0, 20))
      expect(events.pending.at(-1)?.map((item) => item.id)).toEqual(ascending.slice(0, 20))
      expect(events.decided.at(-1)).toEqual([])

      const decisionId = requestIds[2]!
      const decide = httpsCallable<RespondToHelpRequestInput, unknown>(getFunctions(apps.mentor, 'asia-southeast1'), 'respondToHelpRequest')
      const result = await decide({ operationId: crypto.randomUUID(), helpRequestId: decisionId, response: 'REJECTED' })
      expect(result.data).toMatchObject({ kind: 'decided', helpRequest: { id: decisionId, status: 'REJECTED' } })
      await waitForEvents(() =>
        events.student.some((page) => page.some((item) => item.id === decisionId && item.status === 'REJECTED')) &&
        events.pending.some((page) => !page.some((item) => item.id === decisionId) && page.some((item) => item.id === requestIds[20])) &&
        events.decided.some((page) => page.some((item) => item.id === decisionId && item.status === 'REJECTED')), failures)
      expect(events.pending.at(-1)?.map((item) => item.id)).toEqual(ascending.filter((id) => id !== decisionId).slice(0, 20))
      expect(events.decided.at(-1)).toEqual([{ id: decisionId, status: 'REJECTED' }])
      expect(events.student.at(-1)?.find((item) => item.id === decisionId)?.status).toBe('REJECTED')
      expect((await db.collection('pendingHelpRequestKeys').doc(tupleHash(ids.student, ids.mentor, `${prefix}-module-2`)).get()).exists).toBe(false)
      expect((await db.collection('helpRequestSummaries').doc(ids.student).get()).data()).toMatchObject({ pendingCount: 21, rejectedCount: 1, openCount: 21 })
    } finally {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, 45000)

  it('returns confirmed empty owner pages and reports denied listeners and later pages without changing rows (TC-015/020)', async () => {
    const emptyStudent = await getDocs(requestPage('emptyStudent', 'student')).catch((error: unknown) => {
      throw new Error('Empty Student owner page failed', { cause: error })
    })
    const emptyMentor = await getDocs(requestPage('emptyMentor', 'pending')).catch((error: unknown) => {
      throw new Error('Empty Mentor pending owner page failed', { cause: error })
    })
    for (const empty of [emptyStudent, emptyMentor]) {
      expect(empty.empty).toBe(true)
      expect(empty.metadata.fromCache).toBe(false)
    }

    const firstStudent = await getDocs(requestPage('student', 'student'))
    const firstMentor = await getDocs(requestPage('mentor', 'pending'))
    expect(firstStudent.size).toBe(20)
    expect(firstMentor.size).toBe(20)
    const before = (await db.collection('helpRequests').where('studentId', '==', ids.student).get()).docs
      .map((item) => [item.id, item.data()] as const)
    for (const [role, kind, first] of [['student', 'student', firstStudent], ['mentor', 'pending', firstMentor]] as const) {
      const userRef = db.collection('users').doc(ids[role])
      await userRef.update({ status: 'SUSPENDED' })
      try {
        await expect(getDocs(requestPage(role, kind, first.docs.at(-1)))).rejects.toMatchObject({ code: 'permission-denied' })
      } finally { await userRef.update({ status: 'ACTIVE' }) }
    }

    const deniedQuery = query(collection(getFirestore(apps.mentor), 'helpRequests'),
      where('mentorId', '==', ids.outsiderMentor), where('status', '==', 'PENDING'),
      orderBy('createdAt', 'asc'), orderBy(documentId(), 'asc'), limit(20))
    const outcomes: string[] = []
    const denied = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => { unsubscribe(); reject(new Error('Denied listener did not report an error.')) }, 10000)
      const unsubscribe = onSnapshot(deniedQuery, () => outcomes.push('data'), (error) => { clearTimeout(timer); resolve(error) })
    })
    expect(denied).toMatchObject({ code: 'permission-denied' })
    expect(outcomes).toEqual([])
    const after = (await db.collection('helpRequests').where('studentId', '==', ids.student).get()).docs
      .map((item) => [item.id, item.data()] as const)
    expect(after).toEqual(before)
  }, 30000)
})
