import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { createHelpRequestInputSchema, createHelpRequestOutputSchema } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-content-boundary-admin')
const db = getFirestore(admin)
const app = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'f01-content-boundary' }, 'f01-content-boundary')
const create = httpsCallable<unknown, unknown>(getFunctions(app, 'asia-southeast1'), 'createHelpRequest')
const moduleId = `f01-content-${crypto.randomUUID()}`
const ids = { student: '', mentor: '' }
const email = `f01-content-${crypto.randomUUID()}@example.test`
const tupleHash = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')
const base = () => ({ operationId: crypto.randomUUID(), mentorId: ids.mentor, moduleId, title: 'Question', description: 'Explain the topic' })

async function snapshot() {
  const [requests, receipts, key, summary] = await Promise.all([
    db.collection('helpRequests').get(),
    db.collection('helpRequestOperations').doc(ids.student).collection('operations').get(),
    db.collection('pendingHelpRequestKeys').doc(tupleHash()).get(),
    db.collection('helpRequestSummaries').doc(ids.student).get(),
  ])
  return {
    requests: requests.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b)),
    receipts: receipts.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b)),
    key: key.data() ?? null,
    summary: summary.data() ?? null,
  }
}

beforeAll(async () => {
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFunctionsEmulator(getFunctions(app, 'asia-southeast1'), '127.0.0.1', 5001)
  const student = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
  ids.student = student.uid
  await getAdminAuth(admin).updateUser(student.uid, { emailVerified: true })
  await student.reload()
  await getIdToken(student, true)
  ids.mentor = `f01-content-mentor-${crypto.randomUUID()}`
  await db.collection('users').doc(ids.student).set({ id: ids.student, email, displayName: 'Content Student', role: 'STUDENT', status: 'ACTIVE', createdAt: Timestamp.now() })
  await db.collection('users').doc(ids.mentor).set({ id: ids.mentor, email: 'mentor@example.test', displayName: 'Content Mentor', role: 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'CS3227', title: 'Content boundary', active: true })
}, 30000)

afterAll(async () => {
  if (ids.student) {
    const [requests, receipts] = await Promise.all([
      db.collection('helpRequests').where('studentId', '==', ids.student).get(),
      db.collection('helpRequestOperations').doc(ids.student).collection('operations').get(),
    ])
    for (const doc of [...requests.docs, ...receipts.docs]) await doc.ref.delete()
    await db.collection('pendingHelpRequestKeys').doc(tupleHash()).delete()
    await db.collection('helpRequestSummaries').doc(ids.student).delete()
    await db.collection('users').doc(ids.student).delete()
    await getAdminAuth(admin).deleteUser(ids.student)
    await signOut(getAuth(app))
  }
  await db.collection('modules').doc(moduleId).delete()
  if (ids.mentor) {
    await db.collection('mentorProfiles').doc(ids.mentor).delete()
    await db.collection('users').doc(ids.mentor).delete()
  }
  await deleteApp(app)
  await deleteAdminApp(admin)
}, 30000)

describe('F01 authoritative content validation (TC-003)', () => {
  it('rejects each malformed field without any request or coordination write', async () => {
    const cases: Array<{ name: string; field: string; input: Record<string, unknown> }> = [
      { name: 'missing title', field: 'title', input: { ...base(), title: undefined } },
      { name: 'null title', field: 'title', input: { ...base(), title: null } },
      { name: 'whitespace title', field: 'title', input: { ...base(), title: ' \t\n ' } },
      { name: 'malformed title', field: 'title', input: { ...base(), title: { text: 'Question' } } },
      { name: '121 normalized title characters', field: 'title', input: { ...base(), title: `  ${'x'.repeat(121)}  ` } },
      { name: 'missing description', field: 'description', input: { ...base(), description: undefined } },
      { name: 'null description', field: 'description', input: { ...base(), description: null } },
      { name: 'whitespace description', field: 'description', input: { ...base(), description: ' \n\t ' } },
      { name: 'malformed description', field: 'description', input: { ...base(), description: ['Line one'] } },
      { name: '2001 normalized description characters', field: 'description', input: { ...base(), description: `  ${'x'.repeat(2001)}  ` } },
      { name: 'forged student identity', field: '_root', input: { ...base(), studentId: 'another-student' } },
    ]
    for (const { name, field, input } of cases) {
      expect(createHelpRequestInputSchema.safeParse(input).success, name).toBe(false)
      const before = await snapshot()
      expect(before.receipts, name).toEqual([])
      expect(before.key, name).toBeNull()
      expect(before.summary, name).toBeNull()
      const error = await create(input).then(() => null, (reason: unknown) => reason) as { code?: string; details?: { fieldErrors?: Record<string, string[]> } } | null
      expect(error?.code, name).toBe('functions/invalid-argument')
      expect(error?.details?.fieldErrors?.[field], name).toEqual(expect.arrayContaining([expect.any(String)]))
      expect(await snapshot(), name).toEqual(before)
    }
  }, 45000)

  it('stores only outer-trimmed 120/2000 boundary text while preserving literal multiline content', async () => {
    const title = 'Q'.repeat(120)
    const prefix = 'Line one\nLine two <b>literal</b> & "quoted"\n'
    const description = prefix + 'x'.repeat(2000 - prefix.length)
    const input = { ...base(), title: ` \t${title}\n `, description: ` \n${description}\t ` }
    expect(createHelpRequestInputSchema.parse(input)).toEqual({ ...input, title, description })
    const result = createHelpRequestOutputSchema.parse((await create(input)).data)
    expect(result.kind).toBe('created')
    if (result.kind !== 'created') throw new Error('Expected a fresh request')
    const stored = (await db.collection('helpRequests').doc(result.helpRequest.id).get()).data()
    expect(stored).toMatchObject({
      id: result.helpRequest.id, studentId: ids.student, mentorId: ids.mentor, moduleId,
      title, description, status: 'PENDING',
    })
    expect(stored?.title).toBe(title)
    expect(stored?.description).toBe(description)
    expect(stored?.description).toContain('Line one\nLine two <b>literal</b> & "quoted"\n')
    expect(result.helpRequest.title).toBe(title)
    expect(result.helpRequest.description).toBe(description)
    expect((await db.collection('pendingHelpRequestKeys').doc(tupleHash()).get()).data()?.helpRequestId).toBe(result.helpRequest.id)
    expect((await db.collection('helpRequestOperations').doc(ids.student).collection('operations').doc(input.operationId).get()).data()?.helpRequestId).toBe(result.helpRequest.id)
    expect((await db.collection('helpRequestSummaries').doc(ids.student).get()).data()).toMatchObject({ pendingCount: 1, openCount: 1 })
  }, 30000)
})
