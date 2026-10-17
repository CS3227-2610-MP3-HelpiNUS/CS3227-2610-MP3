import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { createHelpRequestOutputSchema, discoverMentorsOutputSchema, type CreateHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-selection-boundary-admin')
const db = getFirestore(admin)
const app = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'f01-selection-boundary' }, 'f01-selection-boundary')
const functions = getFunctions(app, 'asia-southeast1')
const create = httpsCallable<CreateHelpRequestInput, unknown>(functions, 'createHelpRequest')
const discover = httpsCallable<Record<string, never>, unknown>(functions, 'discoverMentors')
const ids = { student: '', mentor: '' }
const moduleId = `f01-eligibility-module-${crypto.randomUUID()}`
const moduleB = `f01-unsupported-module-${crypto.randomUUID()}`
const moduleCode = 'TC004'
const moduleLabel = 'Canonical label TC004'
const studentEmail = `f01-selection-${crypto.randomUUID()}@example.test`
const mentorEmail = `f01-selection-mentor-${crypto.randomUUID()}@example.test`
const title = 'Private selection question'
const tupleHash = (selectedModule: string) => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, selectedModule].map((part) => `${part.length}:${part}`))).digest('hex')
const input = (selectedModule = moduleId): CreateHelpRequestInput => ({ operationId: crypto.randomUUID(), mentorId: ids.mentor, moduleId: selectedModule, title, description: 'A private selection description.' })

async function snapshot() {
  const [requests, keys, receipts, summary] = await Promise.all([
    db.collection('helpRequests').get(),
    db.collection('pendingHelpRequestKeys').get(),
    db.collection('helpRequestOperations').doc(ids.student).collection('operations').get(),
    db.collection('helpRequestSummaries').doc(ids.student).get(),
  ])
  return {
    requests: requests.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b)),
    keys: keys.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b)),
    receipts: receipts.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b)),
    summary: summary.data() ?? null,
  }
}

async function rejectedSelection(name: string, payload: CreateHelpRequestInput, code: string, reason?: string) {
  const before = await snapshot()
  const error = await create(payload).then(() => null, (failure: unknown) => failure) as { code?: string; message?: string; details?: { reason?: string } } | null
  expect(error?.code, name).toBe(code)
  if (reason) expect(error?.details?.reason, name).toBe(reason)
  const message = String(error?.message ?? '')
  expect(message, name).toMatch(/(?:no longer available|Account access has changed)/u)
  for (const secret of [ids.student, ids.mentor, studentEmail, mentorEmail, title]) expect(message, name).not.toContain(secret)
  expect(await snapshot(), name).toEqual(before)
}

beforeAll(async () => {
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  const student = (await createUserWithEmailAndPassword(auth, studentEmail, 'Synthetic-123!')).user
  ids.student = student.uid
  await getAdminAuth(admin).updateUser(student.uid, { emailVerified: true })
  await student.reload()
  await getIdToken(student, true)
  ids.mentor = `f01-selection-mentor-${crypto.randomUUID()}`
  await db.collection('users').doc(ids.student).set({ id: ids.student, email: studentEmail, displayName: 'Selection Student', role: 'STUDENT', status: 'ACTIVE', createdAt: Timestamp.now() })
  await db.collection('users').doc(ids.mentor).set({ id: ids.mentor, email: mentorEmail, displayName: 'Selection Mentor', role: 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: moduleCode, title: moduleLabel, active: true })
  await db.collection('modules').doc(moduleB).set({ id: moduleB, code: 'TC004B', title: 'Unsupported module', active: true })
}, 30000)

afterAll(async () => {
  if (ids.student) {
    const [requests, receipts, keys] = await Promise.all([
      db.collection('helpRequests').where('studentId', '==', ids.student).get(),
      db.collection('helpRequestOperations').doc(ids.student).collection('operations').get(),
      db.collection('pendingHelpRequestKeys').where('studentId', '==', ids.student).get(),
    ])
    for (const doc of [...requests.docs, ...receipts.docs, ...keys.docs]) await doc.ref.delete()
    await db.collection('helpRequestSummaries').doc(ids.student).delete()
    await db.collection('users').doc(ids.student).delete()
    await getAdminAuth(admin).deleteUser(ids.student)
    await signOut(getAuth(app))
  }
  await db.collection('modules').doc(moduleId).delete()
  await db.collection('modules').doc(moduleB).delete()
  if (ids.mentor) {
    await db.collection('mentorProfiles').doc(ids.mentor).delete()
    await db.collection('users').doc(ids.mentor).delete()
  }
  await deleteApp(app)
  await deleteAdminApp(admin)
}, 30000)

describe('F01 current Mentor/module eligibility (TC-004)', () => {
  it('rejects missing and inactive account, profile, module, and unsupported module without writes', async () => {
    const userRef = db.collection('users').doc(ids.mentor)
    const profileRef = db.collection('mentorProfiles').doc(ids.mentor)
    const moduleRef = db.collection('modules').doc(moduleId)
    const account = (await userRef.get()).data()!
    const profile = (await profileRef.get()).data()!
    const module = (await moduleRef.get()).data()!
    await userRef.delete()
    try { await rejectedSelection('missing Mentor account', input(), 'functions/permission-denied') }
    finally { await userRef.set(account) }
    await userRef.update({ status: 'SUSPENDED' })
    try { await rejectedSelection('inactive Mentor account', input(), 'functions/permission-denied') }
    finally { await userRef.set(account) }
    await profileRef.delete()
    try { await rejectedSelection('missing Mentor profile', input(), 'functions/failed-precondition', 'SELECTION_INELIGIBLE') }
    finally { await profileRef.set(profile) }
    await profileRef.update({ active: false })
    try { await rejectedSelection('inactive Mentor profile', input(), 'functions/failed-precondition', 'SELECTION_INELIGIBLE') }
    finally { await profileRef.set(profile) }
    await moduleRef.delete()
    try { await rejectedSelection('missing module', input(), 'functions/failed-precondition', 'SELECTION_INELIGIBLE') }
    finally { await moduleRef.set(module) }
    await moduleRef.update({ active: false })
    try { await rejectedSelection('inactive module', input(), 'functions/failed-precondition', 'SELECTION_INELIGIBLE') }
    finally { await moduleRef.set(module) }
    await rejectedSelection('active but unsupported module B', input(moduleB), 'functions/failed-precondition', 'SELECTION_INELIGIBLE')
  }, 45000)

  it('rejects a once-discovered selection after it becomes stale and rejects label/code substitutes', async () => {
    const page = discoverMentorsOutputSchema.parse((await discover({})).data)
    expect(page.mentors).toContainEqual(expect.objectContaining({ userId: ids.mentor, moduleIds: [moduleId] }))
    const moduleRef = db.collection('modules').doc(moduleId)
    await moduleRef.update({ active: false })
    try { await rejectedSelection('module disabled after discovery', input(), 'functions/failed-precondition', 'SELECTION_INELIGIBLE') }
    finally { await moduleRef.update({ active: true }) }
    await rejectedSelection('module code in place of ID', input(moduleCode), 'functions/failed-precondition', 'SELECTION_INELIGIBLE')
    await rejectedSelection('module label in place of ID', input(moduleLabel), 'functions/failed-precondition', 'SELECTION_INELIGIBLE')
  }, 30000)

  it('accepts only the valid canonical catalogue ID and links all persisted coordination state', async () => {
    const before = await snapshot()
    expect(before.receipts).toEqual([])
    expect(before.summary).toBeNull()
    const payload = input()
    const result = createHelpRequestOutputSchema.parse((await create(payload)).data)
    expect(result.kind).toBe('created')
    if (result.kind !== 'created') throw new Error('Expected a fresh request')
    expect(result.helpRequest.moduleId).toBe(moduleId)
    const request = (await db.collection('helpRequests').doc(result.helpRequest.id).get()).data()
    expect(request).toMatchObject({ id: result.helpRequest.id, studentId: ids.student, mentorId: ids.mentor, moduleId, status: 'PENDING' })
    expect((await db.collection('pendingHelpRequestKeys').doc(tupleHash(moduleId)).get()).data()?.helpRequestId).toBe(result.helpRequest.id)
    expect((await db.collection('helpRequestOperations').doc(ids.student).collection('operations').doc(payload.operationId).get()).data()?.helpRequestId).toBe(result.helpRequest.id)
    expect((await db.collection('helpRequestSummaries').doc(ids.student).get()).data()).toMatchObject({ pendingCount: 1, openCount: 1 })
  }, 30000)
})
