import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { collection, connectFirestoreEmulator, doc, documentId, getDocs, getFirestore, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore'
import type { RespondToHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-dashboard-decision-admin')
const db = getAdminFirestore(admin)
const roles = ['student', 'mentor', 'foreignStudent', 'foreignMentor'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-dashboard-decision-${role}` }, `f01-dashboard-decision-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const ids: Record<Role, string> = { student: '', mentor: '', foreignStudent: '', foreignMentor: '' }
const prefix = `f01-dashboard-${crypto.randomUUID().slice(0, 8)}`
const requestIds = { pendingA: `${prefix}-pending-a`, pendingB: `${prefix}-pending-b`, accepted: `${prefix}-accepted`, rejected: `${prefix}-rejected`, foreign: `${prefix}-foreign` }
const createdAt = Timestamp.fromDate(new Date('2026-10-15T08:00:00.000Z'))
const tiedAt = Timestamp.fromDate(new Date('2026-10-16T08:00:00.000Z'))
const decidedAt = Timestamp.fromDate(new Date('2026-10-16T09:00:00.000Z'))
const moduleIds = { pendingA: `${prefix}-module-a`, pendingB: `${prefix}-module-b`, accepted: `${prefix}-module-c`, rejected: `${prefix}-module-d`, foreign: `${prefix}-module-e` }
const tupleHash = (studentId: string, mentorId: string, moduleId: string) => createHash('sha256').update(JSON.stringify([studentId, mentorId, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')
const studentDb = () => getFirestore(apps.student)
const mentorDb = () => getFirestore(apps.mentor)
const ownHistory = () => query(collection(studentDb(), 'helpRequests'), where('studentId', '==', ids.student), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20))
const pending = () => query(collection(mentorDb(), 'helpRequests'), where('mentorId', '==', ids.mentor), where('status', '==', 'PENDING'), orderBy('createdAt', 'asc'), orderBy(documentId(), 'asc'), limit(20))
const decided = () => query(collection(mentorDb(), 'helpRequests'), where('mentorId', '==', ids.mentor), where('status', 'in', ['ACCEPTED', 'REJECTED']), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20))

function request(id: string, moduleId: string, studentId: string, status: 'PENDING' | 'ACCEPTED' | 'REJECTED', time: Timestamp, mentorId = ids.mentor) {
  return { id, studentId, mentorId, moduleId, studentDisplayName: 'Persisted Student Snapshot', mentorDisplayName: 'Persisted Mentor Snapshot',
    title: `Question ${id}`, description: 'Persisted dashboard question', status, createdAt: time, updatedAt: status === 'PENDING' ? time : decidedAt }
}

function audit() {
  const script = fileURLToPath(new URL('../scripts/audit-help-requests.ts', import.meta.url))
  const result = spawnSync(process.execPath, ['--import', 'tsx', script], { env: { ...process.env, GCLOUD_PROJECT: projectId }, encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ clean: true, anomalies: {} })
}

async function waitFor(predicate: () => boolean, errors: unknown[], timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (errors.length) throw errors[0]
    if (Date.now() > deadline) throw new Error('Timed out waiting for real dashboard/inbox listeners')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getFirestore(apps[role]), '127.0.0.1', 8080)
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `${prefix}-${role}@integration.invalid`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload(); await getIdToken(user, true)
    await db.collection('users').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'mentor' || role === 'foreignMentor' ? 'MENTOR' : 'STUDENT', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  const batch = db.batch()
  batch.set(db.collection('helpRequests').doc(requestIds.pendingA), request(requestIds.pendingA, moduleIds.pendingA, ids.student, 'PENDING', createdAt))
  batch.set(db.collection('helpRequests').doc(requestIds.pendingB), request(requestIds.pendingB, moduleIds.pendingB, ids.student, 'PENDING', tiedAt))
  batch.set(db.collection('helpRequests').doc(requestIds.accepted), request(requestIds.accepted, moduleIds.accepted, ids.student, 'ACCEPTED', tiedAt))
  batch.set(db.collection('helpRequests').doc(requestIds.rejected), request(requestIds.rejected, moduleIds.rejected, ids.student, 'REJECTED', tiedAt))
  batch.set(db.collection('helpRequests').doc(requestIds.foreign), request(requestIds.foreign, moduleIds.foreign, ids.foreignStudent, 'REJECTED', tiedAt, ids.foreignMentor))
  for (const kind of ['pendingA', 'pendingB'] as const) batch.set(db.collection('pendingHelpRequestKeys').doc(tupleHash(ids.student, ids.mentor, moduleIds[kind])), {
    studentId: ids.student, mentorId: ids.mentor, moduleId: moduleIds[kind], helpRequestId: requestIds[kind],
  })
  batch.set(db.collection('helpRequestSummaries').doc(ids.student), { pendingCount: 2, acceptedCount: 1, rejectedCount: 1, openCount: 3, updatedAt: decidedAt })
  batch.set(db.collection('helpRequestSummaries').doc(ids.foreignStudent), { pendingCount: 0, acceptedCount: 0, rejectedCount: 1, openCount: 0, updatedAt: decidedAt })
  batch.set(db.collection('conversations').doc(requestIds.accepted), {
    id: requestIds.accepted, helpRequestId: requestIds.accepted, studentId: ids.student, mentorId: ids.mentor,
    participantIds: [ids.student, ids.mentor], createdAt: decidedAt, updatedAt: decidedAt,
  })
  await batch.commit()
}, 30000)

afterAll(async () => {
  const batch = db.batch()
  for (const id of Object.values(requestIds)) { batch.delete(db.collection('helpRequests').doc(id)); batch.delete(db.collection('conversations').doc(id)) }
  for (const kind of ['pendingA', 'pendingB'] as const) batch.delete(db.collection('pendingHelpRequestKeys').doc(tupleHash(ids.student, ids.mentor, moduleIds[kind])))
  for (const role of ['student', 'foreignStudent'] as const) if (ids[role]) batch.delete(db.collection('helpRequestSummaries').doc(ids[role]))
  await batch.commit()
  for (const role of roles) {
    if (ids[role]) { await db.collection('users').doc(ids[role]).delete(); await getAdminAuth(admin).deleteUser(ids[role]) }
    await signOut(getAuth(apps[role])); await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

describe('F01-TC-017/018/019 real summary and Mentor inbox transitions', () => {
  it('reconciles 2/1/1/open3 with own history and pending/decided queries, then one production rejection transition', async () => {
    audit()
    const summary = await db.collection('helpRequestSummaries').doc(ids.student).get()
    expect(summary.data()).toMatchObject({ pendingCount: 2, acceptedCount: 1, rejectedCount: 1, openCount: 3 })
    const historyBefore = await getDocs(ownHistory())
    const pendingBefore = await getDocs(pending())
    const decidedBefore = await getDocs(decided())
    expect(historyBefore.docs.map((item) => item.id)).toEqual([requestIds.rejected, requestIds.pendingB, requestIds.accepted, requestIds.pendingA])
    expect(pendingBefore.docs.map((item) => item.id)).toEqual([requestIds.pendingA, requestIds.pendingB])
    expect(decidedBefore.docs.map((item) => item.id)).toEqual([requestIds.rejected, requestIds.accepted])
    expect([...historyBefore.docs, ...pendingBefore.docs, ...decidedBefore.docs].some((item) => item.id === requestIds.foreign)).toBe(false)

    const events: { history: string[][]; pending: string[][]; decided: string[][] } = { history: [], pending: [], decided: [] }
    const errors: unknown[] = []
    const stops = [
      onSnapshot(ownHistory(), (page) => events.history.push(page.docs.map((item) => item.id)), (error) => errors.push(error)),
      onSnapshot(pending(), (page) => events.pending.push(page.docs.map((item) => item.id)), (error) => errors.push(error)),
      onSnapshot(decided(), (page) => events.decided.push(page.docs.map((item) => item.id)), (error) => errors.push(error)),
    ]
    try {
      await waitFor(() => events.history.length > 0 && events.pending.length > 0 && events.decided.length > 0, errors)
      const decide = httpsCallable<RespondToHelpRequestInput, unknown>(getFunctions(apps.mentor, 'asia-southeast1'), 'respondToHelpRequest')
      const result = await decide({ operationId: crypto.randomUUID(), helpRequestId: requestIds.pendingB, response: 'REJECTED' })
      expect(result.data).toMatchObject({ kind: 'decided', helpRequest: { id: requestIds.pendingB, status: 'REJECTED' }, conversationId: null })
      await waitFor(() => events.pending.at(-1)?.length === 1 && events.decided.at(-1)?.length === 3, errors)
      expect(events.pending.at(-1)).toEqual([requestIds.pendingA])
      expect(events.decided.at(-1)).toEqual([requestIds.rejected, requestIds.pendingB, requestIds.accepted])
      expect(events.history.at(-1)).toEqual([requestIds.rejected, requestIds.pendingB, requestIds.accepted, requestIds.pendingA])
      const after = (await db.collection('helpRequestSummaries').doc(ids.student).get()).data()!
      expect(after).toMatchObject({ pendingCount: 1, acceptedCount: 1, rejectedCount: 2, openCount: 2 })
      expect((await db.collection('pendingHelpRequestKeys').doc(tupleHash(ids.student, ids.mentor, moduleIds.pendingB)).get()).exists).toBe(false)
      expect((await db.collection('helpRequests').doc(requestIds.pendingB).get()).data()?.updatedAt.toMillis()).toBeGreaterThan(tiedAt.toMillis())
      expect((await db.collection('conversations').doc(requestIds.pendingB).get()).exists).toBe(false)
      audit()
    } finally { stops.forEach((stop) => stop()) }
  }, 45000)
})
