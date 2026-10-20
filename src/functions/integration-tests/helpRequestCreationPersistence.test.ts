import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore as getClientFirestore, updateDoc } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { createHelpRequestOutputSchema, type CreateHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-creation-persistence-admin')
const db = getFirestore(admin)
const app = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'f01-creation-persistence' }, 'f01-creation-persistence')
const ids = { student: '', mentor: '' }
const moduleId = `f01-created-module-${crypto.randomUUID()}`
const operationId = crypto.randomUUID()
const studentEmail = `f01-created-${crypto.randomUUID()}@example.test`
const mentorEmail = `f01-created-mentor-${crypto.randomUUID()}@example.test`
const title = 'Normalized question'
const description = 'Line one\nLine two <b>literal</b> & "quoted"'
const input: CreateHelpRequestInput = { operationId, mentorId: '', moduleId, title: `  ${title}  `, description: `  ${description}  ` }
const create = httpsCallable<CreateHelpRequestInput, unknown>(getFunctions(app, 'asia-southeast1'), 'createHelpRequest')
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const tupleHash = () => digest([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))
let createdId = ''

beforeAll(async () => {
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(getClientFirestore(app), '127.0.0.1', 8080)
  connectFunctionsEmulator(getFunctions(app, 'asia-southeast1'), '127.0.0.1', 5001)
  const student = (await createUserWithEmailAndPassword(auth, studentEmail, 'Synthetic-123!')).user
  ids.student = student.uid
  await getAdminAuth(admin).updateUser(student.uid, { emailVerified: true })
  await student.reload()
  await getIdToken(student, true)
  ids.mentor = `f01-created-mentor-${crypto.randomUUID()}`
  input.mentorId = ids.mentor
  await db.collection('users').doc(ids.student).set({ id: ids.student, email: studentEmail, displayName: 'Creation Student', role: 'STUDENT', status: 'ACTIVE', createdAt: Timestamp.now() })
  await db.collection('mentors').doc(ids.mentor).set({ id: ids.mentor, email: mentorEmail, displayName: 'Creation Mentor', role: 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'TC006', title: 'Creation module', active: true })
}, 30000)

afterAll(async () => {
  if (createdId) await db.collection('helpRequests').doc(createdId).delete()
  if (ids.student) {
    await db.collection('pendingHelpRequestKeys').doc(tupleHash()).delete()
    await db.collection('helpRequestOperations').doc(ids.student).collection('operations').doc(operationId).delete()
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

describe('F01 successful persisted creation (TC-006)', () => {
  it('fresh-reads the sole pending request and exact server coordination state', async () => {
    const requestQuery = () => db.collection('helpRequests').where('studentId', '==', ids.student).get()
    const requestCountBefore = (await requestQuery()).size
    expect((await db.collection('pendingHelpRequestKeys').doc(tupleHash()).get()).exists).toBe(false)
    expect((await db.collection('helpRequestOperations').doc(ids.student).collection('operations').doc(operationId).get()).exists).toBe(false)
    expect((await db.collection('helpRequestSummaries').doc(ids.student).get()).exists).toBe(false)
    const beforeCall = Date.now()
    const result = createHelpRequestOutputSchema.parse((await create(input)).data)
    const afterCall = Date.now()
    expect(result.kind).toBe('created')
    if (result.kind !== 'created') throw new Error('Expected a created request')
    createdId = result.helpRequest.id
    expect(createdId).not.toBe(operationId)
    expect(createdId).not.toBe(ids.student)
    expect(createdId).not.toBe(ids.mentor)

    const [requests, request, receipt, key, summary] = await Promise.all([
      requestQuery(),
      db.collection('helpRequests').doc(createdId).get(),
      db.collection('helpRequestOperations').doc(ids.student).collection('operations').doc(operationId).get(),
      db.collection('pendingHelpRequestKeys').doc(tupleHash()).get(),
      db.collection('helpRequestSummaries').doc(ids.student).get(),
    ])
    expect(requests.size).toBe(requestCountBefore + 1)
    expect(requests.docs.map((item) => item.id)).toEqual([createdId])
    expect(request.exists).toBe(true)
    const stored = request.data()!
    expect(stored).toEqual({
      id: createdId, studentId: ids.student, mentorId: ids.mentor, moduleId,
      studentDisplayName: 'Creation Student', mentorDisplayName: 'Creation Mentor',
      title, description, status: 'PENDING',
      createdAt: expect.any(Timestamp), updatedAt: expect.any(Timestamp),
    })
    expect(stored.createdAt.isEqual(stored.updatedAt)).toBe(true)
    expect(stored.createdAt.toMillis()).toBeGreaterThanOrEqual(beforeCall)
    expect(stored.createdAt.toMillis()).toBeLessThanOrEqual(afterCall)
    expect(result.helpRequest).toEqual({ ...stored, createdAt: stored.createdAt.toDate().toISOString(), updatedAt: stored.updatedAt.toDate().toISOString() })
    expect(receipt.data()).toEqual({
      studentId: ids.student,
      fingerprint: digest([ids.mentor, moduleId, title, description]),
      kind: 'CREATED', helpRequestId: createdId,
    })
    expect(key.data()).toEqual({ studentId: ids.student, mentorId: ids.mentor, moduleId, helpRequestId: createdId })
    expect(summary.data()).toEqual({ pendingCount: 1, acceptedCount: 0, rejectedCount: 0, openCount: 1, updatedAt: stored.createdAt })

    const sdkRef = doc(getClientFirestore(app), 'helpRequests', createdId)
    expect((await getDocFromServer(sdkRef)).data()).toMatchObject({ studentId: ids.student, mentorId: ids.mentor, moduleId, title, description, status: 'PENDING' })
    await expect(updateDoc(sdkRef, { studentId: 'forged-student', mentorId: 'forged-mentor', moduleId: 'forged-module' })).rejects.toMatchObject({ code: 'permission-denied' })
    expect((await db.collection('helpRequests').doc(createdId).get()).data()).toEqual(stored)
  }, 30000)
})
