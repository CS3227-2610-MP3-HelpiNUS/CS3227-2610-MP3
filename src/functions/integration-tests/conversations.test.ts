import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { AcknowledgeMessageInput, CreateHelpRequestInput, RespondToHelpRequestInput, SendMessageInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f02-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor', 'outsider'] as const
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f02-${role}` }, `f02-${role}`)])) as Record<typeof roles[number], ReturnType<typeof initializeApp>>
const ids: Record<string, string> = {}
const call = <T>(role: typeof roles[number], name: string) => httpsCallable<T, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)
let requestId = ''

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f02-${role}-${crypto.randomUUID()}@example.test`
    ids[role] = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user.uid
    await db.collection('users').doc(ids[role]).set({ id: ids[role], email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: ['f02-module'], active: true })
  await db.collection('modules').doc('f02-module').set({ id: 'f02-module', code: 'CS3227', title: 'Software Engineering', active: true })
}, 30000)

afterAll(async () => {
  if (requestId) {
    const messages = await db.collection('conversations').doc(requestId).collection('messages').get()
    for (const message of messages.docs) await message.ref.delete()
    await db.collection('conversations').doc(requestId).delete()
    await db.collection('helpRequests').doc(requestId).delete()
  }
  if (ids.student) {
    const receipts = await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get()
    for (const receipt of receipts.docs) await receipt.ref.delete()
    await db.collection('helpRequestSummaries').doc(ids.student).delete()
  }
  await db.collection('modules').doc('f02-module').delete()
  if (ids.mentor) await db.collection('mentorProfiles').doc(ids.mentor).delete()
  for (const role of roles) {
    if (ids[role]) { await db.collection('users').doc(ids[role]).delete(); await getAdminAuth(admin).deleteUser(ids[role]) }
    await signOut(getAuth(apps[role])); await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

describe('F02 production acceptance, send and receipt', () => {
  it('accepts atomically and replays the same strict pair', async () => {
    const created = (await call<CreateHelpRequestInput>('student', 'createHelpRequest')({ operationId: crypto.randomUUID(), mentorId: ids.mentor, moduleId: 'f02-module', title: 'A question', description: 'Please explain this.' })).data as { helpRequest: { id: string } }
    requestId = created.helpRequest.id
    const decide = call<RespondToHelpRequestInput>('mentor', 'respondToHelpRequest')
    const input = { operationId: crypto.randomUUID(), helpRequestId: requestId, response: 'ACCEPTED' as const }
    const first = (await decide(input)).data as { kind: string; conversationId: string }
    expect(first).toMatchObject({ kind: 'decided', conversationId: requestId })
    const [parent, pair] = await Promise.all([db.collection('helpRequests').doc(requestId).get(), db.collection('conversations').doc(requestId).get()])
    expect(parent.data()?.status).toBe('ACCEPTED')
    expect(pair.data()).toMatchObject({ id: requestId, helpRequestId: requestId, studentId: ids.student, mentorId: ids.mentor, participantIds: [ids.student, ids.mentor] })
    expect(pair.data()?.createdAt.isEqual(parent.data()?.updatedAt)).toBe(true)
    expect((await decide({ ...input, operationId: crypto.randomUUID() })).data).toMatchObject({ kind: 'already_decided', conversationId: requestId })
    expect((await db.collection('conversations').doc(requestId).get()).data()?.createdAt.isEqual(parent.data()?.updatedAt)).toBe(true)
  }, 30000)

  it('normalizes, replays, and recipient acknowledges without mutating content', async () => {
    const messageId = crypto.randomUUID()
    const send = call<SendMessageInput>('student', 'sendMessage')
    const input = { requestId, messageId, body: '  Line one\nLine two 😀  ' }
    const first = (await send(input)).data as { message: { body: string; senderId: string; readAt: string | null; createdAt: string } }
    expect(first.message).toMatchObject({ body: 'Line one\nLine two 😀', senderId: ids.student, readAt: null })
    expect((await send(input)).data).toEqual(first)
    await expect(send({ ...input, body: 'Changed' })).rejects.toMatchObject({ code: 'functions/already-exists' })
    await expect(call<SendMessageInput>('outsider', 'sendMessage')(input)).rejects.toMatchObject({ code: 'functions/permission-denied' })
    await expect(call<AcknowledgeMessageInput>('student', 'acknowledgeMessage')({ requestId, messageId })).rejects.toMatchObject({ code: 'functions/permission-denied' })
    const receipt = (await call<AcknowledgeMessageInput>('mentor', 'acknowledgeMessage')({ requestId, messageId })).data as { readAt: string }
    expect((await call<AcknowledgeMessageInput>('mentor', 'acknowledgeMessage')({ requestId, messageId })).data).toEqual(receipt)
    expect((await db.collection('conversations').doc(requestId).collection('messages').doc(messageId).get()).data()).toMatchObject({ senderId: ids.student, body: 'Line one\nLine two 😀' })
  }, 30000)
})
