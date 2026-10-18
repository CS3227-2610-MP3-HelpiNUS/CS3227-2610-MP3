import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { createHelpRequestOutputSchema, type CreateHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-replay-boundary-admin')
const db = getFirestore(admin)
const adminAuth = getAdminAuth(admin)
const roles = ['studentA', 'studentB'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-replay-${role}` }, `f01-replay-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const ids = { studentA: '', studentB: '', mentorA: '', mentorB: '' }
const emails = { studentA: '', studentB: '' }
const password = 'Synthetic-123!'
const moduleA = `f01-replay-a-${crypto.randomUUID()}`
const moduleB = `f01-replay-b-${crypto.randomUUID()}`
const operationId = crypto.randomUUID()
const title = 'Private replay question'
const description = 'Line one\nPrivate details'
let requestA = ''
let requestB = ''
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const tupleHash = (studentId: string, mentorId: string, moduleId: string) => hash([studentId, mentorId, moduleId].map((part) => `${part.length}:${part}`))
const auth = (role: Role) => getAuth(apps[role])
const call = (role: Role) => httpsCallable<CreateHelpRequestInput, unknown>(getFunctions(apps[role], 'asia-southeast1'), 'createHelpRequest')
const payload = (): CreateHelpRequestInput => ({ operationId, mentorId: ids.mentorA, moduleId: moduleA, title: `  ${title}  `, description: `  ${description}  ` })

async function snapshot() {
  const [requests, keys, receiptsA, receiptsB, summaryA, summaryB] = await Promise.all([
    db.collection('helpRequests').get(),
    db.collection('pendingHelpRequestKeys').get(),
    db.collection('helpRequestOperations').doc(ids.studentA).collection('operations').get(),
    db.collection('helpRequestOperations').doc(ids.studentB).collection('operations').get(),
    db.collection('helpRequestSummaries').doc(ids.studentA).get(),
    db.collection('helpRequestSummaries').doc(ids.studentB).get(),
  ])
  const rows = (docs: typeof requests.docs) => docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b))
  return { requests: rows(requests.docs), keys: rows(keys.docs), receiptsA: rows(receiptsA.docs), receiptsB: rows(receiptsB.docs), summaryA: summaryA.data() ?? null, summaryB: summaryB.data() ?? null }
}

async function denied(name: string, attempt: () => Promise<unknown>, code: string, reason?: string) {
  const before = await snapshot()
  const error = await attempt().then(() => null, (failure: unknown) => failure) as { code?: string; message?: string; details?: { reason?: string } } | null
  expect(error?.code, name).toBe(code)
  if (reason) expect(error?.details?.reason, name).toBe(reason)
  const surfaced = JSON.stringify({ message: error?.message, details: error?.details })
  for (const secret of [requestA, ids.studentA, ids.mentorA, title, description, emails.studentA]) {
    if (secret) expect(surfaced, name).not.toContain(secret)
  }
  expect(await snapshot(), name).toEqual(before)
}

async function restoreStudentA(storedUser: FirebaseFirestore.DocumentData) {
  await db.collection('users').doc(ids.studentA).set(storedUser)
  await adminAuth.updateUser(ids.studentA, { disabled: false, emailVerified: true, email: emails.studentA })
  if (!auth('studentA').currentUser) await signInWithEmailAndPassword(auth('studentA'), emails.studentA, password)
  await auth('studentA').currentUser!.reload()
  await getIdToken(auth('studentA').currentUser!, true)
}

beforeAll(async () => {
  for (const role of roles) {
    connectAuthEmulator(auth(role), 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f01-replay-${role.toLowerCase()}-${crypto.randomUUID()}@integration.invalid`
    emails[role] = email
    const user = (await createUserWithEmailAndPassword(auth(role), email, password)).user
    ids[role] = user.uid
    await adminAuth.updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection('users').doc(user.uid).set({ id: user.uid, email, displayName: role, role: 'STUDENT', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  ids.mentorA = `f01-replay-mentor-a-${crypto.randomUUID()}`
  ids.mentorB = `f01-replay-mentor-b-${crypto.randomUUID()}`
  for (const [mentorId, suffix] of [[ids.mentorA, 'A'], [ids.mentorB, 'B']] as const) {
    await db.collection('users').doc(mentorId).set({ id: mentorId, email: `mentor-${suffix}@example.test`, displayName: `Replay Mentor ${suffix}`, role: 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
    await db.collection('mentorProfiles').doc(mentorId).set({ userId: mentorId, biography: '', moduleIds: [moduleA, moduleB], active: true })
  }
  await db.collection('modules').doc(moduleA).set({ id: moduleA, code: 'TC011A', title: 'Replay A', active: true })
  await db.collection('modules').doc(moduleB).set({ id: moduleB, code: 'TC011B', title: 'Replay B', active: true })
}, 30000)

afterAll(async () => {
  for (const id of [requestA, requestB]) if (id) await db.collection('helpRequests').doc(id).delete()
  for (const role of roles) {
    const id = ids[role]
    if (!id) continue
    await db.collection('pendingHelpRequestKeys').doc(tupleHash(id, ids.mentorA, moduleA)).delete()
    await db.collection('helpRequestOperations').doc(id).collection('operations').doc(operationId).delete()
    await db.collection('helpRequestSummaries').doc(id).delete()
    await db.collection('users').doc(id).delete()
    await adminAuth.deleteUser(id)
    await signOut(auth(role))
    await deleteApp(apps[role])
  }
  for (const mentorId of [ids.mentorA, ids.mentorB]) if (mentorId) {
    await db.collection('mentorProfiles').doc(mentorId).delete()
    await db.collection('users').doc(mentorId).delete()
  }
  await db.collection('modules').doc(moduleA).delete()
  await db.collection('modules').doc(moduleB).delete()
  await deleteAdminApp(admin)
}, 30000)

describe('F01 durable replay binding and revocation (TC-011/012)', () => {
  it('rejects material same-UUID changes without writes and replays normalized-equivalent content', async () => {
    const original = createHelpRequestOutputSchema.parse((await call('studentA')(payload())).data)
    expect(original.kind).toBe('created')
    if (original.kind !== 'created') throw new Error('Expected first request')
    requestA = original.helpRequest.id
    const receipt = (await db.collection('helpRequestOperations').doc(ids.studentA).collection('operations').doc(operationId).get()).data()
    expect(receipt).toEqual({ studentId: ids.studentA, fingerprint: hash([ids.mentorA, moduleA, title, description]), kind: 'CREATED', helpRequestId: requestA })
    const baseline = await snapshot()
    for (const [name, changed] of [
      ['title', { title: 'Changed title' }],
      ['description', { description: 'Changed description' }],
      ['Mentor', { mentorId: ids.mentorB }],
      ['module', { moduleId: moduleB }],
    ] as const) await denied(name, () => call('studentA')({ ...payload(), ...changed }), 'functions/invalid-argument', 'OPERATION_ID_REUSED')
    expect(await snapshot()).toEqual(baseline)
    const equivalent = { ...payload(), title, description }
    expect(createHelpRequestOutputSchema.parse((await call('studentA')(equivalent)).data)).toEqual(original)
    expect(await snapshot()).toEqual(baseline)
  }, 30000)

  it('reauthorizes before same-UUID replay and isolates a foreign Student receipt', async () => {
    expect(requestA).not.toBe('')
    const baseline = await snapshot()
    const storedUser = (await db.collection('users').doc(ids.studentA).get()).data()!
    const variants = [
      { name: 'signed out', code: 'functions/unauthenticated', change: () => signOut(auth('studentA')) },
      { name: 'wrong role', code: 'functions/permission-denied', change: () => db.collection('users').doc(ids.studentA).update({ role: 'MENTOR' }) },
      { name: 'inactive', code: 'functions/permission-denied', change: () => db.collection('users').doc(ids.studentA).update({ status: 'SUSPENDED' }) },
      { name: 'disabled Auth', code: 'functions/permission-denied', change: () => adminAuth.updateUser(ids.studentA, { disabled: true }) },
      { name: 'refreshed unverified token', code: 'functions/failed-precondition', change: async () => { await adminAuth.updateUser(ids.studentA, { emailVerified: false }); await auth('studentA').currentUser!.reload(); await getIdToken(auth('studentA').currentUser!, true) } },
    ]
    for (const variant of variants) {
      try {
        await variant.change()
        await denied(variant.name, () => call('studentA')(payload()), variant.code)
        expect(await snapshot(), variant.name).toEqual(baseline)
      } finally { await restoreStudentA(storedUser) }
      expect(createHelpRequestOutputSchema.parse((await call('studentA')(payload())).data).kind).toBe('created')
      expect(await snapshot(), `${variant.name} after restoration`).toEqual(baseline)
    }

    const foreign = createHelpRequestOutputSchema.parse((await call('studentB')({ ...payload(), title: 'Student B independent question' })).data)
    expect(foreign.kind).toBe('created')
    if (foreign.kind !== 'created') throw new Error('Expected independent Student B request')
    requestB = foreign.helpRequest.id
    expect(requestB).not.toBe(requestA)
    expect(foreign.helpRequest.studentId).toBe(ids.studentB)
    expect(JSON.stringify(foreign)).not.toContain(title)
    const after = await snapshot()
    expect(after.requests.filter(([, value]) => value.studentId === ids.studentA)).toEqual(baseline.requests.filter(([, value]) => value.studentId === ids.studentA))
    expect(after.receiptsA).toEqual(baseline.receiptsA)
    expect(after.summaryA).toEqual(baseline.summaryA)
    expect(after.receiptsB).toEqual([[operationId, { studentId: ids.studentB, fingerprint: hash([ids.mentorA, moduleA, 'Student B independent question', description]), kind: 'CREATED', helpRequestId: requestB }]])
    expect(after.summaryB).toMatchObject({ pendingCount: 1, acceptedCount: 0, rejectedCount: 0, openCount: 1 })
  }, 90000)
})
