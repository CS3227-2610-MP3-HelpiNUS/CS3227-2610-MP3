import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { createHelpRequestOutputSchema } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-authority-extras-admin')
const db = getFirestore(admin)
const app = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'f01-authority-extras' }, 'f01-authority-extras')
const create = httpsCallable<unknown, unknown>(getFunctions(app, 'asia-southeast1'), 'createHelpRequest')
const moduleId = `f01-authority-${crypto.randomUUID()}`
const ids = { student: '', mentor: '' }
const email = `f01-authority-${crypto.randomUUID()}@example.test`
const tupleHash = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')

async function snapshot() {
  const [requests, receipts, keys, summaries, conversations] = await Promise.all([
    db.collection('helpRequests').get(),
    db.collection('helpRequestOperations').doc(ids.student).collection('operations').get(),
    db.collection('pendingHelpRequestKeys').get(),
    db.collection('helpRequestSummaries').get(),
    db.collection('conversations').get(),
  ])
  return {
    requests: requests.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b)),
    receipts: receipts.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b)),
    keys: keys.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b)),
    summaries: summaries.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b)),
    conversations: conversations.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b)),
  }
}

beforeAll(async () => {
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFunctionsEmulator(getFunctions(app, 'asia-southeast1'), '127.0.0.1', 5001)
  const student = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
  ids.student = student.uid
  await getAdminAuth(admin).updateUser(student.uid, { emailVerified: true })
  await student.reload()
  await getIdToken(student, true)
  ids.mentor = `f01-authority-mentor-${crypto.randomUUID()}`
  await db.collection('users').doc(ids.student).set({ id: ids.student, email, displayName: 'Authority Student', role: 'STUDENT', status: 'ACTIVE', createdAt: Timestamp.now() })
  await db.collection('mentors').doc(ids.mentor).set({ id: ids.mentor, email: 'mentor@example.test', displayName: 'Authority Mentor', role: 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'CS3227', title: 'Authority', active: true })
}, 30000)

afterAll(async () => {
  if (ids.student) {
    const [requests, receipts] = await Promise.all([
      db.collection('helpRequests').where('studentId', '==', ids.student).get(),
      db.collection('helpRequestOperations').doc(ids.student).collection('operations').get(),
    ])
    for (const doc of [...requests.docs, ...receipts.docs]) await doc.ref.delete()
    await db.collection('pendingHelpRequestKeys').doc(tupleHash()).delete()
    await db.collection('helpRequestSummaries').doc(ids.student).delete()
    await db.collection('users').doc(ids.student).delete()
    await getAdminAuth(admin).deleteUser(ids.student)
    await signOut(getAuth(app))
  }
  await db.collection('modules').doc(moduleId).delete()
  if (ids.mentor) {
    await db.collection('mentorProfiles').doc(ids.mentor).delete()
    await db.collection('mentors').doc(ids.mentor).delete()
  }
  await deleteApp(app)
  await deleteAdminApp(admin)
}, 30000)

describe('F01 TC-005 creation identity authority', () => {
  it('rejects caller-controlled identity, status and timestamp fields with exact no-write snapshots', async () => {
    const base = () => ({ operationId: crypto.randomUUID(), mentorId: ids.mentor, moduleId, title: 'Question', description: 'Explain the topic' })
    const extras: Array<[string, unknown]> = [
      ['id', 'forged-id'], ['helpRequestId', 'forged-id'], ['requestId', 'forged-id'],
      ['studentId', 'forged-student'], ['studentDisplayName', 'Forged Student'],
      ['mentorDisplayName', 'Forged Mentor'], ['status', 'ACCEPTED'],
      ['createdAt', '2000-01-01T00:00:00.000Z'], ['updatedAt', '2000-01-01T00:00:00.000Z'],
    ]
    for (const [field, value] of extras) {
      const before = await snapshot()
      const error = await create({ ...base(), [field]: value }).then(() => null, (reason: unknown) => reason) as { code?: string; details?: unknown } | null
      expect(error?.code, field).toBe('functions/invalid-argument')
      expect(JSON.stringify(error?.details ?? {}), field).not.toContain(ids.mentor)
      expect(await snapshot(), field).toEqual(before)
    }
    const operationId = crypto.randomUUID()
    const result = createHelpRequestOutputSchema.parse((await create({ ...base(), operationId })).data)
    expect(result.kind).toBe('created')
    if (result.kind !== 'created') throw new Error('Expected a new request')
    const stored = (await db.collection('helpRequests').doc(result.helpRequest.id).get()).data()
    expect(stored).toMatchObject({ id: result.helpRequest.id, studentId: ids.student, mentorId: ids.mentor, moduleId, status: 'PENDING' })
    expect(stored?.studentId).not.toBe('forged-student')
    expect((await db.collection('helpRequestOperations').doc(ids.student).collection('operations').doc(operationId).get()).data()?.helpRequestId).toBe(result.helpRequest.id)
    expect((await db.collection('pendingHelpRequestKeys').doc(tupleHash()).get()).data()?.helpRequestId).toBe(result.helpRequest.id)
    expect((await db.collection('helpRequestSummaries').doc(ids.student).get()).data()).toMatchObject({ pendingCount: 1, openCount: 1 })
  }, 60000)
})
