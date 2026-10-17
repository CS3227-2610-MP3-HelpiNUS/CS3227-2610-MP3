import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore'
import type { CreateHelpRequestInput, RespondToHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-auth-matrix-admin')
const db = getAdminFirestore(admin)
const adminAuth = getAdminAuth(admin)
const password = 'Synthetic-123!'
const moduleId = `f01-auth-module-${crypto.randomUUID()}`
const operationId = crypto.randomUUID()
const decisionId = crypto.randomUUID()
const roles = ['student', 'mentor'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-auth-matrix-${role}` }, `f01-auth-matrix-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const ids: Record<Role, string> = { student: '', mentor: '' }
const emails: Record<Role, string> = { student: '', mentor: '' }
let requestId = ''

const auth = (role: Role) => getAuth(apps[role])
const callable = <T>(role: Role, name: string) => httpsCallable<T, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)
const input = (): CreateHelpRequestInput => ({ operationId, mentorId: ids.mentor, moduleId, title: 'Private authorization question', description: 'Saved request must survive denied calls.' })
const decision = (): RespondToHelpRequestInput => ({ operationId: decisionId, helpRequestId: requestId, response: 'ACCEPTED' })
const keyId = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')
const receipts = () => db.collection('helpRequestOperations').doc(ids.student).collection('operations')

async function coordination() {
  const [request, key, summary, receipt, conversation, allReceipts, allRequests] = await Promise.all([
    db.collection('helpRequests').doc(requestId).get(),
    db.collection('pendingHelpRequestKeys').doc(keyId()).get(),
    db.collection('helpRequestSummaries').doc(ids.student).get(),
    receipts().doc(operationId).get(),
    db.collection('conversations').doc(requestId).get(),
    receipts().get(),
    db.collection('helpRequests').where('studentId', '==', ids.student).get(),
  ])
  return {
    request: request.data() ?? null, key: key.data() ?? null, summary: summary.data() ?? null,
    receipt: receipt.data() ?? null, conversation: conversation.data() ?? null,
    receiptIds: allReceipts.docs.map((item) => item.id).sort(),
    requestIds: allRequests.docs.map((item) => item.id).sort(),
  }
}

async function denial(promise: Promise<unknown>, code: string) {
  const error = await promise.then(() => null, (reason: unknown) => reason) as { code?: string; message?: string } | null
  expect(error).toMatchObject({ code })
  const text = String(error?.message ?? '')
  for (const secret of [requestId, operationId, emails.student, emails.mentor, 'Private authorization question']) expect(text).not.toContain(secret)
}

async function restore(role: Role, storedUser: FirebaseFirestore.DocumentData, originalAuthEmail: string) {
  await db.collection('users').doc(ids[role]).set(storedUser)
  await adminAuth.updateUser(ids[role], { disabled: false, email: originalAuthEmail, emailVerified: true })
  if (!auth(role).currentUser) await signInWithEmailAndPassword(auth(role), originalAuthEmail, password)
  await auth(role).currentUser!.reload()
  await getIdToken(auth(role).currentUser!, true)
}

beforeAll(async () => {
  for (const role of roles) {
    const clientAuth = auth(role)
    connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    connectFirestoreEmulator(getFirestore(apps[role]), '127.0.0.1', 8080)
    emails[role] = `f01-auth-${role}-${crypto.randomUUID()}@integration.invalid`
    ids[role] = (await createUserWithEmailAndPassword(clientAuth, emails[role], password)).user.uid
    await adminAuth.updateUser(ids[role], { emailVerified: true })
    await clientAuth.currentUser!.reload()
    await getIdToken(clientAuth.currentUser!, true)
    await db.collection('users').doc(ids[role]).set({ id: ids[role], email: emails[role], displayName: `Authorization ${role}`, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'CS3227', title: 'Authorization module', active: true })
  const result = (await callable<CreateHelpRequestInput>('student', 'createHelpRequest')(input())).data as { kind: string; helpRequest: { id: string } }
  expect(result.kind).toBe('created')
  requestId = result.helpRequest.id
}, 30000)

afterAll(async () => {
  if (requestId) {
    const messages = await db.collection('conversations').doc(requestId).collection('messages').get()
    for (const message of messages.docs) await message.ref.delete()
    await db.collection('conversations').doc(requestId).delete()
    await db.collection('helpRequests').doc(requestId).delete()
  }
  if (ids.student) {
    const operations = await receipts().get()
    for (const item of operations.docs) await item.ref.delete()
    await db.collection('pendingHelpRequestKeys').doc(keyId()).delete()
    await db.collection('helpRequestSummaries').doc(ids.student).delete()
  }
  await db.collection('modules').doc(moduleId).delete()
  if (ids.mentor) await db.collection('mentorProfiles').doc(ids.mentor).delete()
  for (const role of roles) {
    if (ids[role]) { await db.collection('users').doc(ids[role]).delete(); await adminAuth.deleteUser(ids[role]) }
    await signOut(auth(role))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

describe('F01 current authority and explicit IDs on production callables', () => {
  it('derives the eligible creator from Auth and rejects forged identity and outcome fields (TC-005)', async () => {
    const baseline = await coordination()
    const signedIn = auth('student').currentUser
    expect(signedIn?.uid).toBe(ids.student)
    expect(signedIn?.email).toBe(emails.student)
    expect(input()).not.toHaveProperty('studentId')
    expect(baseline.request).toMatchObject({ id: requestId, studentId: signedIn?.uid, mentorId: ids.mentor, moduleId })
    expect(baseline.receipt).toMatchObject({ studentId: signedIn?.uid, helpRequestId: requestId })
    const rawCreate = callable<Record<string, unknown>>('student', 'createHelpRequest')
    for (const forged of [
      { studentId: ids.mentor },
      { studentId: ids.student },
      { studentDisplayName: 'Forged Student' },
      { email: emails.mentor },
      { status: 'ACCEPTED' },
      { createdAt: new Date(0).toISOString() },
    ]) {
      await denial(rawCreate({ ...input(), ...forged }), 'functions/invalid-argument')
      expect(await coordination(), JSON.stringify(forged)).toEqual(baseline)
    }
    expect((await callable<CreateHelpRequestInput>('student', 'createHelpRequest')(input())).data)
      .toMatchObject({ kind: 'created', helpRequest: { id: requestId, studentId: ids.student } })
    expect(await coordination()).toEqual(baseline)
  }, 30000)

  it('denies Student creation and persisted-receipt replay after account changes, then resumes unchanged (TC-005/012/039)', async () => {
    const baseline = await coordination()
    expect(baseline.request?.status).toBe('PENDING')
    expect(baseline.receipt).toMatchObject({ studentId: ids.student, kind: 'CREATED', helpRequestId: requestId })
    expect(baseline.conversation).toBeNull()
    const storedUser = (await db.collection('users').doc(ids.student).get()).data()!
    const variants = [
      { name: 'signed out', code: 'functions/unauthenticated', change: () => signOut(auth('student')) },
      { name: 'wrong role', code: 'functions/permission-denied', change: () => db.collection('users').doc(ids.student).update({ role: 'MENTOR' }) },
      { name: 'inactive', code: 'functions/permission-denied', change: () => db.collection('users').doc(ids.student).update({ status: 'SUSPENDED' }) },
      { name: 'disabled', code: 'functions/permission-denied', change: () => adminAuth.updateUser(ids.student, { disabled: true }) },
      { name: 'unverified', code: 'functions/failed-precondition', change: async () => { await adminAuth.updateUser(ids.student, { emailVerified: false }); await getIdToken(auth('student').currentUser!, true) } },
      { name: 'stored email drift', code: 'functions/permission-denied', change: () => db.collection('users').doc(ids.student).update({ email: `drift-${crypto.randomUUID()}@integration.invalid` }) },
    ]
    for (const variant of variants) {
      try {
        await variant.change()
        await denial(callable<CreateHelpRequestInput>('student', 'createHelpRequest')(input()), variant.code)
        await denial(callable<CreateHelpRequestInput>('student', 'createHelpRequest')({ ...input(), operationId: crypto.randomUUID() }), variant.code)
        if (variant.name !== 'disabled') await expect(getDoc(doc(getFirestore(apps.student), 'helpRequests', requestId))).rejects.toMatchObject({ code: 'permission-denied' })
        expect(await coordination(), variant.name).toEqual(baseline)
      } finally { await restore('student', storedUser, emails.student) }
      expect((await callable<CreateHelpRequestInput>('student', 'createHelpRequest')(input())).data).toMatchObject({ kind: 'created', helpRequest: { id: requestId } })
      expect(await coordination()).toEqual(baseline)
    }
  }, 90000)

  it('binds operation receipt to the output ID and rejects old, malformed and extra input fields (TC-007)', async () => {
    const baseline = await coordination()
    expect(requestId).not.toBe(operationId)
    expect(baseline.receipt?.helpRequestId).toBe(requestId)
    const rawCreate = callable<Record<string, unknown>>('student', 'createHelpRequest')
    const rawDecide = callable<Record<string, unknown>>('mentor', 'respondToHelpRequest')
    const { operationId: omittedOperationId, ...oldCreateFields } = input()
    const { helpRequestId: omittedHelpRequestId, ...oldDecisionFields } = decision()
    for (const malformed of [
      { ...oldCreateFields, requestId: omittedOperationId },
      { ...input(), operationId: 'not-a-uuid' },
      { ...input(), extraField: true },
    ]) await denial(rawCreate(malformed), 'functions/invalid-argument')
    for (const malformed of [
      { ...oldDecisionFields, requestId: omittedHelpRequestId },
      { ...decision(), operationId: 'not-a-uuid' },
      { ...decision(), extraField: true },
    ]) await denial(rawDecide(malformed), 'functions/invalid-argument')
    expect(await coordination()).toEqual(baseline)
  }, 30000)

  it('denies pending decisions and terminal replay after Mentor revocation, then restores eligible continuation (TC-027/039)', async () => {
    const baseline = await coordination()
    const storedUser = (await db.collection('users').doc(ids.mentor).get()).data()!
    const variants = [
      { name: 'signed out', code: 'functions/unauthenticated', change: () => signOut(auth('mentor')) },
      { name: 'wrong role', code: 'functions/permission-denied', change: () => db.collection('users').doc(ids.mentor).update({ role: 'STUDENT' }) },
      { name: 'inactive', code: 'functions/permission-denied', change: () => db.collection('users').doc(ids.mentor).update({ status: 'SUSPENDED' }) },
      { name: 'disabled', code: 'functions/permission-denied', change: () => adminAuth.updateUser(ids.mentor, { disabled: true }) },
      { name: 'unverified', code: 'functions/failed-precondition', change: async () => { await adminAuth.updateUser(ids.mentor, { emailVerified: false }); await getIdToken(auth('mentor').currentUser!, true) } },
      { name: 'stored email drift', code: 'functions/permission-denied', change: () => db.collection('users').doc(ids.mentor).update({ email: `drift-${crypto.randomUUID()}@integration.invalid` }) },
    ]
    const decide = callable<RespondToHelpRequestInput>('mentor', 'respondToHelpRequest')
    for (const variant of variants) {
      try {
        await variant.change()
        await denial(decide(decision()), variant.code)
        if (variant.name !== 'disabled') await expect(getDoc(doc(getFirestore(apps.mentor), 'helpRequests', requestId))).rejects.toMatchObject({ code: 'permission-denied' })
        expect(await coordination(), variant.name).toEqual(baseline)
      } finally { await restore('mentor', storedUser, emails.mentor) }
    }
    expect((await decide(decision())).data).toMatchObject({ kind: 'decided', conversationId: requestId })
    const accepted = await coordination()
    expect(accepted.request?.status).toBe('ACCEPTED')
    expect(accepted.key).toBeNull()
    expect(accepted.conversation).toMatchObject({ id: requestId, helpRequestId: requestId })
    for (const variant of variants) {
      try {
        await variant.change()
        await denial(decide(decision()), variant.code)
        expect(await coordination(), `terminal replay: ${variant.name}`).toEqual(accepted)
      } finally { await restore('mentor', storedUser, emails.mentor) }
    }
    expect((await decide(decision())).data).toMatchObject({ kind: 'already_decided', conversationId: requestId })
    expect(await coordination()).toEqual(accepted)
  }, 90000)
})
