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
const admin = initializeAdminApp({ projectId }, 'f01-close-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor', 'guest'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-close-${role}` }, `f01-close-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const ids = { student: '', mentor: '' }
const moduleId = `close-module-${crypto.randomUUID()}`
const createdIds: string[] = []
const tupleHash = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')
const callable = <Input>(role: Role, name: string) => httpsCallable<Input, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)

async function createRequest() {
  const result = createHelpRequestOutputSchema.parse((await callable<CreateHelpRequestInput>('student', 'createHelpRequest')({
    operationId: crypto.randomUUID(), mentorId: ids.mentor, moduleId,
    title: 'Dormant close boundary', description: 'A saved request must retain its approved status.',
  })).data)
  expect(result.kind).toBe('created')
  if (result.kind !== 'created') throw new Error('Expected a fresh request')
  createdIds.push(result.helpRequest.id)
  return result.helpRequest.id
}

async function decide(requestId: string, response: 'ACCEPTED' | 'REJECTED') {
  const result = respondToHelpRequestOutputSchema.parse((await callable<RespondToHelpRequestInput>('mentor', 'respondToHelpRequest')({
    operationId: crypto.randomUUID(), helpRequestId: requestId, response,
  })).data)
  expect(result.kind).toBe('decided')
}

async function snapshotState() {
  const requests = await db.collection('helpRequests').where('studentId', '==', ids.student).get()
  const receipts = await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get()
  const slots = await db.collection('availabilitySlots').where('mentorId', '==', ids.mentor).get()
  const appointments = await db.collection('appointments').where('studentId', '==', ids.student).get()
  const conversations = await Promise.all(createdIds.map(async (id) => [id, (await db.collection('conversations').doc(id).get()).data() ?? null] as const))
  return {
    requests: requests.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b)),
    receipts: receipts.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b)),
    key: (await db.collection('pendingHelpRequestKeys').doc(tupleHash()).get()).data() ?? null,
    summary: (await db.collection('helpRequestSummaries').doc(ids.student).get()).data() ?? null,
    conversations,
    slots: slots.docs.map((doc) => [doc.id, doc.data()] as const),
    appointments: appointments.docs.map((doc) => [doc.id, doc.data()] as const),
  }
}

beforeAll(async () => {
  for (const role of ['student', 'mentor'] as const) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f01-close-${role}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection('users').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  connectFunctionsEmulator(getFunctions(apps.guest, 'asia-southeast1'), '127.0.0.1', 5001)
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'CS3227', title: 'Dormant close module', active: true })
}, 30000)

afterAll(async () => {
  for (const id of createdIds) {
    await db.collection('conversations').doc(id).delete()
    await db.collection('helpRequests').doc(id).delete()
  }
  if (ids.student) {
    const receipts = await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get()
    for (const receipt of receipts.docs) await receipt.ref.delete()
    await db.collection('pendingHelpRequestKeys').doc(tupleHash()).delete()
    await db.collection('helpRequestSummaries').doc(ids.student).delete()
  }
  await db.collection('modules').doc(moduleId).delete()
  if (ids.mentor) await db.collection('mentorProfiles').doc(ids.mentor).delete()
  for (const role of ['student', 'mentor'] as const) {
    if (ids[role]) {
      await db.collection('users').doc(ids[role]).delete()
      await getAdminAuth(admin).deleteUser(ids[role])
    }
    await signOut(getAuth(apps[role]))
  }
  for (const role of roles) await deleteApp(apps[role])
  await deleteAdminApp(admin)
}, 30000)

describe('F01 dormant close boundary (TC-026, TC-007 compatibility)', () => {
  it('keeps every approved state unchanged for direct close calls by Student, Mentor and guest', async () => {
    const rejectedId = await createRequest()
    await decide(rejectedId, 'REJECTED')
    const acceptedId = await createRequest()
    await decide(acceptedId, 'ACCEPTED')
    const pendingId = await createRequest()
    const before = await snapshotState()
    expect(before.requests.map(([, data]) => data.status).sort()).toEqual(['ACCEPTED', 'PENDING', 'REJECTED'])
    expect(before.conversations.filter(([, data]) => data !== null).map(([id]) => id)).toEqual([acceptedId])
    expect(before.slots).toEqual([])
    expect(before.appointments).toEqual([])

    for (const id of [pendingId, rejectedId, acceptedId, `guessed-${crypto.randomUUID()}`]) {
      const input = { requestId: crypto.randomUUID(), helpRequestId: id }
      await expect(callable<typeof input>('student', 'closeHelpRequest')(input)).rejects.toMatchObject({ code: 'functions/unavailable' })
      await expect(callable<typeof input>('mentor', 'closeHelpRequest')(input)).rejects.toMatchObject({ code: 'functions/permission-denied' })
      await expect(callable<typeof input>('guest', 'closeHelpRequest')(input)).rejects.toMatchObject({ code: 'functions/unauthenticated' })
    }
    const after = await snapshotState()
    expect(after).toEqual(before)
    expect(after.requests.every(([, data]) => data.status !== 'CLOSED')).toBe(true)
  }, 45000)
})
