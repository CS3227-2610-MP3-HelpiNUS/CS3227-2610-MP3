import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { createHelpRequestOutputSchema, respondToHelpRequestOutputSchema, type CreateHelpRequestInput, type RespondToHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-duplicate-replay-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-duplicate-replay-${role}` }, `f01-duplicate-replay-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const ids: Record<Role, string> = { student: '', mentor: '' }
const moduleId = `f01-duplicate-replay-module-${crypto.randomUUID()}`
const operations = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
const requestIds: string[] = []
const firstTitle = 'Original question'
const firstDescription = 'The original details were delivered.'
const changedTitle = 'Different question'
const changedDescription = 'These changed details must not be delivered.'
const freshTitle = 'New request after rejection'
const freshDescription = 'A terminal predecessor permits a new attempt.'
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const tupleHash = () => hash([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))
const invokeCreate = () => httpsCallable<CreateHelpRequestInput, unknown>(getFunctions(apps.student, 'asia-southeast1'), 'createHelpRequest')
const invokeDecide = () => httpsCallable<RespondToHelpRequestInput, unknown>(getFunctions(apps.mentor, 'asia-southeast1'), 'respondToHelpRequest')
const input = (index: number, title: string, description: string): CreateHelpRequestInput => ({ operationId: operations[index], mentorId: ids.mentor, moduleId, title, description })

async function snapshot() {
  const [requests, keys, receipts, summary, conversations] = await Promise.all([
    db.collection('helpRequests').get(), db.collection('pendingHelpRequestKeys').get(),
    db.collection('helpRequestOperations').doc(ids.student).collection('operations').get(),
    db.collection('helpRequestSummaries').doc(ids.student).get(), db.collection('conversations').get(),
  ])
  const sorted = (rows: Array<[string, FirebaseFirestore.DocumentData]>) => rows.sort(([a], [b]) => a.localeCompare(b))
  return {
    requests: sorted(requests.docs.filter((item) => item.data().studentId === ids.student).map((item) => [item.id, item.data()])),
    keys: sorted(keys.docs.filter((item) => item.data().studentId === ids.student).map((item) => [item.id, item.data()])),
    receipts: sorted(receipts.docs.map((item) => [item.id, item.data()])),
    summary: summary.data() ?? null,
    conversations: sorted(conversations.docs.filter((item) => requestIds.includes(item.data().helpRequestId)).map((item) => [item.id, item.data()])),
  }
}

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f01-duplicate-replay-${role}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection('users').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'TC009010', title: 'Duplicate and replay', active: true })
}, 30000)

afterAll(async () => {
  for (const id of requestIds) {
    await db.collection('conversations').doc(id).delete()
    await db.collection('helpRequests').doc(id).delete()
  }
  if (ids.student) {
    await db.collection('pendingHelpRequestKeys').doc(tupleHash()).delete()
    for (const operationId of operations) await db.collection('helpRequestOperations').doc(ids.student).collection('operations').doc(operationId).delete()
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

describe('F01 different-text duplicate and committed creation replay (TC-009/010)', () => {
  it('replays one created receipt after dropped reply, keeps different text undelivered, then permits a fresh post-terminal request', async () => {
    let committed = false
    const firstPayload = input(0, firstTitle, firstDescription)
    const dropCommittedReply = async () => {
      const output = createHelpRequestOutputSchema.parse((await invokeCreate()(firstPayload)).data)
      expect(output.kind).toBe('created')
      if (output.kind !== 'created') throw new Error('Expected first creation')
      requestIds.push(output.helpRequest.id)
      committed = true
      throw new Error('simulated dropped creation reply after callable success')
    }
    await expect(dropCommittedReply()).rejects.toThrow('simulated dropped creation reply')
    expect(committed).toBe(true)
    const first = requestIds[0]
    const afterCommit = await snapshot()
    expect(afterCommit.requests.map(([id]) => id)).toEqual([first])
    expect(afterCommit.requests[0][1]).toMatchObject({ id: first, studentId: ids.student, mentorId: ids.mentor, moduleId, title: firstTitle, description: firstDescription, status: 'PENDING' })
    expect(afterCommit.keys).toEqual([[tupleHash(), { studentId: ids.student, mentorId: ids.mentor, moduleId, helpRequestId: first }]])
    expect(afterCommit.receipts).toEqual([[operations[0], { studentId: ids.student, fingerprint: hash([ids.mentor, moduleId, firstTitle, firstDescription]), kind: 'CREATED', helpRequestId: first }]])
    expect(afterCommit.summary).toEqual({ pendingCount: 1, acceptedCount: 0, rejectedCount: 0, openCount: 1, updatedAt: afterCommit.requests[0][1].createdAt })
    expect(afterCommit.conversations).toEqual([])

    const sequential = createHelpRequestOutputSchema.parse((await invokeCreate()(firstPayload)).data)
    expect(sequential).toMatchObject({ kind: 'created', helpRequest: { id: first, status: 'PENDING' } })
    expect(await snapshot()).toEqual(afterCommit)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const replay = async () => { await gate; return createHelpRequestOutputSchema.parse((await invokeCreate()(firstPayload)).data) }
    const parallel = [replay(), replay()]
    release()
    const repeated = await Promise.all(parallel)
    expect(repeated).toEqual([sequential, sequential])
    expect(await snapshot()).toEqual(afterCommit)

    const changed = createHelpRequestOutputSchema.parse((await invokeCreate()(input(1, changedTitle, changedDescription))).data)
    expect(changed).toEqual({ kind: 'duplicate', existingHelpRequestId: first, currentStatus: 'PENDING' })
    const duplicate = await snapshot()
    expect(duplicate.requests).toEqual(afterCommit.requests)
    expect(duplicate.keys).toEqual(afterCommit.keys)
    expect(duplicate.summary).toEqual(afterCommit.summary)
    expect(duplicate.receipts).toEqual([...afterCommit.receipts, [operations[1], { studentId: ids.student, fingerprint: hash([ids.mentor, moduleId, changedTitle, changedDescription]), kind: 'DUPLICATE', helpRequestId: first }]].sort(([a], [b]) => a.localeCompare(b)))
    expect(JSON.stringify(duplicate.requests)).not.toContain(changedTitle)
    expect(JSON.stringify(duplicate.requests)).not.toContain(changedDescription)

    const rejected = respondToHelpRequestOutputSchema.parse((await invokeDecide()({ operationId: crypto.randomUUID(), helpRequestId: first, response: 'REJECTED' })).data)
    expect(rejected).toMatchObject({ kind: 'decided', conversationId: null, helpRequest: { id: first, status: 'REJECTED' } })
    const terminal = await snapshot()
    expect(terminal.requests).toEqual([[first, { ...afterCommit.requests[0][1], status: 'REJECTED', updatedAt: expect.any(Timestamp) }]])
    expect(terminal.keys).toEqual([])
    expect(terminal.summary).toEqual({ pendingCount: 0, acceptedCount: 0, rejectedCount: 1, openCount: 0, updatedAt: terminal.requests[0][1].updatedAt })
    expect(terminal.receipts).toEqual(duplicate.receipts)
    expect(terminal.conversations).toEqual([])
    expect(createHelpRequestOutputSchema.parse((await invokeCreate()(firstPayload)).data)).toMatchObject({ kind: 'created', helpRequest: { id: first, status: 'REJECTED' } })
    expect(createHelpRequestOutputSchema.parse((await invokeCreate()(input(1, changedTitle, changedDescription))).data)).toEqual({ kind: 'duplicate', existingHelpRequestId: first, currentStatus: 'REJECTED' })
    expect(await snapshot()).toEqual(terminal)

    const fresh = createHelpRequestOutputSchema.parse((await invokeCreate()(input(2, freshTitle, freshDescription))).data)
    expect(fresh.kind).toBe('created')
    if (fresh.kind !== 'created') throw new Error('Expected fresh post-terminal request')
    const second = fresh.helpRequest.id
    requestIds.push(second)
    expect(second).not.toBe(first)
    const afterFresh = await snapshot()
    expect(afterFresh.requests.map(([id]) => id).sort()).toEqual([first, second].sort())
    expect(afterFresh.requests.find(([id]) => id === first)?.[1]).toEqual(terminal.requests[0][1])
    expect(afterFresh.requests.find(([id]) => id === second)?.[1]).toMatchObject({ id: second, title: freshTitle, description: freshDescription, status: 'PENDING' })
    expect(afterFresh.keys).toEqual([[tupleHash(), { studentId: ids.student, mentorId: ids.mentor, moduleId, helpRequestId: second }]])
    expect(afterFresh.receipts).toEqual([...terminal.receipts, [operations[2], { studentId: ids.student, fingerprint: hash([ids.mentor, moduleId, freshTitle, freshDescription]), kind: 'CREATED', helpRequestId: second }]].sort(([a], [b]) => a.localeCompare(b)))
    expect(afterFresh.summary).toEqual({ pendingCount: 1, acceptedCount: 0, rejectedCount: 1, openCount: 1, updatedAt: afterFresh.requests.find(([id]) => id === second)?.[1].createdAt })
    expect(afterFresh.conversations).toEqual([])
    expect(createHelpRequestOutputSchema.parse((await invokeCreate()(firstPayload)).data)).toMatchObject({ kind: 'created', helpRequest: { id: first, status: 'REJECTED' } })
    expect(await snapshot()).toEqual(afterFresh)
  }, 45000)
})
