import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getMentorRequestSelectionOutputSchema } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-selection-admin')
const db = getFirestore(admin)
const studentApp = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'f01-selection-student' }, 'f01-selection-student')
const mentorApp = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'f01-selection-mentor' }, 'f01-selection-mentor')
const guestApp = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'f01-selection-guest' }, 'f01-selection-guest')
const callable = (app: typeof studentApp) => httpsCallable<unknown, unknown>(getFunctions(app, 'asia-southeast1'), 'getMentorRequestSelection')
const studentCall = callable(studentApp)
const mentorCall = callable(mentorApp)
const guestCall = callable(guestApp)
const emailPrefix = `f01-selection-${crypto.randomUUID()}`
const studentEmail = `${emailPrefix}-student@integration.invalid`
const mentorEmail = `${emailPrefix}-mentor@integration.invalid`
const ids = { student: '', mentor: '' }

async function effects() {
  const [requests, receipts, keys, summaries, conversations] = await Promise.all([
    db.collection('helpRequests').get(), db.collection('helpRequestOperations').get(),
    db.collection('pendingHelpRequestKeys').get(), db.collection('helpRequestSummaries').get(), db.collection('conversations').get(),
  ])
  const rows = (snapshot: typeof requests) => snapshot.docs.map((doc) => [doc.id, doc.data()] as const).sort(([a], [b]) => a.localeCompare(b))
  return { requests: rows(requests), receipts: rows(receipts), keys: rows(keys), summaries: rows(summaries), conversations: rows(conversations) }
}

async function expectUnavailable(input: unknown, label: string) {
  const before = await effects()
  expect(getMentorRequestSelectionOutputSchema.parse((await studentCall(input)).data), label).toEqual({ kind: 'unavailable' })
  expect(await effects(), label).toEqual(before)
}

beforeAll(async () => {
  for (const app of [studentApp, mentorApp, guestApp]) {
    connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFunctionsEmulator(getFunctions(app, 'asia-southeast1'), '127.0.0.1', 5001)
  }
  const student = (await createUserWithEmailAndPassword(getAuth(studentApp), studentEmail, 'Synthetic-123!')).user
  const mentor = (await createUserWithEmailAndPassword(getAuth(mentorApp), mentorEmail, 'Synthetic-123!')).user
  ids.student = student.uid; ids.mentor = mentor.uid
  await Promise.all([getAdminAuth(admin).updateUser(student.uid, { emailVerified: true }), getAdminAuth(admin).updateUser(mentor.uid, { emailVerified: true })])
  await Promise.all([student.reload(), mentor.reload()]); await Promise.all([getIdToken(student, true), getIdToken(mentor, true)])
  await db.collection('users').doc(ids.student).set({ id: ids.student, email: studentEmail, displayName: 'Selection Student', role: 'STUDENT', status: 'ACTIVE', createdAt: Timestamp.now() })
  await db.collection('mentors').doc(ids.mentor).set({ id: ids.mentor, email: mentorEmail, displayName: 'Current Mentor', role: 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: 'Private biography', moduleIds: ['cs2103t'], active: true })
}, 30000)

afterAll(async () => {
  if (ids.student) {
    await db.collection('users').doc(ids.student).delete()
    await getAdminAuth(admin).deleteUser(ids.student)
  }
  if (ids.mentor) {
    await db.collection('mentorProfiles').doc(ids.mentor).delete()
    await db.collection('mentors').doc(ids.mentor).delete()
    await getAdminAuth(admin).deleteUser(ids.mentor)
  }
  await Promise.all([signOut(getAuth(studentApp)), signOut(getAuth(mentorApp))])
  await Promise.all([deleteApp(studentApp), deleteApp(mentorApp), deleteApp(guestApp), deleteAdminApp(admin)])
}, 30000)

describe('F01 TC-001 targeted selection callable', () => {
  it('reads the current Mentor name and denies stale-email or unverified Student with no writes', async () => {
    const before = await effects()
    const mentorRef = db.collection('mentors').doc(ids.mentor)
    const studentRef = db.collection('users').doc(ids.student)
    const originalMentor = (await mentorRef.get()).data()!
    try {
      await mentorRef.update({ displayName: 'Renamed Current Mentor' })
      expect(getMentorRequestSelectionOutputSchema.parse((await studentCall({ mentorId: ids.mentor })).data))
        .toEqual({ kind: 'ready', mentor: { userId: ids.mentor, displayName: 'Renamed Current Mentor', moduleIds: ['cs2103t'] } })
      for (const change of [
        async () => studentRef.update({ email: 'stale@example.test' }),
        async () => { await studentRef.update({ email: studentEmail }); await getAdminAuth(admin).updateUser(ids.student, { emailVerified: false }); await getIdToken(getAuth(studentApp).currentUser!, true) },
      ]) {
        await change()
        const error = await studentCall({ mentorId: ids.mentor }).then(() => null, (reason: unknown) => reason) as { code?: string; message?: string } | null
        expect(error?.code).toMatch(/functions\/(?:permission-denied|failed-precondition)/u)
        expect(error?.message).not.toContain(mentorEmail)
        expect(await effects()).toEqual(before)
      }
    } finally {
      await mentorRef.set(originalMentor)
      await studentRef.update({ email: studentEmail })
      await getAdminAuth(admin).updateUser(ids.student, { emailVerified: true })
      await getAuth(studentApp).currentUser!.reload()
      await getIdToken(getAuth(studentApp).currentUser!, true)
    }
    expect(await effects()).toEqual(before)
  }, 30000)

  it('returns only current public selection metadata and is read-only for unavailable variants', async () => {
    const before = await effects()
    const ready = getMentorRequestSelectionOutputSchema.parse((await studentCall({ mentorId: ids.mentor })).data)
    expect(ready).toEqual({ kind: 'ready', mentor: { userId: ids.mentor, displayName: 'Current Mentor', moduleIds: ['cs2103t'] } })
    expect(JSON.stringify(ready)).not.toMatch(/Private biography|studentEmail|mentorEmail|status|role/u)
    expect(await effects()).toEqual(before)
    await expectUnavailable({ mentorId: `missing-${crypto.randomUUID()}` }, 'missing account and profile')
    const accountRef = db.collection('mentors').doc(ids.mentor)
    const profileRef = db.collection('mentorProfiles').doc(ids.mentor)
    for (const [label, change] of [
      ['inactive account', { status: 'SUSPENDED' }], ['wrong role', { role: 'STUDENT' }],
      ['mismatched account ID', { id: 'other' }], ['malformed name', { displayName: '' }],
    ] as const) {
      const saved = (await accountRef.get()).data()!
      await accountRef.update(change)
      await expectUnavailable({ mentorId: ids.mentor }, label)
      await accountRef.set(saved)
    }
    const savedAccount = (await accountRef.get()).data()!
    await accountRef.delete()
    await expectUnavailable({ mentorId: ids.mentor }, 'missing account')
    await accountRef.set(savedAccount)
    for (const [label, change] of [
      ['inactive profile', { active: false }], ['mismatched profile ID', { userId: 'other' }],
      ['malformed module IDs', { moduleIds: [' bad '] }],
    ] as const) {
      const saved = (await profileRef.get()).data()!
      await profileRef.update(change)
      await expectUnavailable({ mentorId: ids.mentor }, label)
      await profileRef.set(saved)
    }
    const savedProfile = (await profileRef.get()).data()!
    await profileRef.delete()
    await expectUnavailable({ mentorId: ids.mentor }, 'missing profile')
    await profileRef.set(savedProfile)
  }, 60000)

  it('rejects malformed input and non-Student callers without effects or private output', async () => {
    const before = await effects()
    for (const input of [{ mentorId: ` ${ids.mentor} ` }, { mentorId: ids.mentor, studentId: ids.student }, { mentorId: '../other' }]) {
      const error = await studentCall(input).then(() => null, (reason: unknown) => reason) as { code?: string; message?: string } | null
      expect(error?.code).toBe('functions/invalid-argument')
      expect(error?.message).not.toContain(mentorEmail)
      expect(await effects()).toEqual(before)
    }
    for (const [invoke, expectedCode] of [[guestCall, 'functions/unauthenticated'], [mentorCall, 'functions/failed-precondition']] as const) {
      const error = await invoke({ mentorId: ids.mentor }).then(() => null, (reason: unknown) => reason) as { code?: string; message?: string } | null
      expect(error?.code).toBe(expectedCode)
      expect(error?.message).not.toContain(mentorEmail)
      expect(await effects()).toEqual(before)
    }
    const studentRef = db.collection('users').doc(ids.student)
    await studentRef.update({ status: 'SUSPENDED' })
    const inactive = await studentCall({ mentorId: ids.mentor }).then(() => null, (reason: unknown) => reason) as { code?: string } | null
    expect(inactive?.code).toBe('functions/permission-denied')
    expect(await effects()).toEqual(before)
    await studentRef.update({ status: 'ACTIVE' })
    await getAdminAuth(admin).updateUser(ids.student, { disabled: true })
    const disabled = await studentCall({ mentorId: ids.mentor }).then(() => null, (reason: unknown) => reason) as { code?: string } | null
    expect(disabled?.code).toMatch(/functions\/(?:permission-denied|unauthenticated)/u)
    expect(await effects()).toEqual(before)
  }, 60000)
})
