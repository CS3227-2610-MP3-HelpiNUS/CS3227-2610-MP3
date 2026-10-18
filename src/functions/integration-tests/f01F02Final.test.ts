import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { connectFirestoreEmulator, collection, doc, getDoc, getDocs, getFirestore, limit, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore'
import type { CreateHelpRequestInput, RespondToHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-f02-final-admin')
const db = getAdminFirestore(admin)
const roles = ['student', 'mentor', 'outsider'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-f02-final-${role}` }, `f01-f02-final-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const ids: Record<Role, string> = { student: '', mentor: '', outsider: '' }
const moduleId = `final-module-${crypto.randomUUID()}`
const createdRequests = new Set<string>()
const call = <T>(role: Role, name: string) => httpsCallable<T, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)
const decide = (role: Role, requestId: string, response: 'ACCEPTED' | 'REJECTED', operationId = crypto.randomUUID()) =>
  call<RespondToHelpRequestInput>(role, 'respondToHelpRequest')({ helpRequestId: requestId, response, operationId })
const tupleHash = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')
const refs = (requestId: string) => ({
  request: db.collection('helpRequests').doc(requestId),
  conversation: db.collection('conversations').doc(requestId),
  key: db.collection('pendingHelpRequestKeys').doc(tupleHash()),
  summary: db.collection('helpRequestSummaries').doc(ids.student),
})
const state = async (requestId: string) => {
  const r = refs(requestId)
  const [request, conversation, key, summary] = await Promise.all([r.request.get(), r.conversation.get(), r.key.get(), r.summary.get()])
  return { request: request.data() ?? null, conversation: conversation.data() ?? null, key: key.data() ?? null, summary: summary.data() ?? null }
}
const createRequest = async () => {
  const result = (await call<CreateHelpRequestInput>('student', 'createHelpRequest')({
    operationId: crypto.randomUUID(), mentorId: ids.mentor, moduleId,
    title: 'Integration question', description: 'A saved request for integration testing.',
  })).data as { kind: string; helpRequest: { id: string } }
  expect(result.kind).toBe('created')
  createdRequests.add(result.helpRequest.id)
  return result.helpRequest.id
}

beforeAll(async () => {
  for (const role of roles) {
    const app = apps[role]
    const auth = getAuth(app)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFunctionsEmulator(getFunctions(app, 'asia-southeast1'), '127.0.0.1', 5001)
    connectFirestoreEmulator(getFirestore(app), '127.0.0.1', 8080)
    const email = `final-${role}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection('users').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'CS3227', title: 'Integration module', active: true })
}, 30000)

afterAll(async () => {
  for (const requestId of createdRequests) {
    const r = refs(requestId)
    const messages = await r.conversation.collection('messages').get()
    for (const message of messages.docs) await message.ref.delete()
    await r.conversation.delete()
    await r.request.delete()
  }
  if (ids.student) {
    const operations = await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get()
    for (const operation of operations.docs) await operation.ref.delete()
    await db.collection('pendingHelpRequestKeys').doc(tupleHash()).delete()
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

describe('F01/F02 final production-wired acceptance (F01-TC-022–025, 029–035)', () => {
  it('commits the accepted parent, exact pair, key release and summary together; replays without writes (TC-023, 029)', async () => {
    const requestId = await createRequest()
    const before = await state(requestId)
    expect(before.request?.status).toBe('PENDING')
    expect(before.conversation).toBeNull()
    const operationId = crypto.randomUUID()
    expect((await decide('mentor', requestId, 'ACCEPTED', operationId)).data).toMatchObject({ kind: 'decided', conversationId: requestId })
    const accepted = await state(requestId)
    expect(accepted.request?.status).toBe('ACCEPTED')
    expect(accepted.conversation).toMatchObject({ id: requestId, helpRequestId: requestId, studentId: ids.student, mentorId: ids.mentor, participantIds: [ids.student, ids.mentor] })
    expect(accepted.conversation?.createdAt.isEqual(accepted.request?.updatedAt)).toBe(true)
    expect(accepted.conversation?.updatedAt.isEqual(accepted.request?.updatedAt)).toBe(true)
    expect(accepted.key).toBeNull()
    expect(accepted.summary).toMatchObject({ pendingCount: 0, acceptedCount: 1, rejectedCount: 0, openCount: 1 })
    for (const role of ['student', 'mentor'] as const) {
      expect((await getDoc(doc(getFirestore(apps[role]), 'conversations', requestId))).exists()).toBe(true)
    }
    await expect(getDoc(doc(getFirestore(apps.outsider), 'conversations', requestId))).rejects.toMatchObject({ code: 'permission-denied' })
    for (const id of [operationId, crypto.randomUUID()]) expect((await decide('mentor', requestId, 'ACCEPTED', id)).data).toMatchObject({ kind: 'already_decided', conversationId: requestId })
    expect((await decide('mentor', requestId, 'REJECTED')).data).toEqual({ kind: 'conflict', actualStatus: 'ACCEPTED' })
    expect(await state(requestId)).toEqual(accepted)
  }, 30000)

  it('rejects once with a server decision time and keeps terminal replay and conflict read-only (TC-021, 023)', async () => {
    const requestId = await createRequest()
    const pending = await state(requestId)
    const receiptsBefore = (await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get())
      .docs.map((item) => [item.id, item.data()])
    expect(pending.request?.status).toBe('PENDING')
    expect(pending.conversation).toBeNull()
    expect(pending.key).toMatchObject({ helpRequestId: requestId })
    const beforeCall = Date.now()
    const operationId = crypto.randomUUID()
    expect((await decide('mentor', requestId, 'REJECTED', operationId)).data).toMatchObject({
      kind: 'decided', conversationId: null, helpRequest: { id: requestId, status: 'REJECTED' },
    })
    const afterCall = Date.now()
    const rejected = await state(requestId)
    expect(rejected.request).toEqual({ ...pending.request, status: 'REJECTED', updatedAt: expect.any(Timestamp) })
    expect(rejected.request?.updatedAt.toMillis()).toBeGreaterThanOrEqual(beforeCall)
    expect(rejected.request?.updatedAt.toMillis()).toBeLessThanOrEqual(afterCall)
    expect(
      rejected.request?.updatedAt.seconds > pending.request?.updatedAt.seconds
      || (rejected.request?.updatedAt.seconds === pending.request?.updatedAt.seconds
        && rejected.request?.updatedAt.nanoseconds > pending.request?.updatedAt.nanoseconds),
    ).toBe(true)
    expect(rejected.request).not.toHaveProperty('rejectionReason')
    expect(rejected.request).not.toHaveProperty('reason')
    expect(rejected.key).toBeNull()
    expect(rejected.conversation).toBeNull()
    expect(rejected.summary).toEqual({
      pendingCount: pending.summary!.pendingCount - 1,
      acceptedCount: pending.summary!.acceptedCount,
      rejectedCount: pending.summary!.rejectedCount + 1,
      openCount: pending.summary!.openCount - 1,
      updatedAt: rejected.request?.updatedAt,
    })
    const receiptsAfter = (await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get())
      .docs.map((item) => [item.id, item.data()])
    expect(receiptsAfter).toEqual(receiptsBefore)
    for (const id of [operationId, crypto.randomUUID()]) {
      expect((await decide('mentor', requestId, 'REJECTED', id)).data).toMatchObject({
        kind: 'already_decided', conversationId: null, helpRequest: { id: requestId, status: 'REJECTED' },
      })
      expect(await state(requestId)).toEqual(rejected)
    }
    expect((await decide('mentor', requestId, 'ACCEPTED')).data).toEqual({ kind: 'conflict', actualStatus: 'REJECTED' })
    expect(await state(requestId)).toEqual(rejected)
    expect((await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get())
      .docs.map((item) => [item.id, item.data()])).toEqual(receiptsBefore)
    expect((await db.collection('conversations').where('helpRequestId', '==', requestId).get()).empty).toBe(true)
  }, 30000)

  it('serializes same and opposite concurrent decisions with one durable terminal result (TC-024)', async () => {
    for (const [firstAction, secondAction] of [['ACCEPTED', 'ACCEPTED'], ['ACCEPTED', 'REJECTED'], ['REJECTED', 'ACCEPTED']] as const) {
      const requestId = await createRequest()
      const before = await state(requestId)
      let release!: () => void
      const gate = new Promise<void>((resolve) => { release = resolve })
      const barrierStart = async (action: 'ACCEPTED' | 'REJECTED') => { await gate; return decide('mentor', requestId, action) }
      const firstAttempt = barrierStart(firstAction)
      const secondAttempt = barrierStart(secondAction)
      release()
      const [firstResult, secondResult] = await Promise.all([
        firstAttempt, secondAttempt,
      ])
      const results = [firstResult.data, secondResult.data] as Array<{ kind: string; actualStatus?: string }>
      const settled = await state(requestId)
      expect(results.filter((item) => item.kind === 'decided')).toHaveLength(1)
      expect(results.every((item) => item.kind === 'decided' || item.kind === 'already_decided' || item.kind === 'conflict')).toBe(true)
      expect(settled.request?.status).toMatch(/^(ACCEPTED|REJECTED)$/)
      expect(settled.conversation !== null).toBe(settled.request?.status === 'ACCEPTED')
      expect(settled.key).toBeNull()
      expect(settled.summary?.pendingCount).toBe(0)
      expect(settled.summary?.acceptedCount + settled.summary?.rejectedCount).toBe((before.summary?.acceptedCount ?? 0) + (before.summary?.rejectedCount ?? 0) + 1)
      expect(settled.summary?.acceptedCount).toBe((before.summary?.acceptedCount ?? 0) + (settled.request?.status === 'ACCEPTED' ? 1 : 0))
      expect(settled.summary?.rejectedCount).toBe((before.summary?.rejectedCount ?? 0) + (settled.request?.status === 'REJECTED' ? 1 : 0))
      expect(settled.request?.createdAt).toEqual(before.request?.createdAt)
      expect(settled.request?.updatedAt.toMillis()).toBeGreaterThanOrEqual(before.request?.updatedAt.toMillis())
      if (settled.conversation) {
        expect(settled.conversation).toMatchObject({ id: requestId, helpRequestId: requestId, studentId: ids.student, mentorId: ids.mentor })
        expect(settled.conversation.createdAt.isEqual(settled.request?.updatedAt)).toBe(true)
      }
      if (firstAction === secondAction) expect(results.filter((item) => item.kind === 'already_decided')).toHaveLength(1)
      else expect(results.find((item) => item.kind === 'conflict')?.actualStatus).toBe(settled.request?.status)
      const replay = await decide('mentor', requestId, settled.request?.status as 'ACCEPTED' | 'REJECTED')
      expect(replay.data).toMatchObject({ kind: 'already_decided' })
      expect(await state(requestId)).toEqual(settled)
    }
  }, 30000)

  it('reconciles a committed acceptance after its callable reply is lost without a second write (TC-030)', async () => {
    const requestId = await createRequest()
    const operationId = crypto.randomUUID()
    // The first response is deliberately discarded after the production callable commits.
    await decide('mentor', requestId, 'ACCEPTED', operationId)
    const committed = await state(requestId)
    expect(committed.request?.status).toBe('ACCEPTED')
    expect(committed.conversation?.helpRequestId).toBe(requestId)
    for (const role of ['student', 'mentor'] as const) {
      expect((await getDoc(doc(getFirestore(apps[role]), 'helpRequests', requestId))).data()?.status).toBe('ACCEPTED')
      expect((await getDoc(doc(getFirestore(apps[role]), 'conversations', requestId))).data()?.helpRequestId).toBe(requestId)
    }
    const sameId = await decide('mentor', requestId, 'ACCEPTED', operationId)
    const newId = await decide('mentor', requestId, 'ACCEPTED')
    expect(sameId.data).toMatchObject({ kind: 'already_decided', conversationId: requestId })
    expect(newId.data).toMatchObject({ kind: 'already_decided', conversationId: requestId })
    expect(await state(requestId)).toEqual(committed)
    expect((await db.collection('conversations').where('helpRequestId', '==', requestId).get()).docs.map((item) => item.id)).toEqual([requestId])
  }, 30000)

  it('preserves pending on profile/module changes but denies revoked Mentor before any write (TC-025)', async () => {
    const requestId = await createRequest()
    await db.collection('mentorProfiles').doc(ids.mentor).update({ active: false, moduleIds: [] })
    await db.collection('modules').doc(moduleId).update({ active: false })
    try {
      expect((await decide('mentor', requestId, 'ACCEPTED')).data).toMatchObject({ kind: 'decided', conversationId: requestId })
    } finally {
      await db.collection('mentorProfiles').doc(ids.mentor).update({ active: true, moduleIds: [moduleId] })
      await db.collection('modules').doc(moduleId).update({ active: true })
    }
    const pendingId = await createRequest()
    const before = await state(pendingId)
    await db.collection('users').doc(ids.mentor).update({ status: 'SUSPENDED' })
    try { await expect(decide('mentor', pendingId, 'ACCEPTED')).rejects.toMatchObject({ code: 'functions/permission-denied' }) }
    finally { await db.collection('users').doc(ids.mentor).update({ status: 'ACTIVE' }) }
    expect(await state(pendingId)).toEqual(before)
    expect((await decide('mentor', pendingId, 'REJECTED')).data).toMatchObject({ kind: 'decided' })
  }, 30000)

  it('rejects anomalous pending/rejected pairs without changing coordination state (TC-022)', async () => {
    const requestId = await createRequest()
    const r = refs(requestId)
    await r.conversation.set({ id: requestId, helpRequestId: requestId, studentId: ids.student, mentorId: ids.mentor, participantIds: [ids.student, ids.mentor], createdAt: Timestamp.now(), updatedAt: Timestamp.now() })
    const before = await state(requestId)
    await expect(decide('mentor', requestId, 'REJECTED')).rejects.toMatchObject({ code: 'functions/failed-precondition' })
    expect(await state(requestId)).toEqual(before)
    await expect(getDoc(doc(getFirestore(apps.student), 'conversations', requestId))).rejects.toMatchObject({ code: 'permission-denied' })
    await r.conversation.delete()
    expect((await decide('mentor', requestId, 'REJECTED')).data).toMatchObject({ kind: 'decided' })
    await r.conversation.set(before.conversation!)
    const rejected = await state(requestId)
    await expect(decide('mentor', requestId, 'REJECTED')).rejects.toMatchObject({ code: 'functions/failed-precondition' })
    expect(await state(requestId)).toEqual(rejected)
    await expect(getDoc(doc(getFirestore(apps.student), 'conversations', requestId))).rejects.toMatchObject({ code: 'permission-denied' })
  }, 30000)

  it('rejects missing and mismatched accepted pairs on replay without mutating either record (TC-034)', async () => {
    const requestId = await createRequest()
    await decide('mentor', requestId, 'ACCEPTED')
    const r = refs(requestId)
    const validPair = (await r.conversation.get()).data()!
    await r.conversation.delete()
    const missing = await state(requestId)
    await expect(decide('mentor', requestId, 'ACCEPTED')).rejects.toMatchObject({ code: 'functions/failed-precondition' })
    expect(await state(requestId)).toEqual(missing)
    await r.conversation.set({ ...validPair, mentorId: ids.outsider, participantIds: [ids.student, ids.outsider] })
    const mismatched = await state(requestId)
    await expect(decide('mentor', requestId, 'ACCEPTED')).rejects.toMatchObject({ code: 'functions/failed-precondition' })
    expect(await state(requestId)).toEqual(mismatched)
  }, 30000)

  it('creates separate rooms for separate requests and denies alternate client creation (TC-031–033)', async () => {
    const first = await createRequest()
    await decide('mentor', first, 'ACCEPTED')
    const second = await createRequest()
    await decide('mentor', second, 'ACCEPTED')
    expect(first).not.toBe(second)
    const pairs = await db.collection('conversations').where('studentId', '==', ids.student).get()
    expect(pairs.docs.filter((item) => [first, second].includes(item.id)).map((item) => item.id).sort()).toEqual([first, second].sort())
    const studentDb = getFirestore(apps.student)
    const alternate = doc(studentDb, 'conversations', `alternate-${crypto.randomUUID()}`)
    await expect(setDoc(alternate, { id: alternate.id, helpRequestId: first, studentId: ids.student, mentorId: ids.mentor, participantIds: [ids.student, ids.mentor] })).rejects.toMatchObject({ code: 'permission-denied' })
    for (const role of ['student', 'mentor'] as const) {
      for (const id of [first, second]) expect((await getDoc(doc(getFirestore(apps[role]), 'conversations', id))).data()?.helpRequestId).toBe(id)
    }
    expect((await db.collection('conversations').where('studentId', '==', ids.student).get()).docs.filter((item) => [first, second].includes(item.id))).toHaveLength(2)
  }, 30000)

  it('uses the actual bounded accepted-parent owner query and denies broad or foreign queries (TC-035)', async () => {
    const accepted = await createRequest()
    await decide('mentor', accepted, 'ACCEPTED')
    const pending = await createRequest()
    const studentDb = getFirestore(apps.student)
    const mentorDb = getFirestore(apps.mentor)
    const studentQuery = query(collection(studentDb, 'helpRequests'), where('studentId', '==', ids.student), where('status', '==', 'ACCEPTED'), orderBy('updatedAt', 'desc'), orderBy('__name__', 'desc'), limit(20))
    const mentorQuery = query(collection(mentorDb, 'helpRequests'), where('mentorId', '==', ids.mentor), where('status', '==', 'ACCEPTED'), orderBy('updatedAt', 'desc'), orderBy('__name__', 'desc'), limit(20))
    expect((await getDocs(studentQuery)).docs.map((item) => item.id)).toContain(accepted)
    expect((await getDocs(mentorQuery)).docs.map((item) => item.id)).toContain(accepted)
    expect((await getDocs(studentQuery)).docs.map((item) => item.id)).not.toContain(pending)
    await expect(getDocs(query(collection(studentDb, 'helpRequests'), where('status', '==', 'ACCEPTED'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDocs(query(collection(getFirestore(apps.outsider), 'helpRequests'), where('studentId', '==', ids.student), where('status', '==', 'ACCEPTED'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDocs(collection(studentDb, 'conversations'))).rejects.toMatchObject({ code: 'permission-denied' })
    expect((await decide('mentor', pending, 'REJECTED')).data).toMatchObject({ kind: 'decided' })
  }, 30000)

  it('publishes a newly accepted own request through the live owner-list query without foreign rows (F02-TC-014)', async () => {
    const studentDb = getFirestore(apps.student)
    const ownerQuery = query(collection(studentDb, 'helpRequests'), where('studentId', '==', ids.student), where('status', '==', 'ACCEPTED'), orderBy('updatedAt', 'desc'), orderBy('__name__', 'desc'), limit(20))
    const events: string[][] = []
    let resolveInitial: (() => void) | null = null
    let resolveNew: (() => void) | null = null
    let rejectEvent: ((error: Error) => void) | null = null
    const initial = new Promise<void>((resolve, reject) => { resolveInitial = resolve; rejectEvent = reject })
    const arrived = new Promise<void>((resolve, reject) => { resolveNew = resolve; rejectEvent = reject })
    let acceptedId = ''
    const unsubscribe = onSnapshot(ownerQuery, (snapshot) => {
      const idsNow = snapshot.docs.map((item) => item.id)
      events.push(idsNow)
      resolveInitial?.()
      if (acceptedId && idsNow.includes(acceptedId)) resolveNew?.()
    }, (error) => rejectEvent?.(error))
    const foreignId = `foreign-${crypto.randomUUID()}`
    try {
      await initial
      acceptedId = await createRequest()
      expect((await decide('mentor', acceptedId, 'ACCEPTED')).data).toMatchObject({ kind: 'decided' })
      await arrived
      await db.collection('helpRequests').doc(foreignId).set({ id: foreignId, studentId: 'foreign-student', mentorId: ids.outsider, moduleId, title: 'Foreign', description: 'Foreign private request', status: 'ACCEPTED', createdAt: Timestamp.now(), updatedAt: Timestamp.now() })
      const fresh = (await getDocs(ownerQuery)).docs.map((item) => item.id)
      expect(fresh).toContain(acceptedId)
      expect(fresh).not.toContain(foreignId)
      expect(fresh[0]).toBe(acceptedId)
      expect(events.some((idsNow) => idsNow.includes(acceptedId))).toBe(true)
      expect(events.every((idsNow) => !idsNow.includes(foreignId) && new Set(idsNow).size === idsNow.length)).toBe(true)
    } finally { unsubscribe(); await db.collection('helpRequests').doc(foreignId).delete() }
  }, 30000)
})
