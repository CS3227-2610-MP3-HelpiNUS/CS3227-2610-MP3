import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { collection, connectFirestoreEmulator, disableNetwork, doc, documentId, enableNetwork, getDocFromServer, getDocs, getDocsFromCache, getFirestore as getClientFirestore, limit, orderBy, query } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { CreateHelpRequestInput, RespondToHelpRequestInput, SendMessageInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f02-offline-retry-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor'] as const
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f02-offline-${role}` }, `f02-offline-${role}`)])) as Record<typeof roles[number], ReturnType<typeof initializeApp>>
const ids: Record<string, string> = {}
const moduleId = `f02-offline-module-${crypto.randomUUID()}`
let requestId = ''
const call = <T>(role: typeof roles[number], name: string) => httpsCallable<T, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)
const keyId = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getClientFirestore(apps[role]), '127.0.0.1', 8080)
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f02-offline-${role}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection('users').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'CS3227', title: 'Software Engineering', active: true })
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  const created = (await call<CreateHelpRequestInput>('student', 'createHelpRequest')({ operationId: crypto.randomUUID(), mentorId: ids.mentor, moduleId, title: 'Offline retry', description: 'Server proof before replay' })).data as { helpRequest: { id: string } }
  requestId = created.helpRequest.id
  const accepted = (await call<RespondToHelpRequestInput>('mentor', 'respondToHelpRequest')({ operationId: crypto.randomUUID(), helpRequestId: requestId, response: 'ACCEPTED' })).data as { kind: string; conversationId: string }
  expect(accepted).toMatchObject({ kind: 'decided', conversationId: requestId })
}, 30000)

afterAll(async () => {
  if (requestId) {
    const messages = await db.collection('conversations').doc(requestId).collection('messages').get()
    for (const item of messages.docs) await item.ref.delete()
    await db.collection('conversations').doc(requestId).delete()
    await db.collection('helpRequests').doc(requestId).delete()
  }
  if (ids.student) {
    const operations = await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get()
    for (const item of operations.docs) await item.ref.delete()
    await db.collection('pendingHelpRequestKeys').doc(keyId()).delete()
    await db.collection('helpRequestSummaries').doc(ids.student).delete()
  }
  await db.collection('modules').doc(moduleId).delete()
  if (ids.mentor) await db.collection('mentorProfiles').doc(ids.mentor).delete()
  for (const role of roles) {
    if (ids[role]) { await db.collection('users').doc(ids[role]).delete(); await getAdminAuth(admin).deleteUser(ids[role]) }
    await signOut(getAuth(apps[role]))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

describe('F02 offline retry server proof (TC-032)', () => {
  it('does not replay on cached absence, then proves absence and current access from the server before one same-ID send', async () => {
    const messageId = crypto.randomUUID()
    const input = { requestId, messageId, body: 'One offline intention' }
    const studentDb = getClientFirestore(apps.student)
    const parentRef = doc(studentDb, 'helpRequests', requestId)
    const pairRef = doc(studentDb, 'conversations', requestId)
    const messageRef = doc(studentDb, 'conversations', requestId, 'messages', messageId)
    const messagesQuery = query(collection(studentDb, 'conversations', requestId, 'messages'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20))
    const parent = db.collection('helpRequests').doc(requestId)
    const pair = db.collection('conversations').doc(requestId)
    const snapshot = async () => ({
      state: await Promise.all([parent, db.collection('pendingHelpRequestKeys').doc(keyId()), db.collection('helpRequestSummaries').doc(ids.student), pair].map(async (ref) => (await ref.get()).data() ?? null)),
      messages: (await pair.collection('messages').get()).docs.map((item) => ({ id: item.id, data: item.data() })),
    })
    const before = await snapshot()
    expect((await getDocFromServer(parentRef)).data()).toMatchObject({ id: requestId, status: 'ACCEPTED' })
    expect((await getDocFromServer(pairRef)).data()).toMatchObject({ id: requestId, helpRequestId: requestId })
    expect((await getDocFromServer(messageRef)).exists()).toBe(false)
    expect((await getDocs(messagesQuery)).empty).toBe(true)

    await disableNetwork(studentDb)
    try {
      const cached = await getDocsFromCache(messagesQuery)
      expect(cached.empty).toBe(true)
      expect(cached.metadata.fromCache).toBe(true)
      await expect(getDocFromServer(messageRef)).rejects.toMatchObject({ code: 'unavailable' })
      expect(await snapshot()).toEqual(before)
    } finally { await enableNetwork(studentDb) }

    expect((await getDocFromServer(messageRef)).exists()).toBe(false)
    expect((await getDocFromServer(parentRef)).data()).toMatchObject({ id: requestId, status: 'ACCEPTED', studentId: ids.student, mentorId: ids.mentor })
    expect((await getDocFromServer(pairRef)).data()).toMatchObject({ id: requestId, helpRequestId: requestId, studentId: ids.student, mentorId: ids.mentor })
    expect(await snapshot()).toEqual(before)

    const send = call<SendMessageInput>('student', 'sendMessage')
    const first = (await send(input)).data as { message: { id: string; senderId: string; body: string; createdAt: string; readAt: null } }
    const stored = (await pair.collection('messages').doc(messageId).get()).data()!
    expect(stored).toEqual({ senderId: ids.student, body: input.body, createdAt: expect.any(Timestamp), readAt: null })
    expect(first.message).toMatchObject({ id: messageId, senderId: ids.student, body: input.body, createdAt: stored.createdAt.toDate().toISOString(), readAt: null })
    const after = await snapshot()
    expect(after.state).toEqual(before.state)
    expect(after.messages).toEqual([{ id: messageId, data: stored }])
    expect((await send(input)).data).toEqual(first)
    expect(await snapshot()).toEqual(after)
  }, 30000)
})
