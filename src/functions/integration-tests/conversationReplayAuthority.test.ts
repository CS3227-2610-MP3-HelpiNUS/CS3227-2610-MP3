import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, getDocFromServer, getFirestore as getClientFirestore, setDoc } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { CreateHelpRequestInput, RespondToHelpRequestInput, SendMessageInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f02-replay-authority-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor'] as const
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f02-replay-${role}` }, `f02-replay-${role}`)])) as Record<typeof roles[number], ReturnType<typeof initializeApp>>
const ids: Record<string, string> = {}
const requestIds: string[] = []
const moduleId = `f02-replay-module-${crypto.randomUUID()}`
const call = <T>(role: typeof roles[number], name: string) => httpsCallable<T, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)
const keyId = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getClientFirestore(apps[role]), '127.0.0.1', 8080)
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f02-replay-${role}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'CS3227', title: 'Software Engineering', active: true })
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  for (const index of [1, 2]) {
    const created = (await call<CreateHelpRequestInput>('student', 'createHelpRequest')({ operationId: crypto.randomUUID(), mentorId: ids.mentor, moduleId, title: `Replay request ${index}`, description: 'Current accepted parent' })).data as { helpRequest: { id: string } }
    const requestId = created.helpRequest.id
    requestIds.push(requestId)
    const accepted = (await call<RespondToHelpRequestInput>('mentor', 'respondToHelpRequest')({ operationId: crypto.randomUUID(), helpRequestId: requestId, response: 'ACCEPTED' })).data as { kind: string; conversationId: string }
    expect(accepted).toMatchObject({ kind: 'decided', conversationId: requestId })
  }
}, 30000)

afterAll(async () => {
  for (const requestId of requestIds) {
    const messages = await db.collection('conversations').doc(requestId).collection('messages').get()
    for (const message of messages.docs) await message.ref.delete()
    await db.collection('conversations').doc(requestId).delete()
    await db.collection('helpRequests').doc(requestId).delete()
  }
  if (ids.student) {
    const operations = await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get()
    for (const operation of operations.docs) await operation.ref.delete()
    await db.collection('pendingHelpRequestKeys').doc(keyId()).delete()
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

describe('F02 replay authority (TC-033)', () => {
  it('denies revoked same-ID replay, preserves divergent-content identity, and authorizes a new intention only on its current parent', async () => {
    const [firstId, secondId] = requestIds
    const firstMessageId = crypto.randomUUID()
    const originalInput = { requestId: firstId, messageId: firstMessageId, body: 'Original immutable text' }
    const sendStudent = call<SendMessageInput>('student', 'sendMessage')
    const first = (await sendStudent(originalInput)).data as { message: { id: string; senderId: string; body: string; createdAt: string } }
    const firstMessage = db.collection('conversations').doc(firstId).collection('messages').doc(firstMessageId)
    expect((await firstMessage.get()).data()).toMatchObject({ senderId: ids.student, body: originalInput.body, createdAt: expect.any(Timestamp), readAt: null })
    const studentRef = db.collection('users').doc(ids.student)
    const refs = [
      ...requestIds.map((id) => db.collection('helpRequests').doc(id)),
      db.collection('pendingHelpRequestKeys').doc(keyId()),
      db.collection('helpRequestSummaries').doc(ids.student),
      ...requestIds.map((id) => db.collection('conversations').doc(id)),
      studentRef,
    ]
    const snapshot = async () => ({
      state: await Promise.all(refs.map(async (ref) => (await ref.get()).data() ?? null)),
      messages: await Promise.all(requestIds.map(async (id) => (await db.collection('conversations').doc(id).collection('messages').get()).docs.map((item) => ({ id: item.id, data: item.data() })))),
    })
    const originalUser = (await studentRef.get()).data()!
    await studentRef.update({ status: 'SUSPENDED' })
    try {
      const revoked = await snapshot()
      await expect(sendStudent(originalInput)).rejects.toMatchObject({ code: 'functions/permission-denied' })
      const studentDb = getClientFirestore(apps.student)
      await expect(getDoc(doc(studentDb, 'conversations', firstId, 'messages', firstMessageId))).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(setDoc(doc(studentDb, 'conversations', secondId, 'messages', firstMessageId), { senderId: ids.student, body: 'Retargeted direct write', createdAt: new Date(), readAt: null })).rejects.toMatchObject({ code: 'permission-denied' })
      expect(await snapshot()).toEqual(revoked)
    } finally { await studentRef.set(originalUser) }
    await getAdminAuth(admin).updateUser(ids.student, { disabled: true })
    try {
      const disabled = await snapshot()
      await expect(sendStudent(originalInput)).rejects.toMatchObject({ code: expect.stringMatching(/^functions\/(permission-denied|unauthenticated)$/u) })
      expect(await snapshot()).toEqual(disabled)
    } finally { await getAdminAuth(admin).updateUser(ids.student, { disabled: false }) }
    const beforeConflicts = await snapshot()
    await expect(sendStudent({ ...originalInput, body: 'Edited same-ID body' })).rejects.toMatchObject({ code: 'functions/already-exists' })
    await expect(call<SendMessageInput>('mentor', 'sendMessage')(originalInput)).rejects.toMatchObject({ code: 'functions/already-exists' })
    expect(await snapshot()).toEqual(beforeConflicts)
    expect((await sendStudent(originalInput)).data).toEqual(first)
    expect(await snapshot()).toEqual(beforeConflicts)
    const newId = crypto.randomUUID()
    expect(newId).not.toBe(firstMessageId)
    const newBody = 'Edited as a separate intention'
    const second = (await sendStudent({ requestId: secondId, messageId: newId, body: newBody })).data as { message: { id: string; conversationId: string; senderId: string; body: string; createdAt: string } }
    const secondMessage = (await db.collection('conversations').doc(secondId).collection('messages').doc(newId).get()).data()!
    expect(second.message).toMatchObject({ id: newId, conversationId: secondId, senderId: ids.student, body: newBody })
    expect(secondMessage).toMatchObject({ senderId: ids.student, body: newBody, createdAt: expect.any(Timestamp), readAt: null })
    expect(second.message.createdAt).toBe(secondMessage.createdAt.toDate().toISOString())
    const afterNew = await snapshot()
    expect(afterNew.state).toEqual(beforeConflicts.state)
    expect(afterNew.messages[0]).toEqual(beforeConflicts.messages[0])
    expect(afterNew.messages[1]).toEqual([{ id: newId, data: secondMessage }])
  }, 60000)

  it('recovers an unobserved committed send by server proof and same-ID current-auth replay without changing its timestamp (TC-031)', async () => {
    const requestId = requestIds[0]
    const messageId = crypto.randomUUID()
    const input = { requestId, messageId, body: 'One committed intention with a lost reply' }
    const parent = db.collection('helpRequests').doc(requestId)
    const key = db.collection('pendingHelpRequestKeys').doc(keyId())
    const summary = db.collection('helpRequestSummaries').doc(ids.student)
    const pair = db.collection('conversations').doc(requestId)
    const messages = pair.collection('messages')
    const snapshot = async () => ({
      state: await Promise.all([parent, key, summary, pair].map(async (ref) => (await ref.get()).data() ?? null)),
      messages: (await messages.get()).docs.map((item) => ({ id: item.id, data: item.data() })),
    })
    const before = await snapshot()
    const send = call<SendMessageInput>('student', 'sendMessage')
    const droppedReply = async () => {
      await send(input)
      throw Object.assign(new Error('Committed reply was not delivered to the UI'), { code: 'unavailable' })
    }
    await expect(droppedReply()).rejects.toMatchObject({ code: 'unavailable' })
    const afterCommit = await snapshot()
    const stored = (await messages.doc(messageId).get()).data()!
    expect(stored).toEqual({ senderId: ids.student, body: input.body, createdAt: expect.any(Timestamp), readAt: null })
    expect(afterCommit.state).toEqual(before.state)
    expect(afterCommit.messages).toEqual([...before.messages, { id: messageId, data: stored }].sort((a, b) => a.id.localeCompare(b.id)))
    const clientMessage = await getDocFromServer(doc(getClientFirestore(apps.student), 'conversations', requestId, 'messages', messageId))
    expect(clientMessage.exists()).toBe(true)
    expect(clientMessage.data()).toMatchObject({ senderId: ids.student, body: input.body, readAt: null })
    expect(clientMessage.data()!.createdAt.toMillis()).toBe(stored.createdAt.toMillis())

    const replay = (await send(input)).data as { message: { id: string; conversationId: string; senderId: string; body: string; createdAt: string; readAt: null } }
    expect(replay.message).toEqual({ id: messageId, conversationId: requestId, senderId: ids.student,
      body: input.body, createdAt: stored.createdAt.toDate().toISOString(), readAt: null })
    expect(await snapshot()).toEqual(afterCommit)
    await expect(setDoc(doc(getClientFirestore(apps.student), 'conversations', requestId, 'messages', messageId), {
      body: 'Hostile client overwrite',
    }, { merge: true })).rejects.toMatchObject({ code: 'permission-denied' })
    expect(await snapshot()).toEqual(afterCommit)
  }, 30000)
})
