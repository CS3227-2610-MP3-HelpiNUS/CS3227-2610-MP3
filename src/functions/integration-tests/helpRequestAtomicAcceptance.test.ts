import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore as getClientFirestore, setDoc } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { createHelpRequestOutputSchema, respondToHelpRequestOutputSchema, type CreateHelpRequestInput, type RespondToHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-atomic-acceptance-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor', 'outsider'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-atomic-${role}` }, `f01-atomic-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const ids: Record<Role, string> = { student: '', mentor: '', outsider: '' }
const moduleId = `f01-atomic-module-${crypto.randomUUID()}`
const createOperationId = crypto.randomUUID()
const decisionOperationId = crypto.randomUUID()
let requestId = ''
const tupleHash = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')
const callable = <T>(role: Role, name: string) => httpsCallable<T, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)
const refs = () => ({
  request: db.collection('helpRequests').doc(requestId),
  conversation: db.collection('conversations').doc(requestId),
  key: db.collection('pendingHelpRequestKeys').doc(tupleHash()),
  summary: db.collection('helpRequestSummaries').doc(ids.student),
  receipt: db.collection('helpRequestOperations').doc(ids.student).collection('operations').doc(createOperationId),
})

async function state() {
  const r = refs()
  const [request, conversation, key, summary, receipt] = await Promise.all([r.request.get(), r.conversation.get(), r.key.get(), r.summary.get(), r.receipt.get()])
  return { request: request.data() ?? null, conversation: conversation.data() ?? null, key: key.data() ?? null, summary: summary.data() ?? null, receipt: receipt.data() ?? null }
}

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getClientFirestore(apps[role]), '127.0.0.1', 8080)
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f01-atomic-${role}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'TC029', title: 'Atomic acceptance', active: true })
}, 30000)

afterAll(async () => {
  if (requestId) {
    await db.collection('conversations').doc(requestId).delete()
    await db.collection('helpRequests').doc(requestId).delete()
  }
  if (ids.student) {
    await db.collection('pendingHelpRequestKeys').doc(tupleHash()).delete()
    await db.collection('helpRequestOperations').doc(ids.student).collection('operations').doc(createOperationId).delete()
    await db.collection('helpRequestSummaries').doc(ids.student).delete()
  }
  await db.collection('modules').doc(moduleId).delete()
  if (ids.mentor) await db.collection('mentorProfiles').doc(ids.mentor).delete()
  for (const role of roles) {
    if (ids[role]) { await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(ids[role]).delete(); await getAdminAuth(admin).deleteUser(ids[role]) }
    await signOut(getAuth(apps[role]))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

describe('F01/F02 atomic acceptance (TC-029)', () => {
  it('moves the pending parent and exact same-ID conversation in one production decision with Rules-backed participant reads', async () => {
    const created = createHelpRequestOutputSchema.parse((await callable<CreateHelpRequestInput>('student', 'createHelpRequest')({
      operationId: createOperationId, mentorId: ids.mentor, moduleId,
      title: 'Atomic question', description: 'A pending request becomes accepted with its conversation.',
    })).data)
    expect(created.kind).toBe('created')
    if (created.kind !== 'created') throw new Error('Expected pending parent')
    requestId = created.helpRequest.id
    const pending = await state()
    expect(pending.request?.status).toBe('PENDING')
    expect(pending.conversation).toBeNull()
    expect(pending.key).toEqual({ studentId: ids.student, mentorId: ids.mentor, moduleId, helpRequestId: requestId })
    expect(pending.summary).toEqual({ pendingCount: 1, acceptedCount: 0, rejectedCount: 0, openCount: 1, updatedAt: pending.request?.createdAt })
    expect(pending.receipt).toMatchObject({ studentId: ids.student, kind: 'CREATED', helpRequestId: requestId })

    const acceptedOutput = respondToHelpRequestOutputSchema.parse((await callable<RespondToHelpRequestInput>('mentor', 'respondToHelpRequest')({
      operationId: decisionOperationId, helpRequestId: requestId, response: 'ACCEPTED',
    })).data)
    expect(acceptedOutput).toMatchObject({ kind: 'decided', conversationId: requestId, helpRequest: { id: requestId, status: 'ACCEPTED' } })
    const accepted = await state()
    expect(accepted.request).toEqual({ ...pending.request, status: 'ACCEPTED', updatedAt: expect.any(Timestamp) })
    expect(accepted.request?.updatedAt.toMillis()).toBeGreaterThanOrEqual(pending.request?.updatedAt.toMillis())
    expect(accepted.conversation).toEqual({
      id: requestId, helpRequestId: requestId, studentId: ids.student, mentorId: ids.mentor,
      participantIds: [ids.student, ids.mentor],
      createdAt: accepted.request?.updatedAt, updatedAt: accepted.request?.updatedAt,
    })
    expect(accepted.conversation?.createdAt.isEqual(accepted.request?.updatedAt)).toBe(true)
    expect(accepted.conversation?.updatedAt.isEqual(accepted.request?.updatedAt)).toBe(true)
    expect(accepted.key).toBeNull()
    expect(accepted.summary).toEqual({ pendingCount: 0, acceptedCount: 1, rejectedCount: 0, openCount: 1, updatedAt: accepted.request?.updatedAt })
    expect(accepted.receipt).toEqual(pending.receipt)
    expect(acceptedOutput.kind === 'decided' && acceptedOutput.helpRequest.updatedAt).toBe(accepted.request?.updatedAt.toDate().toISOString())

    for (const role of ['student', 'mentor'] as const) {
      const client = getClientFirestore(apps[role])
      const [parent, conversation] = await Promise.all([
        getDocFromServer(doc(client, 'helpRequests', requestId)),
        getDocFromServer(doc(client, 'conversations', requestId)),
      ])
      expect(parent.data()).toMatchObject({ id: requestId, status: 'ACCEPTED', studentId: ids.student, mentorId: ids.mentor })
      expect(conversation.data()).toMatchObject({ id: requestId, helpRequestId: requestId, studentId: ids.student, mentorId: ids.mentor, participantIds: [ids.student, ids.mentor] })
    }
    await expect(getDocFromServer(doc(getClientFirestore(apps.outsider), 'conversations', requestId))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(setDoc(doc(getClientFirestore(apps.mentor), 'conversations', requestId), { studentId: ids.outsider }, { merge: true })).rejects.toMatchObject({ code: 'permission-denied' })
    expect(await state()).toEqual(accepted)
  }, 30000)
})
