import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore as getClientFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { createHelpRequestOutputSchema, respondToHelpRequestOutputSchema, type CreateHelpRequestInput, type RespondToHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-lost-reply-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-lost-${role}` }, `f01-lost-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const ids: Record<Role, string> = { student: '', mentor: '' }
const moduleId = `f01-lost-module-${crypto.randomUUID()}`
const createOperationId = crypto.randomUUID()
const decisionOperationId = crypto.randomUUID()
let requestId = ''
const tupleHash = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')
const callable = <Input>(role: Role, name: string) => httpsCallable<Input, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)
const decision = (): RespondToHelpRequestInput => ({ operationId: decisionOperationId, helpRequestId: requestId, response: 'ACCEPTED' })

async function state() {
  const [request, conversation, key, summary, receipt, requests, conversations] = await Promise.all([
    db.collection('helpRequests').doc(requestId).get(),
    db.collection('conversations').doc(requestId).get(),
    db.collection('pendingHelpRequestKeys').doc(tupleHash()).get(),
    db.collection('helpRequestSummaries').doc(ids.student).get(),
    db.collection('helpRequestOperations').doc(ids.student).collection('operations').doc(createOperationId).get(),
    db.collection('helpRequests').where('studentId', '==', ids.student).get(),
    db.collection('conversations').where('helpRequestId', '==', requestId).get(),
  ])
  return {
    request: request.data() ?? null, conversation: conversation.data() ?? null,
    key: key.data() ?? null, summary: summary.data() ?? null, receipt: receipt.data() ?? null,
    requestIds: requests.docs.map((item) => item.id).sort(),
    conversationIds: conversations.docs.map((item) => item.id).sort(),
  }
}

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getClientFirestore(apps[role]), '127.0.0.1', 8080)
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f01-lost-${role}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'TC030', title: 'Lost decision reply', active: true })
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

describe('F01 post-commit lost decision reply (TC-030)', () => {
  it('drops the service reply after production commit, then same-ID replay preserves one accepted pair and all timestamps', async () => {
    const created = createHelpRequestOutputSchema.parse((await callable<CreateHelpRequestInput>('student', 'createHelpRequest')({
      operationId: createOperationId, mentorId: ids.mentor, moduleId,
      title: 'Lost reply question', description: 'The decision may commit before the client sees its reply.',
    })).data)
    expect(created.kind).toBe('created')
    if (created.kind !== 'created') throw new Error('Expected a pending request')
    requestId = created.helpRequest.id
    const pending = await state()
    expect(pending.request?.status).toBe('PENDING')
    expect(pending.conversation).toBeNull()
    expect(pending.key).toMatchObject({ helpRequestId: requestId })
    expect(pending.summary).toMatchObject({ pendingCount: 1, acceptedCount: 0, openCount: 1 })

    let committed = false
    const serviceWithDroppedReply = async () => {
      await callable<RespondToHelpRequestInput>('mentor', 'respondToHelpRequest')(decision())
      committed = true
      throw new Error('simulated reply drop after committed callable response')
    }
    await expect(serviceWithDroppedReply()).rejects.toThrow('simulated reply drop')
    expect(committed).toBe(true)
    const accepted = await state()
    expect(accepted.request?.status).toBe('ACCEPTED')
    expect(accepted.conversation).toMatchObject({ id: requestId, helpRequestId: requestId, studentId: ids.student, mentorId: ids.mentor, participantIds: [ids.student, ids.mentor] })
    expect(accepted.conversation?.createdAt.isEqual(accepted.request?.updatedAt)).toBe(true)
    expect(accepted.conversation?.updatedAt.isEqual(accepted.request?.updatedAt)).toBe(true)
    expect(accepted.key).toBeNull()
    expect(accepted.summary).toEqual({ pendingCount: 0, acceptedCount: 1, rejectedCount: 0, openCount: 1, updatedAt: accepted.request?.updatedAt })
    expect(accepted.receipt).toEqual(pending.receipt)
    expect(accepted.request?.createdAt.isEqual(pending.request?.createdAt)).toBe(true)
    expect(accepted.requestIds).toEqual([requestId])
    expect(accepted.conversationIds).toEqual([requestId])
    for (const role of roles) {
      const client = getClientFirestore(apps[role])
      const [request, conversation] = await Promise.all([
        getDocFromServer(doc(client, 'helpRequests', requestId)),
        getDocFromServer(doc(client, 'conversations', requestId)),
      ])
      expect(request.data()?.status).toBe('ACCEPTED')
      expect(conversation.data()?.helpRequestId).toBe(requestId)
    }
    const replay = respondToHelpRequestOutputSchema.parse((await callable<RespondToHelpRequestInput>('mentor', 'respondToHelpRequest')(decision())).data)
    expect(replay).toMatchObject({ kind: 'already_decided', conversationId: requestId, helpRequest: { id: requestId, status: 'ACCEPTED' } })
    expect(await state()).toEqual(accepted)
  }, 30000)
})
