import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { collection, connectFirestoreEmulator, deleteDoc, disableNetwork, doc, documentId, enableNetwork, getDoc, getDocs, getFirestore as getClientFirestore, limit, onSnapshot, orderBy, query, setDoc, startAfter, updateDoc, where } from 'firebase/firestore'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { messageIdSchema, type AcknowledgeMessageInput, type CreateHelpRequestInput, type RespondToHelpRequestInput, type SendMessageInput } from '@helpinus/shared'

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
    connectFirestoreEmulator(getClientFirestore(apps[role]), '127.0.0.1', 8080)
    const email = `f02-${role}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
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

  it('persists one normalized multiline send per authenticated participant without changing acceptance state (TC-023)', async () => {
    const parentRef = db.collection('helpRequests').doc(requestId)
    const pairRef = db.collection('conversations').doc(requestId)
    const summaryRef = db.collection('helpRequestSummaries').doc(ids.student)
    const tuple = [ids.student, ids.mentor, 'f02-module'].map((part) => `${part.length}:${part}`)
    const keyId = createHash('sha256').update(JSON.stringify(tuple)).digest('hex')
    const keyRef = db.collection('pendingHelpRequestKeys').doc(keyId)
    const messages = pairRef.collection('messages')
    const stableSnapshot = async () => Promise.all([parentRef, keyRef, summaryRef, pairRef].map(async (ref) => (await ref.get()).data() ?? null))
    const before = await stableSnapshot()
    expect(before[0]).toMatchObject({ id: requestId, status: 'ACCEPTED' })
    expect(before[1]).toBeNull()
    expect(before[3]).toMatchObject({ id: requestId, participantIds: [ids.student, ids.mentor] })
    const sentIds: string[] = []

    for (const { role, input, body } of [
      { role: 'student' as const, input: '  First line  \n  Student keeps inner spaces  \nThird line  ', body: 'First line  \n  Student keeps inner spaces  \nThird line' },
      { role: 'mentor' as const, input: '\n  Mentor line one\n\n  Mentor line two  \n ', body: 'Mentor line one\n\n  Mentor line two' },
    ]) {
      const messageId = crypto.randomUUID()
      expect(messageIdSchema.safeParse(messageId).success).toBe(true)
      const countBefore = (await messages.get()).size
      expect((await messages.doc(messageId).get()).exists).toBe(false)
      const result = (await call<SendMessageInput>(role, 'sendMessage')({ requestId, messageId, body: input })).data as {
        message: { id: string; conversationId: string; senderId: string; body: string; createdAt: string; readAt: null }
      }
      const stored = (await messages.doc(messageId).get()).data()!
      expect(result.message).toMatchObject({ id: messageId, conversationId: requestId, senderId: ids[role], body, readAt: null })
      expect(stored).toEqual({ senderId: ids[role], body, createdAt: expect.any(Timestamp), readAt: null })
      expect(result.message.createdAt).toBe(stored.createdAt.toDate().toISOString())
      expect((await messages.get()).size).toBe(countBefore + 1)
      const acrossConversations = (await db.collectionGroup('messages').get()).docs.filter((item) => item.id === messageId)
      expect(acrossConversations.map((item) => item.ref.path)).toEqual([messages.doc(messageId).path])
      expect(await stableSnapshot()).toEqual(before)
      sentIds.push(messageId)
    }
    expect(new Set(sentIds).size).toBe(2)
  }, 30000)

  it('enforces message boundaries and sender authority for both participants without partial writes (TC-023, 024, 026)', async () => {
    const parentBefore = (await db.collection('helpRequests').doc(requestId).get()).data()!
    const pairBefore = (await db.collection('conversations').doc(requestId).get()).data()!
    const summaryBefore = (await db.collection('helpRequestSummaries').doc(ids.student).get()).data()!
    const sendStudent = call<SendMessageInput>('student', 'sendMessage')
    const sendMentor = call<SendMessageInput>('mentor', 'sendMessage')
    const messages = db.collection('conversations').doc(requestId).collection('messages')
    const valid = [
      { role: 'student' as const, body: `  ${'😀'.repeat(4000)}  `, expected: '😀'.repeat(4000) },
      { role: 'mentor' as const, body: '  First line\n  Second line  ', expected: 'First line\n  Second line' },
    ]
    for (const item of valid) {
      const messageId = crypto.randomUUID()
      const result = (await (item.role === 'student' ? sendStudent : sendMentor)({ requestId, messageId, body: item.body })).data as { message: { senderId: string; body: string; readAt: null } }
      expect(result.message).toMatchObject({ senderId: ids[item.role], body: item.expected, readAt: null })
      const stored = (await messages.doc(messageId).get()).data()!
      expect(stored).toMatchObject({ senderId: ids[item.role], body: item.expected, readAt: null })
      expect(stored.createdAt).toBeInstanceOf(Timestamp)
    }
    const countBefore = (await messages.get()).size
    for (const body of ['', ' \t\n ', '😀'.repeat(4001)]) {
      await expect(sendStudent({ requestId, messageId: crypto.randomUUID(), body })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    }
    const forged = { requestId, messageId: crypto.randomUUID(), body: 'Forged', senderId: ids.mentor, createdAt: '2020-01-01T00:00:00Z' }
    await expect(sendStudent(forged as never)).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    expect((await messages.get()).size).toBe(countBefore)
    expect((await db.collection('helpRequests').doc(requestId).get()).data()).toEqual(parentBefore)
    expect((await db.collection('conversations').doc(requestId).get()).data()).toEqual(pairBefore)
    expect((await db.collection('helpRequestSummaries').doc(ids.student).get()).data()).toEqual(summaryBefore)
  }, 30000)

  it('aligns callable Unicode boundaries and direct SDK denial with exact no-write snapshots (TC-024)', async () => {
    const parent = db.collection('helpRequests').doc(requestId)
    const pair = db.collection('conversations').doc(requestId)
    const summary = db.collection('helpRequestSummaries').doc(ids.student)
    const tuple = [ids.student, ids.mentor, 'f02-module'].map((part) => `${part.length}:${part}`)
    const key = db.collection('pendingHelpRequestKeys').doc(createHash('sha256').update(JSON.stringify(tuple)).digest('hex'))
    const messages = pair.collection('messages')
    const snapshot = async () => ({
      state: await Promise.all([parent, key, summary, pair].map(async (ref) => (await ref.get()).data() ?? null)),
      messages: (await messages.get()).docs.map((item) => ({ id: item.id, data: item.data() })),
    })
    const send = call<SendMessageInput>('student', 'sendMessage')
    const stable = (await snapshot()).state
    for (const body of [`  ${'a'.repeat(3999)}😀  `, `  ${'😀'.repeat(4000)}  `, '  First  line\n\n  Second line  ']) {
      const messageId = crypto.randomUUID()
      const before = await snapshot()
      const expected = body.trim()
      const response = (await send({ requestId, messageId, body })).data as { message: { body: string; createdAt: string } }
      const stored = (await messages.doc(messageId).get()).data()!
      expect(response.message.body).toBe(expected)
      expect(stored).toEqual({ senderId: ids.student, body: expected, createdAt: expect.any(Timestamp), readAt: null })
      expect(response.message.createdAt).toBe(stored.createdAt.toDate().toISOString())
      const after = await snapshot()
      expect(after.state).toEqual(stable)
      expect(after.messages.length).toBe(before.messages.length + 1)
      expect(after.messages.filter((item) => item.id === messageId)).toHaveLength(1)
    }
    for (const body of ['', ' \t\n ', `  ${'a'.repeat(3999)}😀😀  `, `  ${'😀'.repeat(4001)}  `, 42, null]) {
      const messageId = crypto.randomUUID()
      const before = await snapshot()
      await expect(send({ requestId, messageId, body } as SendMessageInput)).rejects.toMatchObject({ code: 'functions/invalid-argument' })
      expect((await messages.doc(messageId).get()).exists).toBe(false)
      expect(await snapshot()).toEqual(before)
    }
    for (const role of ['student', 'mentor'] as const) {
      const clientDb = getClientFirestore(apps[role])
      for (const body of ['Valid direct message', '😀'.repeat(4001)]) {
        const messageId = crypto.randomUUID()
        const before = await snapshot()
        await expect(setDoc(doc(clientDb, 'conversations', requestId, 'messages', messageId), {
          senderId: ids[role], body, createdAt: new Date(), readAt: null,
        })).rejects.toMatchObject({ code: 'permission-denied' })
        expect((await messages.doc(messageId).get()).exists).toBe(false)
        expect(await snapshot()).toEqual(before)
      }
    }
  }, 60000)

  it('rejects forged callable and direct SDK authority without changing any parent or message (TC-026)', async () => {
    const parent = db.collection('helpRequests').doc(requestId)
    const pair = db.collection('conversations').doc(requestId)
    const summary = db.collection('helpRequestSummaries').doc(ids.student)
    const tuple = [ids.student, ids.mentor, 'f02-module'].map((part) => `${part.length}:${part}`)
    const key = db.collection('pendingHelpRequestKeys').doc(createHash('sha256').update(JSON.stringify(tuple)).digest('hex'))
    const foreignId = `forged-parent-${crypto.randomUUID()}`
    const foreignParent = db.collection('helpRequests').doc(foreignId)
    const foreignPair = db.collection('conversations').doc(foreignId)
    const accepted = (await parent.get()).data()!
    const conversation = (await pair.get()).data()!
    const foreignAcceptedAt = Timestamp.now()
    await foreignParent.set({ ...accepted, id: foreignId, studentId: ids.outsider, studentDisplayName: 'Foreign student', updatedAt: foreignAcceptedAt })
    await foreignPair.set({ ...conversation, id: foreignId, helpRequestId: foreignId, studentId: ids.outsider, participantIds: [ids.outsider, ids.mentor], createdAt: foreignAcceptedAt, updatedAt: foreignAcceptedAt })
    const snapshot = async () => ({
      state: await Promise.all([parent, key, summary, pair, foreignParent, foreignPair].map(async (ref) => (await ref.get()).data() ?? null)),
      messages: (await db.collectionGroup('messages').get()).docs.map((item) => ({ path: item.ref.path, data: item.data() })),
    })
    try {
      for (const role of ['student', 'mentor'] as const) {
        const send = call<SendMessageInput>(role, 'sendMessage')
        const clientDb = getClientFirestore(apps[role])
        const other = role === 'student' ? ids.mentor : ids.student
        const forgedFields = [
          { senderId: other }, { createdAt: '2000-01-01T00:00:00.000Z' }, { readAt: '2000-01-01T00:00:00.000Z' },
          { studentId: ids.outsider }, { mentorId: ids.outsider }, { participantIds: [ids.student, ids.outsider] },
          { helpRequestId: foreignId }, { conversationId: foreignId }, { parentId: foreignId }, { isAdmin: true },
        ]
        for (const forged of forgedFields) {
          const messageId = crypto.randomUUID()
          const before = await snapshot()
          await expect(send({ requestId, messageId, body: 'Forged callable message', ...forged } as never)).rejects.toMatchObject({ code: 'functions/invalid-argument' })
          expect((await pair.collection('messages').doc(messageId).get()).exists).toBe(false)
          expect(await snapshot()).toEqual(before)
        }
        const alteredPair = doc(clientDb, 'conversations', requestId)
        const directId = crypto.randomUUID()
        const before = await snapshot()
        await expect(updateDoc(alteredPair, { participantIds: [ids.student, ids.outsider] })).rejects.toMatchObject({ code: 'permission-denied' })
        await expect(setDoc(doc(clientDb, 'conversations', requestId, 'messages', directId), {
          senderId: other, body: 'Forged direct message', createdAt: new Date('2000-01-01T00:00:00.000Z'), readAt: null,
          participantIds: [ids.student, ids.outsider],
        })).rejects.toMatchObject({ code: 'permission-denied' })
        expect((await pair.collection('messages').doc(directId).get()).exists).toBe(false)
        expect(await snapshot()).toEqual(before)
      }
      const messageId = crypto.randomUUID()
      const before = await snapshot()
      await expect(call<SendMessageInput>('student', 'sendMessage')({ requestId: foreignId, messageId, body: 'Wrong parent' })).rejects.toMatchObject({ code: 'functions/permission-denied' })
      await expect(setDoc(doc(getClientFirestore(apps.student), 'conversations', foreignId, 'messages', messageId), {
        senderId: ids.outsider, body: 'Forged foreign message', createdAt: new Date(), readAt: null,
      })).rejects.toMatchObject({ code: 'permission-denied' })
      expect((await foreignPair.collection('messages').doc(messageId).get()).exists).toBe(false)
      expect(await snapshot()).toEqual(before)
      const validId = crypto.randomUUID()
      const result = (await call<SendMessageInput>('mentor', 'sendMessage')({ requestId, messageId: validId, body: '  Authorized after forgeries  ' })).data as { message: { senderId: string; body: string; createdAt: string } }
      const stored = (await pair.collection('messages').doc(validId).get()).data()!
      expect(result.message).toMatchObject({ senderId: ids.mentor, body: 'Authorized after forgeries' })
      expect(stored).toMatchObject({ senderId: ids.mentor, body: 'Authorized after forgeries', createdAt: expect.any(Timestamp), readAt: null })
      expect(result.message.createdAt).toBe(stored.createdAt.toDate().toISOString())
      expect((await snapshot()).state).toEqual(before.state)
    } finally {
      const foreignMessages = await foreignPair.collection('messages').get()
      for (const message of foreignMessages.docs) await message.ref.delete()
      await foreignPair.delete()
      await foreignParent.delete()
    }
  }, 90000)

  it('denies direct conversation/message mutations and foreign reads under actual Rules (TC-027, 040)', async () => {
    const studentDb = getClientFirestore(apps.student)
    const foreignDb = getClientFirestore(apps.outsider)
    const parentRef = db.collection('helpRequests').doc(requestId)
    const pairRef = db.collection('conversations').doc(requestId)
    const summaryRef = db.collection('helpRequestSummaries').doc(ids.student)
    const pair = doc(studentDb, 'conversations', requestId)
    const pairBefore = (await db.collection('conversations').doc(requestId).get()).data()!
    const messageId = crypto.randomUUID()
    await call<SendMessageInput>('student', 'sendMessage')({ requestId, messageId, body: 'Immutable text' })
    const messageRef = pairRef.collection('messages').doc(messageId)
    const messageBefore = (await messageRef.get()).data()!
    const parentBefore = (await parentRef.get()).data()!
    const summaryBefore = (await summaryRef.get()).data()!
    for (const role of roles) {
      const clientDb = getClientFirestore(apps[role])
      const alternateId = `alternate-${crypto.randomUUID()}`
      const newMessageId = crypto.randomUUID()
      const clientPair = doc(clientDb, 'conversations', requestId)
      const clientMessage = doc(clientDb, 'conversations', requestId, 'messages', messageId)
      await expect(setDoc(doc(clientDb, 'conversations', alternateId), { id: alternateId, helpRequestId: requestId, studentId: ids.student, mentorId: ids.mentor, participantIds: [ids.student, ids.mentor] })).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(updateDoc(clientPair, { participantIds: [ids.student, ids.outsider] })).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(updateDoc(clientPair, { studentId: ids.outsider, mentorId: ids[role] })).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(deleteDoc(clientPair)).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(setDoc(doc(clientDb, 'conversations', requestId, 'messages', newMessageId), { senderId: ids.mentor, body: 'Forged direct write', createdAt: new Date(), readAt: null })).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(updateDoc(clientMessage, { senderId: ids[role] })).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(updateDoc(clientMessage, { body: 'Edited body' })).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(updateDoc(clientMessage, { readAt: Timestamp.now().toDate() })).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(deleteDoc(clientMessage)).rejects.toMatchObject({ code: 'permission-denied' })
      expect((await parentRef.get()).data()).toEqual(parentBefore)
      expect((await pairRef.get()).data()).toEqual(pairBefore)
      expect((await messageRef.get()).data()).toEqual(messageBefore)
      expect((await summaryRef.get()).data()).toEqual(summaryBefore)
      expect((await db.collection('conversations').doc(alternateId).get()).exists).toBe(false)
      expect((await pairRef.collection('messages').doc(newMessageId).get()).exists).toBe(false)
    }
    await expect(getDoc(doc(foreignDb, 'conversations', requestId))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDoc(doc(foreignDb, 'conversations', requestId, 'messages', messageId))).rejects.toMatchObject({ code: 'permission-denied' })
    expect((await getDoc(pair)).data()).toMatchObject({ id: requestId, participantIds: [ids.student, ids.mentor] })
  }, 30000)

  it('aligns bounded owner reads with conversation and message get, list and listener Rules (TC-040)', async () => {
    const parentRef = db.collection('helpRequests').doc(requestId)
    const pairRef = db.collection('conversations').doc(requestId)
    const summaryRef = db.collection('helpRequestSummaries').doc(ids.student)
    const parentBefore = (await parentRef.get()).data()!
    const pairBefore = (await pairRef.get()).data()!
    const summaryBefore = (await summaryRef.get()).data()!
    const messageId = (await pairRef.collection('messages').limit(1).get()).docs[0]?.id
    expect(messageId).toBeTruthy()
    const messageRef = pairRef.collection('messages').doc(messageId!)
    const messageBefore = (await messageRef.get()).data()!
    const current = async () => Promise.all([parentRef.get(), pairRef.get(), messageRef.get(), summaryRef.get()].map(async (item) => (await item).data()))
    const original = await current()
    const deniedListener = async (subscribe: (next: () => void, error: (value: { code: string; message: string }) => void) => () => void) => {
      let unsubscribe = () => {}
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const error = await new Promise<{ code: string; message: string }>((resolve, reject) => {
          unsubscribe = subscribe(() => {}, resolve)
          timer = setTimeout(() => reject(new Error('Forbidden listener did not reject')), 5000)
        })
        expect(error.code).toBe('permission-denied')
        expect(error.message).not.toContain(messageBefore.body)
        expect(error.message).not.toContain(messageId)
      } finally { if (timer) clearTimeout(timer); unsubscribe() }
    }
    const allowedPairListener = async (role: 'student' | 'mentor') => {
      const clientDb = getClientFirestore(apps[role])
      let unsubscribe = () => {}
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        return await new Promise<unknown>((resolve, reject) => {
          unsubscribe = onSnapshot(doc(clientDb, 'conversations', requestId), (snapshot) => resolve(snapshot.data()), reject)
          timer = setTimeout(() => reject(new Error('Allowed pair listener did not return')), 5000)
        })
      } finally { if (timer) clearTimeout(timer); unsubscribe() }
    }
    for (const role of ['student', 'mentor'] as const) {
      const clientDb = getClientFirestore(apps[role])
      const ownerField = role === 'student' ? 'studentId' : 'mentorId'
      expect((await getDocs(query(collection(clientDb, 'helpRequests'), where(ownerField, '==', ids[role]), where('status', '==', 'ACCEPTED'), orderBy('updatedAt', 'desc'), orderBy(documentId(), 'desc'), limit(20)))).docs.map((item) => item.id)).toContain(requestId)
      expect((await getDoc(doc(clientDb, 'conversations', requestId))).data()).toMatchObject({ id: requestId })
      expect((await allowedPairListener(role))).toMatchObject({ id: requestId })
      expect((await getDoc(doc(clientDb, 'conversations', requestId, 'messages', messageId!))).data()).toMatchObject({ body: messageBefore.body })
      expect((await getDocs(query(collection(clientDb, 'conversations', requestId, 'messages'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20)))).docs.map((item) => item.id)).toContain(messageId)
      await expect(getDocs(collection(clientDb, 'conversations'))).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(getDocs(collection(clientDb, 'conversations', requestId, 'messages'))).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(getDocs(query(collection(clientDb, 'conversations', requestId, 'messages'), limit(21)))).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(getDocs(query(collection(clientDb, 'helpRequests'), where('status', '==', 'ACCEPTED'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
    }
    const outsider = getClientFirestore(apps.outsider)
    await expect(getDoc(doc(outsider, 'conversations', requestId))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDoc(doc(outsider, 'conversations', requestId, 'messages', messageId!))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDocs(query(collection(outsider, 'conversations', requestId, 'messages'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
    await deniedListener((next, error) => onSnapshot(doc(outsider, 'conversations', requestId), next, error))
    await deniedListener((next, error) => onSnapshot(query(collection(outsider, 'conversations', requestId, 'messages'), limit(20)), next, error))
    await deniedListener((next, error) => onSnapshot(collection(getClientFirestore(apps.student), 'conversations'), next, error))

    const ineligibleParents = [
      { reference: parentRef, original: parentBefore, change: { status: 'PENDING' } },
      { reference: parentRef, original: parentBefore, change: { status: 'REJECTED' } },
      { reference: parentRef, original: parentBefore, change: { id: `corrupt-${requestId}` } },
      { reference: pairRef, original: pairBefore, change: { participantIds: [ids.student, ids.outsider] } },
      { reference: pairRef, original: pairBefore, change: { updatedAt: Timestamp.fromMillis(0) } },
    ]
    for (const variant of ineligibleParents) {
      await variant.reference.update(variant.change)
      const changed = await current()
      try {
        for (const role of ['student', 'mentor'] as const) {
          const clientDb = getClientFirestore(apps[role])
          await expect(getDoc(doc(clientDb, 'conversations', requestId))).rejects.toMatchObject({ code: 'permission-denied' })
          await expect(getDoc(doc(clientDb, 'conversations', requestId, 'messages', messageId!))).rejects.toMatchObject({ code: 'permission-denied' })
          await expect(getDocs(query(collection(clientDb, 'conversations', requestId, 'messages'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
          await deniedListener((next, error) => onSnapshot(doc(clientDb, 'conversations', requestId), next, error))
          await deniedListener((next, error) => onSnapshot(query(collection(clientDb, 'conversations', requestId, 'messages'), limit(20)), next, error))
        }
        expect(await current()).toEqual(changed)
      } finally { await variant.reference.set(variant.original) }
    }
    for (const role of ['student', 'mentor'] as const) {
      const clientDb = getClientFirestore(apps[role])
      const clientAuth = getAuth(apps[role])
      const userRef = db.collection('users').doc(ids[role])
      const originalUser = (await userRef.get()).data()!
      const ownerField = role === 'student' ? 'studentId' : 'mentorId'
      const deniedCurrentReads = async () => {
        const changedUser = (await userRef.get()).data()!
        await expect(getDoc(doc(clientDb, 'conversations', requestId))).rejects.toMatchObject({ code: 'permission-denied' })
        await expect(getDoc(doc(clientDb, 'conversations', requestId, 'messages', messageId!))).rejects.toMatchObject({ code: 'permission-denied' })
        await expect(getDocs(query(collection(clientDb, 'conversations', requestId, 'messages'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
        await expect(getDocs(query(collection(clientDb, 'helpRequests'), where(ownerField, '==', ids[role]), where('status', '==', 'ACCEPTED'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
        await deniedListener((next, error) => onSnapshot(doc(clientDb, 'conversations', requestId), next, error))
        await deniedListener((next, error) => onSnapshot(query(collection(clientDb, 'conversations', requestId, 'messages'), limit(20)), next, error))
        await deniedListener((next, error) => onSnapshot(query(collection(clientDb, 'helpRequests'), where(ownerField, '==', ids[role]), where('status', '==', 'ACCEPTED'), limit(20)), next, error))
        expect(await current()).toEqual(original)
        expect((await userRef.get()).data()).toEqual(changedUser)
      }
      for (const change of [{ role: role === 'student' ? 'MENTOR' : 'STUDENT' }, { status: 'SUSPENDED' }, { email: `stale-${crypto.randomUUID()}@example.test` }]) {
        await userRef.update(change)
        try { await deniedCurrentReads() }
        finally { await userRef.set(originalUser) }
      }
      const unverifiedEmail = `f02-rules-unverified-${crypto.randomUUID()}@integration.invalid`
      try {
        await getAdminAuth(admin).updateUser(ids[role], { email: unverifiedEmail, emailVerified: false })
        await userRef.update({ email: unverifiedEmail })
        await signOut(clientAuth)
        await signInWithEmailAndPassword(clientAuth, unverifiedEmail, 'Synthetic-123!')
        await clientAuth.currentUser!.reload()
        await getIdToken(clientAuth.currentUser!, true)
        await deniedCurrentReads()
      } finally {
        await getAdminAuth(admin).updateUser(ids[role], { email: originalUser.email, emailVerified: true })
        await userRef.set(originalUser)
        await signOut(clientAuth)
        await signInWithEmailAndPassword(clientAuth, originalUser.email, 'Synthetic-123!')
        await clientAuth.currentUser!.reload()
        await getIdToken(clientAuth.currentUser!, true)
      }
      await getAdminAuth(admin).updateUser(ids[role], { disabled: true })
      try {
        await expect(getIdToken(clientAuth.currentUser!, true)).rejects.toMatchObject({ code: 'auth/user-disabled' })
        expect(await current()).toEqual(original)
      } finally {
        await getAdminAuth(admin).updateUser(ids[role], { disabled: false })
        await signOut(clientAuth)
        await signInWithEmailAndPassword(clientAuth, originalUser.email, 'Synthetic-123!')
        await clientAuth.currentUser!.reload()
        await getIdToken(clientAuth.currentUser!, true)
      }
      expect((await getDoc(doc(clientDb, 'conversations', requestId))).data()).toMatchObject({ id: requestId })
      expect(await current()).toEqual(original)
    }
    expect(await current()).toEqual(original)
    expect((await pairRef.get()).data()).toEqual(pairBefore)
    expect((await summaryRef.get()).data()).toEqual(summaryBefore)
  }, 90000)

  it('authorizes only the recipient for a stable receipt and rechecks revoked access (TC-028, 041)', async () => {
    const messageId = crypto.randomUUID()
    await call<SendMessageInput>('mentor', 'sendMessage')({ requestId, messageId, body: 'Please read this' })
    const messageRef = db.collection('conversations').doc(requestId).collection('messages').doc(messageId)
    const before = (await messageRef.get()).data()!
    const acknowledge = { requestId, messageId }
    await expect(call<AcknowledgeMessageInput>('mentor', 'acknowledgeMessage')(acknowledge)).rejects.toMatchObject({ code: 'functions/permission-denied' })
    await expect(call<AcknowledgeMessageInput>('outsider', 'acknowledgeMessage')(acknowledge)).rejects.toMatchObject({ code: 'functions/permission-denied' })
    await expect(call<AcknowledgeMessageInput>('student', 'acknowledgeMessage')({ ...acknowledge, messageId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'functions/permission-denied' })
    expect((await messageRef.get()).data()).toEqual(before)
    await db.collection('users').doc(ids.student).update({ status: 'SUSPENDED' })
    try { await expect(call<AcknowledgeMessageInput>('student', 'acknowledgeMessage')(acknowledge)).rejects.toMatchObject({ code: 'functions/permission-denied' }) }
    finally { await db.collection('users').doc(ids.student).update({ status: 'ACTIVE' }) }
    expect((await messageRef.get()).data()).toEqual(before)
    const first = (await call<AcknowledgeMessageInput>('student', 'acknowledgeMessage')(acknowledge)).data as { readAt: string }
    expect((await call<AcknowledgeMessageInput>('student', 'acknowledgeMessage')(acknowledge)).data).toEqual(first)
    const after = (await messageRef.get()).data()!
    expect(after.readAt).toBeInstanceOf(Timestamp)
    expect(after.senderId).toBe(before.senderId)
    expect(after.body).toBe(before.body)
    expect(after.createdAt.isEqual(before.createdAt)).toBe(true)
  }, 30000)

  it('denies foreign and malformed receipt targets without writes, then converges concurrent acknowledgements (TC-041)', async () => {
    const acknowledge = call<AcknowledgeMessageInput>('student', 'acknowledgeMessage')
    const primaryMessageId = crypto.randomUUID()
    await call<SendMessageInput>('mentor', 'sendMessage')({ requestId, messageId: primaryMessageId, body: 'Receipt concurrency target' })
    const foreignId = `foreign-receipt-${crypto.randomUUID()}`
    const malformedId = `malformed-receipt-${crypto.randomUUID()}`
    const foreignMessageId = crypto.randomUUID()
    const malformedParentMessageId = crypto.randomUUID()
    const malformedMessageId = crypto.randomUUID()
    const primary = db.collection('helpRequests').doc(requestId)
    const primaryPair = db.collection('conversations').doc(requestId)
    const primaryMessage = primaryPair.collection('messages').doc(primaryMessageId)
    const malformedMessage = primaryPair.collection('messages').doc(malformedMessageId)
    const foreignParent = db.collection('helpRequests').doc(foreignId)
    const foreignPair = db.collection('conversations').doc(foreignId)
    const foreignMessage = foreignPair.collection('messages').doc(foreignMessageId)
    const malformedParent = db.collection('helpRequests').doc(malformedId)
    const malformedPair = db.collection('conversations').doc(malformedId)
    const malformedParentMessage = malformedPair.collection('messages').doc(malformedParentMessageId)
    const summary = db.collection('helpRequestSummaries').doc(ids.student)
    const parentData = (await primary.get()).data()!
    const pairData = (await primaryPair.get()).data()!
    const now = Timestamp.now()
    const foreignStudentId = `foreign-student-${crypto.randomUUID()}`
    const privateSentinels = ['Foreign receipt secret', 'Corrupt parent secret', '  Unnormalized secret  ', 'Forged receipt body']
    const snapshot = async () => {
      const refs = [primary, primaryPair, primaryMessage, malformedMessage, foreignParent, foreignPair, foreignMessage, malformedParent, malformedPair, malformedParentMessage, summary]
      return Promise.all(refs.map(async (ref) => (await ref.get()).data() ?? null))
    }
    const deniedReceipt = async (payload: Record<string, unknown>, code: string, expected: unknown[]) => {
      const error = await acknowledge(payload as AcknowledgeMessageInput).then(() => null, (reason: unknown) => reason) as { code?: string; message?: string; details?: unknown } | null
      expect(error).toMatchObject({ code })
      const surfaced = JSON.stringify({ message: error?.message, details: error?.details })
      for (const secret of [...privateSentinels, foreignId, malformedId, foreignMessageId, malformedParentMessageId]) expect(surfaced).not.toContain(secret)
      expect(await snapshot()).toEqual(expected)
    }
    try {
      await foreignParent.set({ ...parentData, id: foreignId, studentId: foreignStudentId, createdAt: now, updatedAt: now })
      await foreignPair.set({ ...pairData, id: foreignId, helpRequestId: foreignId, studentId: foreignStudentId, participantIds: [foreignStudentId, ids.mentor], createdAt: now, updatedAt: now })
      await foreignMessage.set({ senderId: ids.mentor, body: privateSentinels[0], createdAt: now, readAt: null })
      await malformedParent.set({ ...parentData, id: `wrong-${malformedId}`, createdAt: now, updatedAt: now })
      await malformedPair.set({ ...pairData, id: malformedId, helpRequestId: malformedId, createdAt: now, updatedAt: now })
      await malformedParentMessage.set({ senderId: ids.mentor, body: privateSentinels[1], createdAt: now, readAt: null })
      await malformedMessage.set({ senderId: ids.mentor, body: privateSentinels[2], createdAt: now, readAt: null })
      const before = await snapshot()
      await deniedReceipt({ requestId, messageId: foreignMessageId }, 'functions/permission-denied', before)
      await deniedReceipt({ requestId: foreignId, messageId: foreignMessageId }, 'functions/permission-denied', before)
      await deniedReceipt({ requestId: malformedId, messageId: malformedParentMessageId }, 'functions/permission-denied', before)
      await deniedReceipt({ requestId, messageId: malformedMessageId }, 'functions/failed-precondition', before)
      await deniedReceipt({ requestId, messageId: primaryMessageId, body: privateSentinels[3] }, 'functions/invalid-argument', before)

      const payload = { requestId, messageId: primaryMessageId }
      const [first, second] = await Promise.all([acknowledge(payload), acknowledge(payload)])
      expect(first.data).toEqual(second.data)
      const after = await snapshot()
      const priorMessage = before[2] as { readAt: null }
      const savedMessage = after[2] as { readAt: Timestamp }
      expect(savedMessage.readAt).toBeInstanceOf(Timestamp)
      expect(savedMessage.readAt.toDate().toISOString()).toBe((first.data as { readAt: string }).readAt)
      expect(after).toEqual(before.map((value, index) => index === 2 ? { ...priorMessage, readAt: savedMessage.readAt } : value))
      expect((await acknowledge(payload)).data).toEqual(first.data)
      expect(await snapshot()).toEqual(after)
    } finally {
      await malformedMessage.delete()
      await foreignMessage.delete()
      await foreignPair.delete()
      await foreignParent.delete()
      await malformedParentMessage.delete()
      await malformedPair.delete()
      await malformedParent.delete()
    }
  }, 30000)

  it('denies nonaccepted receipt targets and changed recipient authority without leaking or changing state (TC-041)', async () => {
    const clientAuth = getAuth(apps.student)
    const adminAuth = getAdminAuth(admin)
    const ownUser = db.collection('users').doc(ids.student)
    const originalUser = (await ownUser.get()).data()!
    const parent = db.collection('helpRequests').doc(requestId)
    const pair = db.collection('conversations').doc(requestId)
    const summary = db.collection('helpRequestSummaries').doc(ids.student)
    const incomingId = crypto.randomUUID()
    const incoming = pair.collection('messages').doc(incomingId)
    await call<SendMessageInput>('mentor', 'sendMessage')({ requestId, messageId: incomingId, body: 'Private recipient sentinel' })
    const pendingId = `pending-receipt-${crypto.randomUUID()}`
    const rejectedId = `rejected-receipt-${crypto.randomUUID()}`
    const pendingMessageId = crypto.randomUUID()
    const rejectedMessageId = crypto.randomUUID()
    const pendingParent = db.collection('helpRequests').doc(pendingId)
    const rejectedParent = db.collection('helpRequests').doc(rejectedId)
    const pendingPair = db.collection('conversations').doc(pendingId)
    const rejectedPair = db.collection('conversations').doc(rejectedId)
    const pendingMessage = pendingPair.collection('messages').doc(pendingMessageId)
    const rejectedMessage = rejectedPair.collection('messages').doc(rejectedMessageId)
    const parentData = (await parent.get()).data()!
    const pairData = (await pair.get()).data()!
    const now = Timestamp.now()
    const refs = [parent, pair, incoming, summary, pendingParent, pendingPair, pendingMessage, rejectedParent, rejectedPair, rejectedMessage]
    const snapshot = async () => Promise.all(refs.map(async (ref) => (await ref.get()).data() ?? null))
    const secrets = ['Private recipient sentinel', 'Pending receipt sentinel', 'Rejected receipt sentinel']
    const deniedReceipt = async (role: typeof roles[number], payload: AcknowledgeMessageInput, code: string | RegExp, before: unknown[]) => {
      const error = await call<AcknowledgeMessageInput>(role, 'acknowledgeMessage')(payload).then(() => null, (reason: unknown) => reason) as { code?: string; message?: string; details?: unknown } | null
      expect(error).not.toBeNull()
      if (code instanceof RegExp) expect(error?.code).toMatch(code)
      else expect(error?.code).toBe(code)
      const surfaced = JSON.stringify({ message: error?.message, details: error?.details })
      for (const secret of [...secrets, requestId, pendingId, rejectedId, incomingId, pendingMessageId, rejectedMessageId]) expect(surfaced).not.toContain(secret)
      expect(await snapshot()).toEqual(before)
    }
    const restoreStudent = async () => {
      await ownUser.set(originalUser)
      await adminAuth.updateUser(ids.student, { disabled: false, email: originalUser.email, emailVerified: true })
      await signOut(clientAuth)
      await signInWithEmailAndPassword(clientAuth, originalUser.email, 'Synthetic-123!')
      await clientAuth.currentUser!.reload()
      await getIdToken(clientAuth.currentUser!, true)
    }
    try {
      for (const [status, targetParent, targetPair, targetMessage, targetId, targetMessageId, body] of [
        ['PENDING', pendingParent, pendingPair, pendingMessage, pendingId, pendingMessageId, secrets[1]],
        ['REJECTED', rejectedParent, rejectedPair, rejectedMessage, rejectedId, rejectedMessageId, secrets[2]],
      ] as const) {
        await targetParent.set({ ...parentData, id: targetId, status, createdAt: now, updatedAt: now })
        await targetPair.set({ ...pairData, id: targetId, helpRequestId: targetId, createdAt: now, updatedAt: now })
        await targetMessage.set({ senderId: ids.mentor, body, createdAt: now, readAt: null })
      }
      const before = await snapshot()
      await deniedReceipt('student', { requestId: pendingId, messageId: pendingMessageId }, 'functions/permission-denied', before)
      await deniedReceipt('student', { requestId: rejectedId, messageId: rejectedMessageId }, 'functions/permission-denied', before)
      await deniedReceipt('mentor', { requestId, messageId: incomingId }, 'functions/permission-denied', before)
      await deniedReceipt('outsider', { requestId, messageId: incomingId }, 'functions/permission-denied', before)
      const eligibleTarget = { requestId, messageId: incomingId }
      const variants = [
        { name: 'signed out', code: 'functions/unauthenticated', change: () => signOut(clientAuth) },
        { name: 'wrong role', code: 'functions/permission-denied', change: () => ownUser.update({ role: 'MENTOR' }) },
        { name: 'inactive', code: 'functions/permission-denied', change: () => ownUser.update({ status: 'SUSPENDED' }) },
        { name: 'Auth disabled', code: /^functions\/(permission-denied|unauthenticated)$/u, change: () => adminAuth.updateUser(ids.student, { disabled: true }) },
        { name: 'stored email mismatch', code: 'functions/permission-denied', change: () => ownUser.update({ email: `stale-${crypto.randomUUID()}@example.test` }) },
        { name: 'unverified', code: 'functions/failed-precondition', change: async () => {
          const unverifiedEmail = `receipt-unverified-${crypto.randomUUID()}@integration.invalid`
          await adminAuth.updateUser(ids.student, { email: unverifiedEmail, emailVerified: false })
          await ownUser.update({ email: unverifiedEmail })
          await signOut(clientAuth)
          await signInWithEmailAndPassword(clientAuth, unverifiedEmail, 'Synthetic-123!')
          await clientAuth.currentUser!.reload()
          await getIdToken(clientAuth.currentUser!, true)
        } },
      ]
      for (const variant of variants) {
        try {
          await variant.change()
          await deniedReceipt('student', eligibleTarget, variant.code, before)
        } finally { await restoreStudent() }
      }
      const receipt = (await call<AcknowledgeMessageInput>('student', 'acknowledgeMessage')(eligibleTarget)).data as { readAt: string }
      const after = await snapshot()
      const saved = after[2] as { readAt: Timestamp }
      expect(saved.readAt).toBeInstanceOf(Timestamp)
      expect(saved.readAt.toDate().toISOString()).toBe(receipt.readAt)
      expect(after).toEqual(before.map((value, index) => index === 2 ? { ...(value as object), readAt: saved.readAt } : value))
      expect((await call<AcknowledgeMessageInput>('student', 'acknowledgeMessage')(eligibleTarget)).data).toEqual(receipt)
      expect(await snapshot()).toEqual(after)
    } finally {
      await restoreStudent()
      await pendingMessage.delete()
      await pendingPair.delete()
      await pendingParent.delete()
      await rejectedMessage.delete()
      await rejectedPair.delete()
      await rejectedParent.delete()
    }
  }, 90000)

  it('converges two authenticated live message listeners on persisted IDs without refresh (TC-029)', async () => {
    const views: Record<'student' | 'mentor', string[]> = { student: [], mentor: [] }
    const bodies: Record<'student' | 'mentor', Record<string, string>> = { student: {}, mentor: {} }
    const unsubscribes: Array<() => void> = []
    let resolveConvergence: (() => void) | null = null
    let rejectConvergence: ((error: Error) => void) | null = null
    let resolveOffline: (() => void) | null = null
    let resolveReconnected: (() => void) | null = null
    const convergence = new Promise<void>((resolve, reject) => { resolveConvergence = resolve; rejectConvergence = reject })
    const offline = new Promise<void>((resolve) => { resolveOffline = resolve })
    const reconnected = new Promise<void>((resolve) => { resolveReconnected = resolve })
    const idsToObserve = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    const timeout = setTimeout(() => rejectConvergence?.(new Error('Two live clients did not converge on saved message IDs.')), 10000)
    const studentDb = getClientFirestore(apps.student)
    let studentFromCache = false
    try {
      for (const role of ['student', 'mentor'] as const) {
        const messages = collection(getClientFirestore(apps[role]), 'conversations', requestId, 'messages')
        const ordered = query(messages, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20))
        unsubscribes.push(onSnapshot(ordered, { includeMetadataChanges: true }, (snapshot) => {
          views[role] = snapshot.docs.map((item) => item.id)
          bodies[role] = Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data().body as string]))
          if (role === 'student' && snapshot.metadata.fromCache) { studentFromCache = true; resolveOffline?.() }
          if (idsToObserve.slice(0, 2).every((id) => views.student.includes(id) && views.mentor.includes(id))) resolveConvergence?.()
          if (role === 'student' && idsToObserve.every((id) => views.student.includes(id) && views.mentor.includes(id)) && !snapshot.metadata.fromCache) resolveReconnected?.()
        }, (error) => rejectConvergence?.(error)))
      }
      await call<SendMessageInput>('student', 'sendMessage')({ requestId, messageId: idsToObserve[0]!, body: 'Student live' })
      await call<SendMessageInput>('mentor', 'sendMessage')({ requestId, messageId: idsToObserve[1]!, body: 'Mentor live' })
      await convergence
      const persisted = await db.collection('conversations').doc(requestId).collection('messages').get()
      expect(persisted.docs.filter((item) => idsToObserve.includes(item.id))).toHaveLength(2)
      for (const role of ['student', 'mentor'] as const) {
        expect(views[role].filter((id) => idsToObserve.slice(0, 2).includes(id))).toHaveLength(2)
        expect(new Set(views[role]).size).toBe(views[role].length)
        expect(views[role].indexOf(idsToObserve[1]!)).toBeLessThan(views[role].indexOf(idsToObserve[0]!))
        expect(bodies[role][idsToObserve[0]!]).toBe('Student live')
        expect(bodies[role][idsToObserve[1]!]).toBe('Mentor live')
      }
      await disableNetwork(studentDb)
      await Promise.race([offline, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Student listener did not report cached offline state.')), 8000))])
      expect(studentFromCache).toBe(true)
      expect(views.student).toContain(idsToObserve[0])
      expect(views.student).toContain(idsToObserve[1])
      await call<SendMessageInput>('mentor', 'sendMessage')({ requestId, messageId: idsToObserve[2]!, body: 'Mentor while Student offline' })
      expect(views.student).not.toContain(idsToObserve[2])
      await enableNetwork(studentDb)
      await Promise.race([reconnected, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Student listener did not converge after reconnect.')), 8000))])
      const final = (await db.collection('conversations').doc(requestId).collection('messages').orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(20).get()).docs
      const expected = final.map((item) => item.id)
      for (const role of ['student', 'mentor'] as const) {
        expect(views[role]).toEqual(expected)
        expect(bodies[role][idsToObserve[2]!]).toBe('Mentor while Student offline')
        expect(new Set(views[role]).size).toBe(views[role].length)
      }
    } finally {
      clearTimeout(timeout)
      await enableNetwork(studentDb)
      unsubscribes.forEach((unsubscribe) => unsubscribe())
    }
  }, 30000)

  it('orders equal-time messages across a live first-page shift and older-page boundary for both roles (TC-020, 029)', async () => {
    const fixedTime = Timestamp.fromMillis(Date.now() + 60_000)
    const seededIds = Array.from({ length: 25 }, () => crypto.randomUUID())
    const liveId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    const messagesRef = db.collection('conversations').doc(requestId).collection('messages')
    const batch = db.batch()
    for (const id of seededIds) batch.set(messagesRef.doc(id), { senderId: ids.student, body: `Equal time ${id}`, createdAt: fixedTime, readAt: null })
    await batch.commit()
    const expectedInitial = [...seededIds].sort().reverse().slice(0, 20)
    const events: Record<'student' | 'mentor', string[][]> = { student: [], mentor: [] }
    const unsubscribes: Array<() => void> = []
    let resolveInitial: (() => void) | null = null
    let resolveShift: (() => void) | null = null
    let rejectEvent: ((error: Error) => void) | null = null
    const initial = new Promise<void>((resolve, reject) => { resolveInitial = resolve; rejectEvent = reject })
    const shifted = new Promise<void>((resolve, reject) => { resolveShift = resolve; rejectEvent = reject })
    try {
      for (const role of ['student', 'mentor'] as const) {
        const ordered = query(collection(getClientFirestore(apps[role]), 'conversations', requestId, 'messages'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20))
        unsubscribes.push(onSnapshot(ordered, (snapshot) => {
          events[role].push(snapshot.docs.map((item) => item.id))
          if (events.student.at(-1)?.join() === expectedInitial.join() && events.mentor.at(-1)?.join() === expectedInitial.join()) resolveInitial?.()
          if (events.student.at(-1)?.[0] === liveId && events.mentor.at(-1)?.[0] === liveId) resolveShift?.()
        }, (error) => rejectEvent?.(error)))
      }
      await initial
      await messagesRef.doc(liveId).set({ senderId: ids.mentor, body: 'Equal-time live shift', createdAt: fixedTime, readAt: null })
      await shifted
      const allEqualIds = [...seededIds, liveId]
      for (const role of ['student', 'mentor'] as const) {
        const messages = collection(getClientFirestore(apps[role]), 'conversations', requestId, 'messages')
        const ordered = query(messages, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20))
        const first = await getDocs(ordered)
        const older = await getDocs(query(messages, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), startAfter(first.docs.at(-1)!), limit(20)))
        const combined = [...first.docs, ...older.docs].map((item) => item.id).filter((id) => allEqualIds.includes(id))
        expect(combined).toEqual([...allEqualIds].sort().reverse())
        expect(new Set(combined).size).toBe(26)
        expect([...combined].reverse()).toEqual([...allEqualIds].sort())
        for (const item of [...first.docs, ...older.docs].filter((row) => allEqualIds.includes(row.id))) {
          expect(item.data().body).toBe(item.id === liveId ? 'Equal-time live shift' : `Equal time ${item.id}`)
        }
        expect(events[role].at(-1)).toHaveLength(20)
        expect(events[role].at(-1)?.[0]).toBe(liveId)
      }
    } finally { unsubscribes.forEach((unsubscribe) => unsubscribe()) }
  }, 30000)

  it('serializes concurrent same-ID sends and keeps the original server timestamp on replay (TC-031, 033)', async () => {
    const messageId = crypto.randomUUID()
    const input = { requestId, messageId, body: 'One intention' }
    const send = call<SendMessageInput>('student', 'sendMessage')
    const [first, second] = await Promise.all([send(input), send(input)])
    expect(first.data).toEqual(second.data)
    const messageRef = db.collection('conversations').doc(requestId).collection('messages').doc(messageId)
    const stored = (await messageRef.get()).data()!
    expect(stored).toMatchObject({ senderId: ids.student, body: input.body, readAt: null })
    expect(stored.createdAt).toBeInstanceOf(Timestamp)
    await expect(send({ ...input, body: 'Another intention' })).rejects.toMatchObject({ code: 'functions/already-exists' })
    await expect(call<SendMessageInput>('mentor', 'sendMessage')(input)).rejects.toMatchObject({ code: 'functions/already-exists' })
    expect((await messageRef.get()).data()).toEqual(stored)
    expect((await db.collection('conversations').doc(requestId).collection('messages').where('body', '==', input.body).get()).size).toBe(1)
  }, 30000)

  it('rechecks current account status, role, Auth disablement and email before send or receipt (TC-028, 038)', async () => {
    const ownUser = db.collection('users').doc(ids.student)
    const messages = db.collection('conversations').doc(requestId).collection('messages')
    const incomingId = crypto.randomUUID()
    await call<SendMessageInput>('mentor', 'sendMessage')({ requestId, messageId: incomingId, body: 'Private auth matrix' })
    const original = (await ownUser.get()).data()!
    const before = (await messages.get()).docs.map((item) => [item.id, item.data()])
    const deniedActions = async () => {
      await expect(call<SendMessageInput>('student', 'sendMessage')({ requestId, messageId: crypto.randomUUID(), body: 'Never saved' })).rejects.toMatchObject({ code: expect.stringMatching(/^functions\/(permission-denied|unauthenticated)$/) })
      await expect(call<AcknowledgeMessageInput>('student', 'acknowledgeMessage')({ requestId, messageId: incomingId })).rejects.toMatchObject({ code: expect.stringMatching(/^functions\/(permission-denied|unauthenticated)$/) })
      expect((await messages.get()).docs.map((item) => [item.id, item.data()])).toEqual(before)
    }
    await ownUser.update({ status: 'SUSPENDED' })
    try { await deniedActions() } finally { await ownUser.update({ status: 'ACTIVE' }) }
    await ownUser.update({ role: 'MENTOR' })
    try { await deniedActions() } finally { await ownUser.update({ role: 'STUDENT' }) }
    await ownUser.update({ email: 'stale-profile@example.test' })
    try { await deniedActions() } finally { await ownUser.update({ email: original.email }) }
    await getAdminAuth(admin).updateUser(ids.student, { disabled: true })
    try { await deniedActions() } finally { await getAdminAuth(admin).updateUser(ids.student, { disabled: false }) }
    const unverifiedEmail = `f02-unverified-${crypto.randomUUID()}@integration.invalid`
    await getAdminAuth(admin).updateUser(ids.student, { email: unverifiedEmail, emailVerified: false })
    await ownUser.update({ email: unverifiedEmail })
    try {
      await signInWithEmailAndPassword(getAuth(apps.student), unverifiedEmail, 'Synthetic-123!')
      await expect(call<SendMessageInput>('student', 'sendMessage')({ requestId, messageId: crypto.randomUUID(), body: 'Unverified must not send' })).rejects.toMatchObject({ code: 'functions/failed-precondition' })
      await expect(call<AcknowledgeMessageInput>('student', 'acknowledgeMessage')({ requestId, messageId: incomingId })).rejects.toMatchObject({ code: 'functions/failed-precondition' })
      expect((await messages.get()).docs.map((item) => [item.id, item.data()])).toEqual(before)
    } finally {
      await getAdminAuth(admin).updateUser(ids.student, { email: original.email, emailVerified: true })
      await ownUser.update({ email: original.email })
      await signInWithEmailAndPassword(getAuth(apps.student), original.email, 'Synthetic-123!')
    }
  }, 30000)

  it('pages more than forty persisted messages through bounded Rules queries to exhaustion (TC-018)', async () => {
    const messages = db.collection('conversations').doc(requestId).collection('messages')
    const batch = db.batch()
    const seeded = Array.from({ length: 45 }, (_, index) => ({ id: crypto.randomUUID(), body: `History page ${index}`, createdAt: Timestamp.fromMillis(Date.now() + 3_600_000 + index * 1000) }))
    for (const item of seeded) batch.set(messages.doc(item.id), { senderId: ids.student, body: item.body, createdAt: item.createdAt, readAt: null })
    await batch.commit()
    const adminRows = (await messages.get()).docs.map((item) => ({ id: item.id, data: item.data() }))
      .sort((a, b) => b.data.createdAt.toMillis() - a.data.createdAt.toMillis() || b.id.localeCompare(a.id))
    expect(adminRows.length).toBeGreaterThan(40)
    for (const role of ['student', 'mentor'] as const) {
      const source = collection(getClientFirestore(apps[role]), 'conversations', requestId, 'messages')
      const clauses = [orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc')] as const
      const fetched: Array<{ id: string; body: string; createdAt: number; readAt: number | null }> = []
      const pageSizes: number[] = []
      let cursor: Awaited<ReturnType<typeof getDocs>>['docs'][number] | null = null
      for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
        const page = await getDocs(cursor
          ? query(source, ...clauses, startAfter(cursor), limit(20))
          : query(source, ...clauses, limit(20)))
        pageSizes.push(page.size)
        fetched.push(...page.docs.map((item) => ({ id: item.id, body: item.data().body, createdAt: item.data().createdAt.toMillis(), readAt: item.data().readAt?.toMillis() ?? null })))
        if (page.empty) break
        cursor = page.docs.at(-1)!
      }
      expect(pageSizes[0]).toBe(20)
      expect(pageSizes[1]).toBe(20)
      expect(pageSizes.at(-1)).toBe(0)
      expect(pageSizes.every((size) => size <= 20)).toBe(true)
      expect(fetched).toEqual(adminRows.map((item) => ({ id: item.id, body: item.data.body, createdAt: item.data.createdAt.toMillis(), readAt: item.data.readAt?.toMillis() ?? null })))
      expect(new Set(fetched.map((item) => item.id)).size).toBe(adminRows.length)
      expect(seeded.every((item) => fetched.some((row) => row.id === item.id && row.body === item.body))).toBe(true)
    }
  }, 30000)
})
