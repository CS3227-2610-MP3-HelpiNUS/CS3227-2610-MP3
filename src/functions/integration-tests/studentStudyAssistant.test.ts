import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, connectFirestoreEmulator, doc, getDocs, getFirestore as getClientFirestore, setDoc } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import {
  deleteStudentStudyAssistantConversationOutputSchema,
  listStudentStudyAssistantConversationsOutputSchema,
  readStudentStudyAssistantConversationOutputSchema,
  studentStudyAssistOutputSchema,
  type DeleteStudentStudyAssistantConversationInput,
  type DeleteStudentStudyAssistantConversationOutput,
  type ListStudentStudyAssistantConversationsInput,
  type ListStudentStudyAssistantConversationsOutput,
  type ReadStudentStudyAssistantConversationInput,
  type ReadStudentStudyAssistantConversationOutput,
  type StudentStudyAssistInput,
  type StudentStudyAssistOutput,
} from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const roles = ['student', 'otherStudent', 'mentor'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({
  apiKey: 'fake-api-key', projectId, appId: `student-study-assistant-${role}`,
}, `student-study-assistant-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const admin = initializeAdminApp({ projectId }, 'student-study-assistant-admin')
const adminAuth = getAdminAuth(admin)
const adminDb = getFirestore(admin)
const ids = {} as Record<Role, string>

const call = <Input, Output>(role: Role, name: string) =>
  httpsCallable<Input, Output>(getFunctions(apps[role], 'asia-southeast1'), name)

const send = (role: Role) => call<StudentStudyAssistInput, StudentStudyAssistOutput>(role, 'studentStudyAssist')
const list = (role: Role) => call<ListStudentStudyAssistantConversationsInput, ListStudentStudyAssistantConversationsOutput>(role, 'listStudentStudyAssistantConversations')
const read = (role: Role) => call<ReadStudentStudyAssistantConversationInput, ReadStudentStudyAssistantConversationOutput>(role, 'readStudentStudyAssistantConversation')
const remove = (role: Role) => call<DeleteStudentStudyAssistantConversationInput, DeleteStudentStudyAssistantConversationOutput>(role, 'deleteStudentStudyAssistantConversation')

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    const functions = getFunctions(apps[role], 'asia-southeast1')
    const clientDb = getClientFirestore(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFunctionsEmulator(functions, '127.0.0.1', 5001)
    connectFirestoreEmulator(clientDb, '127.0.0.1', 8080)
    const email = `study-${role}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await adminAuth.updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    const isMentor = role === 'mentor'
    await adminDb.collection(isMentor ? 'mentors' : 'users').doc(user.uid).set({
      id: user.uid,
      email,
      displayName: role,
      role: isMentor ? 'MENTOR' : 'STUDENT',
      status: 'ACTIVE',
      createdAt: Timestamp.now(),
    })
  }
}, 30_000)

afterAll(async () => {
  for (const role of roles) {
    await signOut(getAuth(apps[role]))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30_000)

describe('Student Study Assistant emulator integration', () => {
  let conversationId = ''
  let firstRequestId = ''
  let firstInput: StudentStudyAssistInput

  it('creates on first accepted send, grounds from approved module data, and replays without duplicates', async () => {
    expect(listStudentStudyAssistantConversationsOutputSchema.parse((await list('student')({ limit: 20 })).data).conversations).toEqual([])
    firstRequestId = crypto.randomUUID()
    firstInput = {
      requestId: firstRequestId,
      conversationId: null,
      userMessage: 'In CS2030S, why does immutability help with aliasing?',
    }
    const first = studentStudyAssistOutputSchema.parse((await send('student')(firstInput)).data)
    conversationId = first.conversation.id
    expect(conversationId).not.toBe('')
    expect(first.kind).toBe('grounded')
    expect(first.replayed).toBe(false)
    expect(first.assistantMessage).toMatchObject({ role: 'ASSISTANT', grounding: 'GROUNDED' })
    if (first.assistantMessage.grounding !== 'GROUNDED') throw new Error('Expected grounded fixture response.')
    expect(first.assistantMessage.citations).toEqual([expect.objectContaining({
      sourceId: 'cs2030s-2021-s2-immutability',
      canonicalUrl: 'https://nus-cs2030s.github.io/2021-s2/25-immutability.html',
      version: '2021 Semester 2',
    })])

    const replay = studentStudyAssistOutputSchema.parse((await send('student')(firstInput)).data)
    expect(replay).toEqual({ ...first, replayed: true })
    const messages = await adminDb.collection('studentStudyAssistantUsers').doc(ids.student)
      .collection('studentStudyAssistantConversations').doc(conversationId)
      .collection('studentStudyAssistantMessages').get()
    expect(messages.size).toBe(2)
  }, 30_000)

  it('persists citation provenance, continues multi-turn state, and keeps other roles and owners out', async () => {
    await expect(send('mentor')({ requestId: crypto.randomUUID(), conversationId: null, userMessage: 'Explain CS2030S immutability.' }))
      .rejects.toMatchObject({ code: 'functions/failed-precondition' })
    await expect(read('otherStudent')({ conversationId, limit: 50 }))
      .rejects.toMatchObject({ code: 'functions/permission-denied' })
    await expect(remove('otherStudent')({ requestId: crypto.randomUUID(), conversationId }))
      .rejects.toMatchObject({ code: 'functions/permission-denied' })

    const continuation = studentStudyAssistOutputSchema.parse((await send('student')({
      requestId: crypto.randomUUID(), conversationId, userMessage: 'Why does that matter?',
    })).data)
    expect(continuation.kind).toBe('grounded')
    const loaded = readStudentStudyAssistantConversationOutputSchema.parse((await read('student')({ conversationId, limit: 50 })).data)
    expect(loaded.messages).toHaveLength(4)
    expect(loaded.messages.map(({ role }) => role)).toEqual(['STUDENT', 'ASSISTANT', 'STUDENT', 'ASSISTANT'])
    const assistants = loaded.messages.filter((message) => message.role === 'ASSISTANT')
    expect(assistants).toHaveLength(2)
    expect(assistants.every((message) => message.grounding === 'GROUNDED' && message.citations.length > 0)).toBe(true)
    const visible = listStudentStudyAssistantConversationsOutputSchema.parse((await list('student')({ limit: 20 })).data)
    expect(visible.conversations.map(({ id }) => id)).toContain(conversationId)
  }, 30_000)

  it('fails closed for unsupported questions and denies all direct client storage access', async () => {
    const unsupported = studentStudyAssistOutputSchema.parse((await send('student')({
      requestId: crypto.randomUUID(), conversationId: null, userMessage: 'What is the cafeteria menu on Mars?',
    })).data)
    expect(unsupported).toMatchObject({ kind: 'insufficient_context', assistantMessage: { grounding: 'INSUFFICIENT_CONTEXT', citations: [] } })

    const clientDb = getClientFirestore(apps.student)
    await expect(getDocs(collection(clientDb, 'studentStudyAssistantUsers', ids.student, 'studentStudyAssistantConversations')))
      .rejects.toMatchObject({ code: 'permission-denied' })
    await expect(setDoc(doc(clientDb, 'studentStudyAssistantUsers', ids.student, 'studentStudyAssistantConversations', 'forged'), {
      ownerId: ids.student,
    })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDocs(collection(clientDb, 'studentStudyAssistantAuditEvents')))
      .rejects.toMatchObject({ code: 'permission-denied' })
  }, 30_000)

  it('denies every callable to unauthenticated, wrong-role, inactive, malformed, mismatched, and unverified callers', async () => {
    const inputs = () => ({
      send: { requestId: crypto.randomUUID(), conversationId, userMessage: 'Explain CS2030S immutability.' },
      list: { limit: 20 },
      read: { conversationId, limit: 50 },
      remove: { requestId: crypto.randomUUID(), conversationId },
    })
    const expectDenied = async (
      invocations: (input: ReturnType<typeof inputs>) => Array<() => Promise<unknown>>,
      code: string,
    ) => {
      const request = inputs()
      for (const invocation of invocations(request)) {
        await expect(invocation()).rejects.toMatchObject({ code })
      }
    }
    const callsFor = (role: Role) => (input: ReturnType<typeof inputs>) => [
      () => send(role)(input.send),
      () => list(role)(input.list),
      () => read(role)(input.read),
      () => remove(role)(input.remove),
    ]

    const guest = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'student-study-assistant-guest' }, 'student-study-assistant-guest')
    const guestFunctions = getFunctions(guest, 'asia-southeast1')
    connectFunctionsEmulator(guestFunctions, '127.0.0.1', 5001)
    const guestCalls = (input: ReturnType<typeof inputs>) => [
      () => httpsCallable(guestFunctions, 'studentStudyAssist')(input.send),
      () => httpsCallable(guestFunctions, 'listStudentStudyAssistantConversations')(input.list),
      () => httpsCallable(guestFunctions, 'readStudentStudyAssistantConversation')(input.read),
      () => httpsCallable(guestFunctions, 'deleteStudentStudyAssistantConversation')(input.remove),
    ]
    try {
      await expectDenied(guestCalls, 'functions/unauthenticated')
      await expect(httpsCallable(guestFunctions, 'studentStudyAssist')({ userMessage: 'private malformed audit sentinel' }))
        .rejects.toMatchObject({ code: 'functions/invalid-argument' })
    } finally {
      await deleteApp(guest)
    }
    await expectDenied(callsFor('mentor'), 'functions/failed-precondition')

    const profile = adminDb.collection('users').doc(ids.student)
    const original = (await profile.get()).data()!
    for (const [change, code] of [
      [{ status: 'SUSPENDED' }, 'functions/permission-denied'],
      [{ id: `wrong-${ids.student}` }, 'functions/permission-denied'],
      [{ role: 'MENTOR' }, 'functions/permission-denied'],
      [{ email: `stale-${crypto.randomUUID()}@example.test` }, 'functions/permission-denied'],
    ] as const) {
      await profile.update(change)
      try {
        await expectDenied(callsFor('student'), code)
      } finally {
        await profile.set(original)
      }
    }

    const studentAuth = getAuth(apps.student)
    const originalEmail = studentAuth.currentUser!.email!
    const unverifiedEmail = `study-unverified-${crypto.randomUUID()}@integration.invalid`
    await adminAuth.updateUser(ids.student, { email: unverifiedEmail, emailVerified: false })
    await profile.update({ email: unverifiedEmail })
    await signInWithEmailAndPassword(studentAuth, unverifiedEmail, 'Synthetic-123!')
    try {
      await expectDenied(callsFor('student'), 'functions/failed-precondition')
    } finally {
      await adminAuth.updateUser(ids.student, { email: originalEmail, emailVerified: true })
      await profile.update({ email: originalEmail })
      await signInWithEmailAndPassword(studentAuth, originalEmail, 'Synthetic-123!')
    }

    const messages = await adminDb.collection('studentStudyAssistantUsers').doc(ids.student)
      .collection('studentStudyAssistantConversations').doc(conversationId)
      .collection('studentStudyAssistantMessages').get()
    expect(messages.size).toBe(4)
    const auditDocuments = await adminDb.collection('studentStudyAssistantAuditEvents').get()
    const auditData = auditDocuments.docs.map((snapshot) => snapshot.data())
    expect(auditData.some(({ event }) => [
      'VALIDATION_REJECTED', 'AUTHENTICATION_REJECTED', 'AUTHORIZATION_REJECTED', 'CALLABLE_REJECTED',
    ].includes(event))).toBe(false)
    expect(JSON.stringify(auditData)).not.toContain('private malformed audit sentinel')
  }, 60_000)

  it('deletes content, persists a tombstone, and prevents retry resurrection', async () => {
    const deleted = deleteStudentStudyAssistantConversationOutputSchema.parse((await remove('student')({
      requestId: crypto.randomUUID(), conversationId,
    })).data)
    expect(deleted).toEqual({ kind: 'deleted', conversationId })
    await expect(read('student')({ conversationId, limit: 50 }))
      .rejects.toMatchObject({ code: 'functions/permission-denied' })
    await expect(send('student')(firstInput))
      .rejects.toMatchObject({ code: 'functions/permission-denied' })
    const tombstone = await adminDb.collection('studentStudyAssistantDeletionTombstones').doc(ids.student)
      .collection('studentStudyAssistantConversations').doc(conversationId).get()
    expect(tombstone.exists).toBe(true)
    const messages = await adminDb.collection('studentStudyAssistantUsers').doc(ids.student)
      .collection('studentStudyAssistantConversations').doc(conversationId)
      .collection('studentStudyAssistantMessages').get()
    expect(messages.empty).toBe(true)
  }, 30_000)
})
