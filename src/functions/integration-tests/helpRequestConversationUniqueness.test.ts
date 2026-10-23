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
import { assertMatchingAcceptedConversation } from '../src/conversations.js'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-unique-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-unique-${role}` }, `f01-unique-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const ids: Record<Role, string> = { student: '', mentor: '' }
const moduleId = `f01-unique-module-${crypto.randomUUID()}`
const createOperations = [crypto.randomUUID(), crypto.randomUUID()]
const requestIds: string[] = []
const alternateIds: string[] = []
const tupleHash = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')
const callable = <Input>(role: Role, name: string) => httpsCallable<Input, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)
const receiptRef = (index: number) => db.collection('helpRequestOperations').doc(ids.student).collection('operations').doc(createOperations[index])

async function snapshot() {
  const [requests, conversations, key, summary, receipts] = await Promise.all([
    db.collection('helpRequests').get(), db.collection('conversations').get(),
    db.collection('pendingHelpRequestKeys').doc(tupleHash()).get(),
    db.collection('helpRequestSummaries').doc(ids.student).get(),
    Promise.all([receiptRef(0).get(), receiptRef(1).get()]),
  ])
  return {
    requests: Object.fromEntries(requests.docs.filter((item) => item.data().studentId === ids.student).map((item) => [item.id, item.data()])),
    conversations: Object.fromEntries(conversations.docs.filter((item) => item.data().studentId === ids.student || requestIds.includes(item.data().helpRequestId)).map((item) => [item.id, item.data()])),
    key: key.data() ?? null,
    summary: summary.data() ?? null,
    receipts: receipts.map((item) => item.data() ?? null),
  }
}

async function create(index: number) {
  const result = createHelpRequestOutputSchema.parse((await callable<CreateHelpRequestInput>('student', 'createHelpRequest')({
    operationId: createOperations[index], mentorId: ids.mentor, moduleId,
    title: `Separate request ${index + 1}`, description: 'The same people need separate conversations for separate requests.',
  })).data)
  expect(result.kind).toBe('created')
  if (result.kind !== 'created') throw new Error('Expected a new request')
  requestIds.push(result.helpRequest.id)
  return result.helpRequest.id
}

async function accept(requestId: string, operationId = crypto.randomUUID()) {
  return respondToHelpRequestOutputSchema.parse((await callable<RespondToHelpRequestInput>('mentor', 'respondToHelpRequest')({
    operationId, helpRequestId: requestId, response: 'ACCEPTED',
  })).data)
}

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getClientFirestore(apps[role]), '127.0.0.1', 8080)
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f01-unique-${role}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'TC031', title: 'Per-request uniqueness', active: true })
}, 30000)

afterAll(async () => {
  for (const id of [...requestIds, ...alternateIds]) await db.collection('conversations').doc(id).delete()
  for (const id of requestIds) await db.collection('helpRequests').doc(id).delete()
  if (ids.student) {
    await db.collection('pendingHelpRequestKeys').doc(tupleHash()).delete()
    for (const index of [0, 1]) await receiptRef(index).delete()
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

describe('F01 exact conversation uniqueness (TC-031)', () => {
  it('keeps exactly one immutable same-ID conversation for each of two accepted requests under repeated accept contention', async () => {
    const first = await create(0)
    const firstPending = await snapshot()
    expect(firstPending.key).toEqual({ studentId: ids.student, mentorId: ids.mentor, moduleId, helpRequestId: first })
    expect(firstPending.summary).toEqual({ pendingCount: 1, acceptedCount: 0, rejectedCount: 0, openCount: 1, updatedAt: firstPending.requests[first].createdAt })
    expect(firstPending.receipts[0]).toMatchObject({ studentId: ids.student, kind: 'CREATED', helpRequestId: first })
    expect(firstPending.conversations).toEqual({})

    expect(await accept(first)).toMatchObject({ kind: 'decided', conversationId: first })
    const firstAccepted = await snapshot()
    expect(firstAccepted.key).toBeNull()
    expect(firstAccepted.summary).toEqual({ pendingCount: 0, acceptedCount: 1, rejectedCount: 0, openCount: 1, updatedAt: firstAccepted.requests[first].updatedAt })

    const second = await create(1)
    expect(second).not.toBe(first)
    const beforeRace = await snapshot()
    expect(beforeRace.requests[second].status).toBe('PENDING')
    expect(beforeRace.conversations[second]).toBeUndefined()
    expect(beforeRace.key).toEqual({ studentId: ids.student, mentorId: ids.mentor, moduleId, helpRequestId: second })
    expect(beforeRace.summary).toEqual({ pendingCount: 1, acceptedCount: 1, rejectedCount: 0, openCount: 2, updatedAt: beforeRace.requests[second].createdAt })
    expect(beforeRace.receipts).toEqual([firstAccepted.receipts[0], expect.objectContaining({ studentId: ids.student, kind: 'CREATED', helpRequestId: second })])

    // Both requests are constructed before the barrier opens, forcing overlapping callable dispatch.
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const operationIds = [crypto.randomUUID(), crypto.randomUUID()]
    const attempt = async (operationId: string) => { await gate; return accept(second, operationId) }
    const attempts = operationIds.map(attempt)
    release()
    const results = await Promise.all(attempts)
    expect(results.map((item) => item.kind).sort()).toEqual(['already_decided', 'decided'])
    expect(results.every((item) => item.kind === 'decided' || item.kind === 'already_decided')).toBe(true)
    expect(results.every((item) => 'conversationId' in item && item.conversationId === second)).toBe(true)

    const settled = await snapshot()
    expect(Object.keys(settled.requests).sort()).toEqual([first, second].sort())
    expect(Object.keys(settled.conversations).sort()).toEqual([first, second].sort())
    expect(settled.key).toBeNull()
    expect(settled.summary).toEqual({ pendingCount: 0, acceptedCount: 2, rejectedCount: 0, openCount: 2, updatedAt: settled.requests[second].updatedAt })
    expect(settled.receipts).toEqual(beforeRace.receipts)
    expect(settled.requests[first]).toEqual(firstAccepted.requests[first])
    expect(settled.conversations[first]).toEqual(firstAccepted.conversations[first])
    for (const id of [first, second]) {
      const parent = settled.requests[id]
      const pair = settled.conversations[id]
      expect(parent).toMatchObject({ id, studentId: ids.student, mentorId: ids.mentor, moduleId, status: 'ACCEPTED' })
      expect(parent.createdAt).toEqual(id === first ? firstPending.requests[first].createdAt : beforeRace.requests[second].createdAt)
      expect(pair).toEqual({ id, helpRequestId: id, studentId: ids.student, mentorId: ids.mentor, participantIds: [ids.student, ids.mentor], createdAt: parent.updatedAt, updatedAt: parent.updatedAt })
      expect(pair.createdAt.isEqual(parent.updatedAt)).toBe(true)
      expect(pair.updatedAt.isEqual(parent.updatedAt)).toBe(true)
      for (const role of roles) {
        const client = getClientFirestore(apps[role])
        expect((await getDocFromServer(doc(client, 'helpRequests', id))).data()).toMatchObject({ id, status: 'ACCEPTED' })
        const clientPair = (await getDocFromServer(doc(client, 'conversations', id))).data()
        expect(clientPair).toMatchObject({ id, helpRequestId: id, studentId: ids.student, mentorId: ids.mentor, participantIds: [ids.student, ids.mentor] })
        expect(clientPair?.createdAt?.toMillis()).toBe(pair.createdAt.toMillis())
        expect(clientPair?.updatedAt?.toMillis()).toBe(pair.updatedAt.toMillis())
      }
    }
    expect(await accept(second, operationIds[0])).toMatchObject({ kind: 'already_decided', conversationId: second })
    expect(await snapshot()).toEqual(settled)

    for (const [role, parentId] of [['student', first], ['mentor', second]] as const) {
      const client = getClientFirestore(apps[role])
      const alternateId = `alternate-${crypto.randomUUID()}`
      alternateIds.push(alternateId)
      await expect(setDoc(doc(client, 'conversations', alternateId), { id: alternateId, helpRequestId: parentId, studentId: ids.student, mentorId: ids.mentor, participantIds: [ids.student, ids.mentor] })).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(setDoc(doc(client, 'conversations', parentId), { helpRequestId: second === parentId ? first : second }, { merge: true })).rejects.toMatchObject({ code: 'permission-denied' })
    }
    expect(await snapshot()).toEqual(settled)

    // The trusted validator rejects both an alternate document ID and a forged parent link.
    const trustedParent = settled.requests[second] as Parameters<typeof assertMatchingAcceptedConversation>[0]
    const alternateId = `trusted-alternate-${crypto.randomUUID()}`
    alternateIds.push(alternateId)
    const alternateRef = db.collection('conversations').doc(alternateId)
    await alternateRef.set({ ...settled.conversations[second], id: alternateId })
    try {
      const alternate = await alternateRef.get()
      expect(() => assertMatchingAcceptedConversation(trustedParent, alternate)).toThrow()
    } finally {
      await alternateRef.delete()
    }
    const canonicalRef = db.collection('conversations').doc(second)
    await canonicalRef.set({ ...settled.conversations[second], helpRequestId: first })
    try {
      const forged = await canonicalRef.get()
      expect(() => assertMatchingAcceptedConversation(trustedParent, forged)).toThrow()
    } finally {
      await canonicalRef.set(settled.conversations[second])
    }
    expect(await snapshot()).toEqual(settled)
  }, 45000)
})
