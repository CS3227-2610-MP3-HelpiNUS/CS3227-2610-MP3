import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import {
  discoverMentorsOutputSchema,
  initializeStudentProfileOutputSchema,
  type DiscoverMentorsInput,
  type DiscoverMentorsOutput,
  type InitializeStudentProfileInput,
  type InitializeStudentProfileOutput,
} from '@helpinus/shared'

const app = initializeApp({ apiKey: 'fake-api-key', projectId: 'helpinus-integration-test', appId: 'integration-test' }, 'helpinus-integration')
const auth = getAuth(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
const functions = getFunctions(app, 'asia-southeast1')
connectFunctionsEmulator(functions, '127.0.0.1', 5001)

const initializeProfile = httpsCallable<InitializeStudentProfileInput, InitializeStudentProfileOutput>(functions, 'initializeStudentProfile')
const testAuthenticated = httpsCallable<{ displayName: string }, { uid: string; ok: boolean }>(functions, 'testAuthenticated')
const discoverMentors = httpsCallable<DiscoverMentorsInput, DiscoverMentorsOutput>(functions, 'discoverMentors')
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

    const beforeLogin = await adminDb.collection('users').doc(user.uid).get()
    expect(beforeLogin.exists).toBe(true)
    await signOut(auth)
    await signInWithEmailAndPassword(auth, email, password)
    await expect(testAuthenticated({ displayName: 'Student' })).resolves.toMatchObject({ data: { uid: user.uid, ok: true } })
    const afterLogin = await adminDb.collection('users').doc(user.uid).get()
    expect(afterLogin.data()).toEqual(beforeLogin.data())
    expect(afterLogin.updateTime?.isEqual(beforeLogin.updateTime!)).toBe(true)
  }, 30000)

  it('preserves an existing Mentor profile during public Student initialization', async () => {
    const studentEmail = email
    const mentorEmail = `mentor-${crypto.randomUUID()}@example.test`
    const mentor = await adminAuth.createUser({ email: mentorEmail, password, emailVerified: true })
    const mentorRecord = {
      id: mentor.uid,
      displayName: 'Integration Mentor',
      email: mentorEmail,
      role: 'MENTOR',
      status: 'ACTIVE',
      createdAt: new Date(),
    }
    await adminDb.collection('users').doc(mentor.uid).create(mentorRecord)
    try {
      await signOut(auth)
      await signInWithEmailAndPassword(auth, mentorEmail, password)
      await expect(initializeProfile({ displayName: 'Forged Student' }))
        .rejects.toMatchObject({ code: 'functions/permission-denied' })
      const stored = await adminDb.collection('users').doc(mentor.uid).get()
      expect(stored.data()).toEqual({ ...mentorRecord, createdAt: expect.anything() })
      expect(stored.data()?.role).toBe('MENTOR')
    } finally {
      await signOut(auth)
      await signInWithEmailAndPassword(auth, studentEmail, password)
    }
  })

  it('returns paginated public Mentor fields after scanning past ineligible owners', async () => {
    const firstActiveId = `z-active-a-${crypto.randomUUID()}`
    const secondActiveId = `z-active-b-${crypto.randomUUID()}`
    const createdAt = new Date()
    const batch = adminDb.batch()
    for (let index = 0; index < 101; index += 1) {
      const suspendedId = `a-suspended-${String(index).padStart(3, '0')}`
      batch.set(adminDb.collection('users').doc(suspendedId), {
        id: suspendedId,
        displayName: `Suspended Mentor ${index}`,
        email: `suspended-${index}@example.test`,
        role: 'MENTOR',
        status: 'SUSPENDED',
        createdAt,
      })
      batch.set(adminDb.collection('mentorProfiles').doc(suspendedId), {
        userId: suspendedId,
        biography: '',
        moduleIds: [],
        active: true,
      })
    }
    for (const [id, displayName] of [
      [firstActiveId, 'First Active Mentor'],
      [secondActiveId, 'Second Active Mentor'],
    ] as const) {
      batch.set(adminDb.collection('users').doc(id), {
        id,
        displayName,
        email: `${id}@example.test`,
        role: 'MENTOR',
        status: 'ACTIVE',
        createdAt,
      })
      batch.set(adminDb.collection('mentorProfiles').doc(id), {
        userId: id,
        biography: `${displayName} biography`,
        moduleIds: ['CS3227'],
        active: true,
      })
    }
    await batch.commit()

    const first = await discoverMentors({ limit: 1 })
    const firstPage = discoverMentorsOutputSchema.parse(first.data)
    expect(firstPage.mentors).toEqual([{
      userId: firstActiveId,
      displayName: 'First Active Mentor',
      biography: 'First Active Mentor biography',
      moduleIds: ['CS3227'],
    }])
    expect(firstPage.mentors[0]).not.toHaveProperty('email')
    expect(firstPage.mentors[0]).not.toHaveProperty('role')
    expect(firstPage.nextCursor).toBe(firstActiveId)

    const second = await discoverMentors({ limit: 1, cursor: firstPage.nextCursor ?? undefined })
    const secondPage = discoverMentorsOutputSchema.parse(second.data)
    expect(secondPage.mentors.map(({ userId }) => userId)).toEqual([secondActiveId])
    expect(secondPage.nextCursor).toBeNull()
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
