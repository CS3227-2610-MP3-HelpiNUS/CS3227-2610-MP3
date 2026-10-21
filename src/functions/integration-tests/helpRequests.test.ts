import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { createHelpRequestOutputSchema, respondToHelpRequestOutputSchema, type CreateHelpRequestInput, type RespondToHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-admin')
const db = getFirestore(admin)
const clients = ['student', 'mentor', 'other'] as const
const apps = Object.fromEntries(clients.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-${role}` }, `f01-${role}`)])) as Record<typeof clients[number], ReturnType<typeof initializeApp>>
const ids: Record<string, string> = {}
const create = httpsCallable<CreateHelpRequestInput, unknown>(getFunctions(apps.student, 'asia-southeast1'), 'createHelpRequest')
const decide = httpsCallable<RespondToHelpRequestInput, unknown>(getFunctions(apps.mentor, 'asia-southeast1'), 'respondToHelpRequest')

beforeAll(async () => {
  for (const role of clients) {
    const app = apps[role]
    const auth = getAuth(app)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFunctionsEmulator(getFunctions(app, 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f01-${role}-${crypto.randomUUID()}@example.test`
    ids[role] = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user.uid
    await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(ids[role]).set({ id: ids[role], email, displayName: role === 'student' ? 'Student Name' : `${role} Mentor`, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: new Date() })
  }
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: ['f01-module'], active: true })
  await db.collection('mentorProfiles').doc(ids.other).set({ userId: ids.other, biography: '', moduleIds: ['f01-module'], active: true })
  await db.collection('modules').doc('f01-module').set({ id: 'f01-module', code: 'CS3227', title: 'Software Engineering', active: true })
})

afterAll(async () => {
  if (ids.student) {
    for (const snapshot of await Promise.all([
      db.collection('helpRequests').where('studentId', '==', ids.student).get(),
      db.collection('helpRequestOperations').doc(ids.student).collection('operations').get(),
    ])) for (const item of snapshot.docs) await item.ref.delete()
    if (ids.next) await db.collection('conversations').doc(ids.next).delete()
    for (const mentorId of [ids.mentor, ids.other]) {
      const tupleHash = createHash('sha256').update(JSON.stringify([ids.student, mentorId, 'f01-module'].map((part) => `${part.length}:${part}`))).digest('hex')
      await db.collection('pendingHelpRequestKeys').doc(tupleHash).delete()
      await db.collection('mentorProfiles').doc(mentorId).delete()
    }
    await db.collection('helpRequestSummaries').doc(ids.student).delete()
    await db.collection('modules').doc('f01-module').delete()
    for (const role of clients) {
      await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(ids[role]).delete()
      await getAdminAuth(admin).deleteUser(ids[role])
    }
  }
  for (const role of clients) { await signOut(getAuth(apps[role])); await deleteApp(apps[role]) }
  await deleteAdminApp(admin)
})

const input = (operationId = crypto.randomUUID(), title = 'Question one'): CreateHelpRequestInput => ({ operationId, mentorId: ids.mentor, moduleId: 'f01-module', title, description: 'Line one\nLine two' })

describe('F01 callable persistence and authorization', () => {
  it('denies unauthenticated and forged creation', async () => {
    const unauthed = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'f01-guest' }, 'f01-guest')
    const functions = getFunctions(unauthed, 'asia-southeast1')
    connectFunctionsEmulator(functions, '127.0.0.1', 5001)
    await expect(httpsCallable(functions, 'createHelpRequest')(input())).rejects.toMatchObject({ code: 'functions/unauthenticated' })
    await deleteApp(unauthed)
    await expect(create({ ...input(), studentId: ids.other } as never)).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    await expect(httpsCallable(getFunctions(apps.mentor, 'asia-southeast1'), 'createHelpRequest')(input())).rejects.toMatchObject({ code: 'functions/failed-precondition' })
  })

  it('serializes distinct concurrent operations and replays the same operation', async () => {
    const firstInput = input()
    const secondInput = input()
    const results = await Promise.all([create(firstInput), create(secondInput)])
    const parsed = results.map((result) => createHelpRequestOutputSchema.parse(result.data))
    expect(parsed.map((result) => result.kind).sort()).toEqual(['created', 'duplicate'])
    const created = parsed.find((result) => result.kind === 'created')!
    const duplicate = parsed.find((result) => result.kind === 'duplicate')!
    expect(duplicate.existingHelpRequestId).toBe(created.helpRequest.id)
    expect(created.helpRequest.studentId).toBe(ids.student)
    expect(created.helpRequest.mentorId).toBe(ids.mentor)
    expect(created.helpRequest.description).toBe('Line one\nLine two')
    expect(created.helpRequest.id).not.toBe(firstInput.operationId)
    expect(created.helpRequest.id).not.toBe(secondInput.operationId)
    expect((await db.collection('helpRequests').where('studentId', '==', ids.student).get()).size).toBe(1)
    const tupleHash = createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, 'f01-module'].map((part) => `${part.length}:${part}`))).digest('hex')
    expect((await db.collection('pendingHelpRequestKeys').doc(tupleHash).get()).data()).toMatchObject({ helpRequestId: created.helpRequest.id, studentId: ids.student, mentorId: ids.mentor })
    const originalInput = parsed[0].kind === 'created' ? firstInput : secondInput
    ids.createdOperationId = originalInput.operationId
    ids.duplicateOperationId = parsed[0].kind === 'duplicate' ? firstInput.operationId : secondInput.operationId
    expect(createHelpRequestOutputSchema.parse((await create(originalInput)).data)).toEqual(created)
    await expect(create({ ...originalInput, title: 'Changed payload' })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    expect((await db.collection('helpRequestSummaries').doc(ids.student).get()).data()).toMatchObject({ pendingCount: 1, openCount: 1 })
    expect((await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get()).size).toBe(2)
    ids.request = created.helpRequest.id
  })

  it('denies foreign decision; rejects atomically and gives deterministic repeats', async () => {
    const own = { operationId: crypto.randomUUID(), helpRequestId: ids.request, response: 'REJECTED' as const }
    const before = (await db.collection('helpRequests').doc(ids.request).get()).data()!
    await expect(httpsCallable(getFunctions(apps.other, 'asia-southeast1'), 'respondToHelpRequest')(own)).rejects.toMatchObject({ code: 'functions/permission-denied' })
    await expect(httpsCallable(getFunctions(apps.student, 'asia-southeast1'), 'respondToHelpRequest')(own)).rejects.toMatchObject({ code: 'functions/failed-precondition' })
    const first = respondToHelpRequestOutputSchema.parse((await decide(own)).data)
    expect(first.kind).toBe('decided')
    const repeated = respondToHelpRequestOutputSchema.parse((await decide({ ...own, operationId: crypto.randomUUID() })).data)
    expect(repeated.kind).toBe('already_decided')
    expect((await db.collection('helpRequests').doc(ids.request).get()).data()?.updatedAt.toMillis()).toBe(first.kind === 'decided' ? Date.parse(first.helpRequest.updatedAt) : NaN)
    expect(respondToHelpRequestOutputSchema.parse((await decide({ ...own, response: 'ACCEPTED' })).data)).toEqual({ kind: 'conflict', actualStatus: 'REJECTED' })
    expect((await db.collection('helpRequests').doc(ids.request).get()).data()?.status).toBe('REJECTED')
    const after = (await db.collection('helpRequests').doc(ids.request).get()).data()!
    expect(after.updatedAt.toMillis()).toBeGreaterThanOrEqual(before.updatedAt.toMillis())
    const tupleHash = createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, 'f01-module'].map((part) => `${part.length}:${part}`))).digest('hex')
    expect((await db.collection('pendingHelpRequestKeys').doc(tupleHash).get()).exists).toBe(false)
    expect((await db.collection('conversations').doc(ids.request).get()).exists).toBe(false)
    expect((await db.collection('helpRequestSummaries').doc(ids.student).get()).data()).toMatchObject({ pendingCount: 0, rejectedCount: 1, openCount: 0 })
    const replay = createHelpRequestOutputSchema.parse((await create({ ...input(ids.createdOperationId), title: 'Question one' })).data)
    expect(replay.kind).toBe('created')
    if (replay.kind === 'created') expect(replay.helpRequest.status).toBe('REJECTED')
    const duplicateReplay = createHelpRequestOutputSchema.parse((await create(input(ids.duplicateOperationId))).data)
    expect(duplicateReplay).toEqual({ kind: 'duplicate', existingHelpRequestId: ids.request, currentStatus: 'REJECTED' })
    const next = createHelpRequestOutputSchema.parse((await create(input())).data)
    expect(next.kind).toBe('created')
    if (next.kind === 'created') ids.next = next.helpRequest.id
  })

  it('atomically accepts through the real F02 provisioner', async () => {
    const result = respondToHelpRequestOutputSchema.parse((await decide({ operationId: crypto.randomUUID(), helpRequestId: ids.next, response: 'ACCEPTED' })).data)
    expect(result.kind).toBe('decided')
    expect((await db.collection('helpRequests').doc(ids.next).get()).data()?.status).toBe('ACCEPTED')
    const stored = (await db.collection('conversations').doc(ids.next).get()).data()
    expect(stored).toMatchObject({ id: ids.next, helpRequestId: ids.next, studentId: ids.student, mentorId: ids.mentor, participantIds: [ids.student, ids.mentor] })
    expect(stored?.createdAt.isEqual((await db.collection('helpRequests').doc(ids.next).get()).data()?.updatedAt)).toBe(true)
  })

  it('rejects stale Mentor/module selection and changed account authorization without writes', async () => {
    const before = (await db.collection('helpRequests').where('studentId', '==', ids.student).get()).size
    await db.collection('modules').doc('f01-module').update({ active: false })
    await expect(create(input())).rejects.toMatchObject({ code: 'functions/failed-precondition' })
    await db.collection('modules').doc('f01-module').update({ active: true })
    await db.collection('mentorProfiles').doc(ids.mentor).update({ active: false })
    await expect(create(input())).rejects.toMatchObject({ code: 'functions/failed-precondition' })
    await db.collection('mentorProfiles').doc(ids.mentor).update({ active: true })
    await db.collection('users').doc(ids.student).update({ status: 'SUSPENDED' })
    await expect(create(input(ids.createdOperationId))).rejects.toMatchObject({ code: 'functions/permission-denied' })
    await db.collection('users').doc(ids.student).update({ status: 'ACTIVE' })
    await db.collection('mentors').doc(ids.mentor).update({ status: 'SUSPENDED' })
    await expect(decide({ operationId: crypto.randomUUID(), helpRequestId: ids.next, response: 'REJECTED' })).rejects.toMatchObject({ code: 'functions/permission-denied' })
    await db.collection('mentors').doc(ids.mentor).update({ status: 'ACTIVE' })
    expect((await db.collection('helpRequests').where('studentId', '==', ids.student).get()).size).toBe(before)
    expect((await db.collection('helpRequests').doc(ids.next).get()).data()?.status).toBe('ACCEPTED')
  }, 20000)

  it('fails closed on corrupt pending tuple and summary data', async () => {
    const tupleHash = createHash('sha256').update(JSON.stringify([ids.student, ids.other, 'f01-module'].map((part) => `${part.length}:${part}`))).digest('hex')
    const keyRef = db.collection('pendingHelpRequestKeys').doc(tupleHash)
    await keyRef.set({ studentId: ids.student, mentorId: ids.other, moduleId: 'f01-module', helpRequestId: 'missing-request' })
    await expect(create({ ...input(), mentorId: ids.other })).rejects.toMatchObject({ code: 'functions/failed-precondition' })
    await keyRef.delete()
    const summaryRef = db.collection('helpRequestSummaries').doc(ids.student)
    const original = (await summaryRef.get()).data()!
    await summaryRef.update({ openCount: 999 })
    await expect(decide({ operationId: crypto.randomUUID(), helpRequestId: ids.next, response: 'REJECTED' })).rejects.toMatchObject({ code: 'functions/failed-precondition' })
    await summaryRef.set(original)
    expect((await db.collection('helpRequests').doc(ids.next).get()).data()?.status).toBe('ACCEPTED')
  }, 20000)
})
