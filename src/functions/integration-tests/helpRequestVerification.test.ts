import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { createHelpRequestOutputSchema, respondToHelpRequestOutputSchema, type CreateHelpRequestInput, type RespondToHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-verification-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor', 'foreignMentor'] as const
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-verification-${role}` }, `f01-verification-${role}`)])) as Record<typeof roles[number], ReturnType<typeof initializeApp>>
const ids: Record<string, string> = {}
const modules = ['verification-input', 'verification-eligibility', 'verification-replay', 'verification-decision', 'verification-anomaly']
const create = httpsCallable<CreateHelpRequestInput, unknown>(getFunctions(apps.student, 'asia-southeast1'), 'createHelpRequest')
const decide = httpsCallable<RespondToHelpRequestInput, unknown>(getFunctions(apps.mentor, 'asia-southeast1'), 'respondToHelpRequest')
const input = (moduleId: string, operationId = crypto.randomUUID()): CreateHelpRequestInput => ({ operationId, mentorId: ids.mentor, moduleId, title: 'Question', description: 'Line one\nLine two' })
const tupleHash = (moduleId: string) => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')
const requestCount = async () => (await db.collection('helpRequests').where('studentId', '==', ids.student).get()).size
const receiptCount = async () => (await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get()).size

beforeAll(async () => {
  for (const role of roles) {
    const app = apps[role]
    const auth = getAuth(app)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFunctionsEmulator(getFunctions(app, 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f01-verification-${role}-${crypto.randomUUID()}@example.test`
    ids[role] = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user.uid
    await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(ids[role]).set({ id: ids[role], email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: new Date() })
  }
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: modules, active: true })
  for (const id of modules) await db.collection('modules').doc(id).set({ id, code: 'CS3227', title: id, active: true })
}, 30000)

afterAll(async () => {
  if (ids.student) {
    for (const snapshot of await Promise.all([
      db.collection('helpRequests').where('studentId', '==', ids.student).get(),
      db.collection('helpRequestOperations').doc(ids.student).collection('operations').get(),
      db.collection('pendingHelpRequestKeys').where('studentId', '==', ids.student).get(),
    ])) for (const item of snapshot.docs) await item.ref.delete()
    await db.collection('helpRequestSummaries').doc(ids.student).delete()
  }
  for (const id of modules) await db.collection('modules').doc(id).delete()
  if (ids.mentor) await db.collection('mentorProfiles').doc(ids.mentor).delete()
  for (const role of roles) {
    if (ids[role]) {
      await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(ids[role]).delete()
      await getAdminAuth(admin).deleteUser(ids[role])
    }
    await signOut(getAuth(apps[role]))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

describe('F01 standalone callable verification', () => {
  it('rejects invalid content and forged identity without any coordination writes; normalizes valid text', async () => {
    const base = input(modules[0]!)
    const before = [await requestCount(), await receiptCount()]
    for (const invalid of [
      { ...base, operationId: crypto.randomUUID(), title: '' },
      { ...base, operationId: crypto.randomUUID(), title: '  ' },
      { ...base, operationId: crypto.randomUUID(), title: 'x'.repeat(121) },
      { ...base, operationId: crypto.randomUUID(), description: 'x'.repeat(2001) },
      { ...base, operationId: crypto.randomUUID(), description: null },
      { ...base, operationId: crypto.randomUUID(), studentId: ids.foreignMentor },
      { ...base, operationId: crypto.randomUUID(), requestId: 'old-wire-key' },
    ]) await expect(create(invalid as never)).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    expect([await requestCount(), await receiptCount()]).toEqual(before)
    expect((await db.collection('pendingHelpRequestKeys').doc(tupleHash(modules[0]!)).get()).exists).toBe(false)
    const result = createHelpRequestOutputSchema.parse((await create({ ...base, title: '  Question  ', description: '  Line one\nLine two  ' })).data)
    expect(result.kind).toBe('created')
    if (result.kind !== 'created') throw new Error('Expected created request')
    const stored = (await db.collection('helpRequests').doc(result.helpRequest.id).get()).data()!
    expect(stored).toMatchObject({ studentId: ids.student, mentorId: ids.mentor, moduleId: modules[0], title: 'Question', description: 'Line one\nLine two', status: 'PENDING' })
    expect(stored.createdAt.toMillis()).toBe(stored.updatedAt.toMillis())
  }, 30000)

  it('denies unavailable Mentor and module variants without partial writes', async () => {
    const moduleId = modules[1]!
    const request = input(moduleId)
    const before = [await requestCount(), await receiptCount()]
    const denied = async () => {
      await expect(create({ ...request, operationId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'functions/failed-precondition' })
      expect([await requestCount(), await receiptCount()]).toEqual(before)
      expect((await db.collection('pendingHelpRequestKeys').doc(tupleHash(moduleId)).get()).exists).toBe(false)
    }
    const moduleRef = db.collection('modules').doc(moduleId)
    const profileRef = db.collection('mentorProfiles').doc(ids.mentor)
    const mentorRef = db.collection('mentors').doc(ids.mentor)
    await moduleRef.update({ active: false }); await denied(); await moduleRef.update({ active: true })
    await moduleRef.delete(); await denied(); await moduleRef.set({ id: moduleId, code: 'CS3227', title: moduleId, active: true })
    await profileRef.update({ active: false }); await denied(); await profileRef.update({ active: true })
    await profileRef.delete(); await denied(); await profileRef.set({ userId: ids.mentor, biography: '', moduleIds: modules, active: true })
    await profileRef.update({ moduleIds: [] }); await denied(); await profileRef.update({ moduleIds: modules })
    await mentorRef.update({ status: 'SUSPENDED' }); await expect(create({ ...request, operationId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'functions/permission-denied' }); await mentorRef.update({ status: 'ACTIVE' })
    expect([await requestCount(), await receiptCount()]).toEqual(before)
    expect(createHelpRequestOutputSchema.parse((await create(request)).data).kind).toBe('created')
  }, 30000)

  it('serializes the same UUID, rejects material replay changes, and reauthorizes before returning a receipt', async () => {
    const request = { ...input(modules[2]!), title: '  Replay question  ' }
    const [first, second] = await Promise.all([create(request), create(request)])
    const results = [first, second].map((item) => createHelpRequestOutputSchema.parse(item.data))
    expect(results.map((item) => item.kind)).toEqual(['created', 'created'])
    const created = results[0]
    if (created.kind !== 'created') throw new Error('Expected created request')
    expect(results[1]).toEqual(created)
    expect((await db.collection('pendingHelpRequestKeys').doc(tupleHash(modules[2]!)).get()).data()?.helpRequestId).toBe(created.helpRequest.id)
    expect(createHelpRequestOutputSchema.parse((await create({ ...request, title: 'Replay question' })).data)).toEqual(created)
    for (const changed of [{ title: 'Different' }, { description: 'Different' }, { mentorId: ids.foreignMentor }, { moduleId: modules[3] }]) {
      await expect(create({ ...request, ...changed })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    }
    const before = [await requestCount(), await receiptCount()]
    await db.collection('users').doc(ids.student).update({ status: 'SUSPENDED' })
    try { await expect(create(request)).rejects.toMatchObject({ code: 'functions/permission-denied' }) }
    finally { await db.collection('users').doc(ids.student).update({ status: 'ACTIVE' }) }
    await getAdminAuth(admin).updateUser(ids.student, { disabled: true })
    try { await expect(create(request)).rejects.toMatchObject({ code: 'functions/permission-denied' }) }
    finally { await getAdminAuth(admin).updateUser(ids.student, { disabled: false }) }
    expect([await requestCount(), await receiptCount()]).toEqual(before)
  }, 30000)

  it('preserves a valid pending request after profile/module changes and fails closed on an anomalous conversation', async () => {
    const moduleId = modules[3]!
    const result = createHelpRequestOutputSchema.parse((await create(input(moduleId))).data)
    if (result.kind !== 'created') throw new Error('Expected created request')
    await db.collection('modules').doc(moduleId).update({ active: false })
    await db.collection('mentorProfiles').doc(ids.mentor).update({ active: false })
    const decision = { operationId: crypto.randomUUID(), helpRequestId: result.helpRequest.id, response: 'REJECTED' as const }
    const rejected = respondToHelpRequestOutputSchema.parse((await decide(decision)).data)
    expect(rejected.kind).toBe('decided')
    expect((await db.collection('pendingHelpRequestKeys').doc(tupleHash(moduleId)).get()).exists).toBe(false)
    await db.collection('modules').doc(moduleId).update({ active: true })
    await db.collection('mentorProfiles').doc(ids.mentor).update({ active: true })

    const anomaly = createHelpRequestOutputSchema.parse((await create(input(modules[4]!))).data)
    if (anomaly.kind !== 'created') throw new Error('Expected created request')
    const conversationRef = db.collection('conversations').doc(anomaly.helpRequest.id)
    const requestRef = db.collection('helpRequests').doc(anomaly.helpRequest.id)
    const keyRef = db.collection('pendingHelpRequestKeys').doc(tupleHash(modules[4]!))
    const summaryBefore = (await db.collection('helpRequestSummaries').doc(ids.student).get()).data()
    await conversationRef.set({ helpRequestId: anomaly.helpRequest.id, studentId: ids.student, mentorId: ids.mentor, participantIds: [ids.student, ids.mentor] })
    try {
      const auditScript = fileURLToPath(new URL('../scripts/audit-help-requests.ts', import.meta.url))
      const audit = spawnSync(process.execPath, ['--import', 'tsx', auditScript], { env: { ...process.env, GCLOUD_PROJECT: projectId }, encoding: 'utf8' })
      expect(audit.status).toBe(1)
      expect(JSON.parse(audit.stdout).anomalies.nonaccepted_conversation).toBeGreaterThanOrEqual(1)
      await expect(decide({ operationId: crypto.randomUUID(), helpRequestId: anomaly.helpRequest.id, response: 'REJECTED' })).rejects.toMatchObject({ code: 'functions/failed-precondition' })
      expect((await requestRef.get()).data()?.status).toBe('PENDING')
      expect((await keyRef.get()).exists).toBe(true)
      expect((await db.collection('helpRequestSummaries').doc(ids.student).get()).data()).toEqual(summaryBefore)
    } finally { await conversationRef.delete() }
  }, 30000)
})
