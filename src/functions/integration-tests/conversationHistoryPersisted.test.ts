import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, connectFirestoreEmulator, doc, documentId, getDocFromServer, getDocsFromServer, getFirestore as getClientFirestore, limit, orderBy, query } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { AcknowledgeMessageInput, CreateHelpRequestInput, RespondToHelpRequestInput, SendMessageInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f02-history-persisted-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor'] as const
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f02-history-${role}` }, `f02-history-${role}`)])) as Record<typeof roles[number], ReturnType<typeof initializeApp>>
const ids: Record<string, string> = {}
const emails: Record<string, string> = {}
const moduleId = `f02-history-module-${crypto.randomUUID()}`
let requestId = ''
const call = <T>(role: typeof roles[number], name: string) => httpsCallable<T, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)
const keyId = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getClientFirestore(apps[role]), '127.0.0.1', 8080)
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f02-history-${role}-${crypto.randomUUID()}@example.test`
    emails[role] = email
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'CS3227', title: 'Software Engineering', active: true })
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  const created = (await call<CreateHelpRequestInput>('student', 'createHelpRequest')({ operationId: crypto.randomUUID(), mentorId: ids.mentor, moduleId, title: 'Persisted history', description: 'Reload and sign in later' })).data as { helpRequest: { id: string } }
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
    if (ids[role]) { await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(ids[role]).delete(); await getAdminAuth(admin).deleteUser(ids[role]) }
    await signOut(getAuth(apps[role]))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

describe('F02 saved history after later sign-in (TC-019)', () => {
  it('returns server body/readAt in a fresh client and never treats a local-only ID as saved history', async () => {
    const messageId = crypto.randomUUID()
    const localOnlyId = crypto.randomUUID()
    const body = 'Persisted body after later sign-in'
    const first = (await call<SendMessageInput>('student', 'sendMessage')({ requestId, messageId, body })).data as { message: { id: string; body: string; readAt: null; createdAt: string } }
    const receipt = (await call<AcknowledgeMessageInput>('mentor', 'acknowledgeMessage')({ requestId, messageId })).data as { readAt: string }
    const before = (await db.collection('conversations').doc(requestId).collection('messages').get()).docs.map((item) => ({ id: item.id, data: item.data() }))
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({ id: messageId, data: { body, readAt: expect.any(Timestamp) } })
    expect((before[0]!.data.readAt as Timestamp).toDate().toISOString()).toBe(receipt.readAt)
    expect(first.message).toMatchObject({ id: messageId, body, readAt: null })

    const later = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'f02-history-later' }, `f02-history-later-${crypto.randomUUID()}`)
    const laterAuth = getAuth(later)
    connectAuthEmulator(laterAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
    const laterDb = getClientFirestore(later)
    connectFirestoreEmulator(laterDb, '127.0.0.1', 8080)
    try {
      await signInWithEmailAndPassword(laterAuth, emails.student, 'Synthetic-123!')
      await getIdToken(laterAuth.currentUser!, true)
      const savedRef = doc(laterDb, 'conversations', requestId, 'messages', messageId)
      const localOnlyRef = doc(laterDb, 'conversations', requestId, 'messages', localOnlyId)
      const fromServer = await getDocFromServer(savedRef)
      expect(fromServer.metadata.fromCache).toBe(false)
      expect(fromServer.data()).toMatchObject({ body, senderId: ids.student, readAt: expect.anything() })
      expect(fromServer.data()!.createdAt.toDate().toISOString()).toBe(first.message.createdAt)
      expect(fromServer.data()!.readAt.toDate().toISOString()).toBe(receipt.readAt)
      expect((await getDocFromServer(localOnlyRef)).exists()).toBe(false)
      const page = await getDocsFromServer(query(collection(laterDb, 'conversations', requestId, 'messages'), orderBy('createdAt', 'desc'), limit(20)))
      expect(page.docs.map((item) => item.id)).toEqual([messageId])
      expect(page.docs[0]!.data().body).toBe(body)
      expect((await db.collection('conversations').doc(requestId).collection('messages').get()).docs.map((item) => ({ id: item.id, data: item.data() }))).toEqual(before)
    } finally { await signOut(laterAuth); await deleteApp(later) }
  }, 30000)
})

describe('F02 independent send IDs and server reconciliation (TC-021/022)', () => {
  it('persists several concurrent intentions once each at authoritative time-and-ID order (TC-021)', async () => {
    const inputs = ['Concurrent first', 'Concurrent second', 'Concurrent third'].map((body) => ({ requestId, messageId: crypto.randomUUID(), body }))
    const send = call<SendMessageInput>('student', 'sendMessage')
    const replies = await Promise.all(inputs.map(async (input) => (await send(input)).data as { message: { id: string; body: string; createdAt: string } }))
    const records = await Promise.all(inputs.map(async (input) => ({ id: input.messageId, data: (await db.collection('conversations').doc(requestId).collection('messages').doc(input.messageId).get()).data()! })))
    expect(new Set(inputs.map((input) => input.messageId)).size).toBe(3)
    for (const [index, input] of inputs.entries()) {
      expect(records[index]).toMatchObject({ id: input.messageId, data: { body: input.body, senderId: ids.student, createdAt: expect.any(Timestamp), readAt: null } })
      expect(replies[index]!.message).toMatchObject({ id: input.messageId, body: input.body, createdAt: records[index]!.data.createdAt.toDate().toISOString() })
    }
    const expected = [...records].sort((a, b) => a.data.createdAt.toMillis() - b.data.createdAt.toMillis() || a.id.localeCompare(b.id)).map((item) => item.id)
    const client = getClientFirestore(apps.student)
    const page = await getDocsFromServer(query(collection(client, 'conversations', requestId, 'messages'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20)))
    const selected = page.docs.filter((item) => inputs.some((input) => input.messageId === item.id)).map((item) => item.id)
    expect(selected).toEqual([...expected].reverse())
    expect(new Set(selected).size).toBe(3)
  }, 30000)

  it('proves one saved ID and one unresolved ID separately before same-ID replay and live-page merge (TC-022)', async () => {
    const savedInput = { requestId, messageId: crypto.randomUUID(), body: 'Saved reload record' }
    const unresolvedInput = { requestId, messageId: crypto.randomUUID(), body: 'Unresolved reload record' }
    const send = call<SendMessageInput>('student', 'sendMessage')
    const savedReply = (await send(savedInput)).data as { message: { id: string; body: string; createdAt: string } }
    const client = getClientFirestore(apps.student)
    const savedRef = doc(client, 'conversations', requestId, 'messages', savedInput.messageId)
    const unresolvedRef = doc(client, 'conversations', requestId, 'messages', unresolvedInput.messageId)
    expect((await getDocFromServer(savedRef)).data()).toMatchObject({ body: savedInput.body, senderId: ids.student })
    expect((await getDocFromServer(unresolvedRef)).exists()).toBe(false)
    const before = (await db.collection('conversations').doc(requestId).collection('messages').get()).docs.map((item) => ({ id: item.id, data: item.data() }))
    const result = (await send(unresolvedInput)).data as { message: { id: string; body: string; createdAt: string } }
    expect(result.message).toMatchObject({ id: unresolvedInput.messageId, body: unresolvedInput.body })
    expect((await send(savedInput)).data).toEqual(savedReply)
    expect((await send(unresolvedInput)).data).toEqual(result)
    const after = (await db.collection('conversations').doc(requestId).collection('messages').get()).docs.map((item) => ({ id: item.id, data: item.data() }))
    expect(after).toHaveLength(before.length + 1)
    expect(after.filter((item) => item.id === savedInput.messageId)).toHaveLength(1)
    expect(after.filter((item) => item.id === unresolvedInput.messageId)).toHaveLength(1)
    expect(after.find((item) => item.id === savedInput.messageId)).toEqual(before.find((item) => item.id === savedInput.messageId))
    expect(after.find((item) => item.id === unresolvedInput.messageId)?.data.createdAt.toDate().toISOString()).toBe(result.message.createdAt)
    const page = await getDocsFromServer(query(collection(client, 'conversations', requestId, 'messages'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20)))
    expect(page.docs.filter((item) => [savedInput.messageId, unresolvedInput.messageId].includes(item.id)).map((item) => item.id).sort()).toEqual([savedInput.messageId, unresolvedInput.messageId].sort())
  }, 30000)
})
