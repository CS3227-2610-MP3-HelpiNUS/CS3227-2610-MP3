import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
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

  it('creates on first accepted send, grounds from synthetic data, and replays without duplicates', async () => {
    expect(listStudentStudyAssistantConversationsOutputSchema.parse((await list('student')({ limit: 20 })).data).conversations).toEqual([])
    firstRequestId = crypto.randomUUID()
    firstInput = { requestId: firstRequestId, conversationId: null, userMessage: 'Explain breadth-first search and its queue.' }
    const first = studentStudyAssistOutputSchema.parse((await send('student')(firstInput)).data)
    expect(first.kind).toBe('grounded')
    expect(first.replayed).toBe(false)
    expect(first.assistantMessage).toMatchObject({ role: 'ASSISTANT', grounding: 'GROUNDED' })
    if (first.assistantMessage.grounding !== 'GROUNDED') throw new Error('Expected grounded fixture response.')
    expect(first.assistantMessage.citations).toEqual([expect.objectContaining({
      sourceId: 'synthetic-algorithms-notes',
      canonicalUrl: 'https://example.test/helpinus-synthetic/algorithms',
      version: 'synthetic-v1',
    })])
    conversationId = first.conversation.id

    const replay = studentStudyAssistOutputSchema.parse((await send('student')(firstInput)).data)
    expect(replay).toEqual({ ...first, replayed: true })
    const messages = await adminDb.collection('studentStudyAssistantUsers').doc(ids.student)
      .collection('studentStudyAssistantConversations').doc(conversationId)
      .collection('studentStudyAssistantMessages').get()
    expect(messages.size).toBe(2)
  }, 30_000)

  it('persists citation provenance, continues multi-turn state, and keeps other roles and owners out', async () => {
    await expect(send('mentor')({ requestId: crypto.randomUUID(), conversationId: null, userMessage: 'Explain BFS.' }))
      .rejects.toMatchObject({ code: 'functions/failed-precondition' })
    await expect(read('otherStudent')({ conversationId, limit: 50 }))
      .rejects.toMatchObject({ code: 'functions/permission-denied' })
    await expect(remove('otherStudent')({ requestId: crypto.randomUUID(), conversationId }))
      .rejects.toMatchObject({ code: 'functions/permission-denied' })

    const continuation = studentStudyAssistOutputSchema.parse((await send('student')({
      requestId: crypto.randomUUID(), conversationId, userMessage: 'What base case does recursion need?',
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
