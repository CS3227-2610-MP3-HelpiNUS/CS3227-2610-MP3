import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { discoverMentorsOutputSchema, initializeStudentProfileOutputSchema, type InitializeStudentProfileInput, type InitializeStudentProfileOutput } from '@helpinus/shared'

const app = initializeApp({ apiKey: 'fake-api-key', projectId: 'helpinus-integration-test', appId: 'integration-test' }, 'helpinus-integration')
const auth = getAuth(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
const functions = getFunctions(app, 'asia-southeast1')
connectFunctionsEmulator(functions, '127.0.0.1', 5001)

const initializeProfile = httpsCallable<InitializeStudentProfileInput, InitializeStudentProfileOutput>(functions, 'initializeStudentProfile')
const testAuthenticated = httpsCallable<{ displayName: string }, { uid: string; ok: boolean }>(functions, 'testAuthenticated')
const discoverMentors = httpsCallable<Record<string, never>, unknown>(functions, 'discoverMentors')
const adminApp = initializeAdminApp({ projectId: 'helpinus-integration-test' }, 'helpinus-integration-admin')
const adminAuth = getAdminAuth(adminApp)
const adminDb = getFirestore(adminApp)
let email = ''
const password = 'Synthetic-123!'

beforeAll(async () => {
  email = `integration-${crypto.randomUUID()}@example.test`
  await createUserWithEmailAndPassword(auth, email, password)
})
afterAll(async () => {
  await signOut(auth)
  await deleteApp(app)
  await deleteAdminApp(adminApp)
})

describe('callable emulator integration', () => {
  it('rejects unauthenticated initialization', async () => {
    await signOut(auth)
    await expect(initializeProfile({ displayName: 'Unauthenticated' }))
      .rejects.toMatchObject({ code: 'functions/unauthenticated' })
    await signInWithEmailAndPassword(auth, email, password)
  })

  it('fails closed without a profile, then initializes idempotently as STUDENT', async () => {
    const user = auth.currentUser
    if (!user) throw new Error('Expected the synthetic emulator user to be signed in.')
    await expect(testAuthenticated({ displayName: 'Student' }))
      .rejects.toMatchObject({ code: 'functions/failed-precondition' })

    const first = await initializeProfile({ displayName: 'Integration Student', role: 'MENTOR', status: 'ACTIVE' } as never)
    expect(initializeStudentProfileOutputSchema.safeParse(first.data).success).toBe(true)
    expect(first.data.user).toMatchObject({ id: user.uid, role: 'STUDENT', status: 'ACTIVE', displayName: 'Integration Student' })
    expect(new Date(first.data.user.createdAt).toISOString()).toBe(first.data.user.createdAt)

    const retry = await initializeProfile({ displayName: 'Changed Name' })
    expect(retry.data.user.displayName).toBe('Integration Student')
    await expect(testAuthenticated({ displayName: 'Student' })).resolves.toMatchObject({ data: { uid: user.uid, ok: true } })
  })

  it('discovers only profiles backed by an authoritative ACTIVE Mentor account', async () => {
    const activeId = `mentor-${crypto.randomUUID()}`
    const suspendedId = `mentor-${crypto.randomUUID()}`
    const createdAt = new Date()
    await Promise.all([
      adminDb.collection('users').doc(activeId).set({ id: activeId, displayName: 'Active Mentor', email: 'active@example.test', role: 'MENTOR', status: 'ACTIVE', createdAt }),
      adminDb.collection('mentorProfiles').doc(activeId).set({ userId: activeId, biography: '', moduleIds: [], active: true }),
      adminDb.collection('users').doc(suspendedId).set({ id: suspendedId, displayName: 'Suspended Mentor', email: 'suspended@example.test', role: 'MENTOR', status: 'SUSPENDED', createdAt }),
      adminDb.collection('mentorProfiles').doc(suspendedId).set({ userId: suspendedId, biography: '', moduleIds: [], active: true }),
    ])

    const result = await discoverMentors({})
    const parsed = discoverMentorsOutputSchema.parse(result.data)
    expect(parsed.mentors.map(({ user }) => user.id)).toContain(activeId)
    expect(parsed.mentors.map(({ user }) => user.id)).not.toContain(suspendedId)
  })

  it('requires verification and rejects mismatched or malformed trusted profiles', async () => {
    await signOut(auth)
    const unverified = await createUserWithEmailAndPassword(auth, `integration-${crypto.randomUUID()}@unverified.test`, password)
    await expect(initializeProfile({ displayName: 'Unverified Student' }))
      .rejects.toMatchObject({ code: 'functions/failed-precondition' })

    await adminAuth.updateUser(unverified.user.uid, { emailVerified: true })
    await unverified.user.getIdToken(true)
    await expect(initializeProfile({ displayName: 'Verified Student' })).resolves.toMatchObject({
      data: { user: { id: unverified.user.uid, role: 'STUDENT', status: 'ACTIVE' } },
    })
    const profile = adminDb.collection('users').doc(unverified.user.uid)
    await profile.update({ email: 'different@example.test' })
    await expect(testAuthenticated({ displayName: 'Check mismatch' }))
      .rejects.toMatchObject({ code: 'functions/permission-denied' })
    await profile.update({ email: unverified.user.email, displayName: '   ' })
    await expect(testAuthenticated({ displayName: 'Check malformed profile' }))
      .rejects.toMatchObject({ code: 'functions/permission-denied' })
    await adminAuth.deleteUser(unverified.user.uid)
    await expect(unverified.user.reload()).rejects.toMatchObject({ code: 'auth/user-token-expired' })
    await signOut(auth)
  })
})
