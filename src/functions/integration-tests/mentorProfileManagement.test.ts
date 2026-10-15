import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { connectFirestoreEmulator, doc, getDoc, getFirestore as getClientFirestore } from 'firebase/firestore'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { discoverMentorsOutputSchema, readOwnMentorProfileOutputSchema, searchMentorModulesOutputSchema, updateOwnMentorProfileOutputSchema, type UpdateOwnMentorProfileInput } from '@helpinus/shared'
import { activeSearchPrefixes } from '../src/moduleSearchKeys.js'

const projectId = 'helpinus-integration-test'
const app = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'f04-integration' }, 'f04-integration')
const auth = getAuth(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
const functions = getFunctions(app, 'asia-southeast1')
connectFunctionsEmulator(functions, '127.0.0.1', 5001)
const read = httpsCallable<Record<string, never>, unknown>(functions, 'readOwnMentorProfile')
const search = httpsCallable<{ query: string; cursor?: string }, unknown>(functions, 'searchMentorModules')
const update = httpsCallable<UpdateOwnMentorProfileInput, unknown>(functions, 'updateOwnMentorProfile')
const admin = initializeAdminApp({ projectId }, 'f04-integration-admin')
const db = getFirestore(admin)
const adminAuth = getAdminAuth(admin)
let uid = ''
let email = ''

async function expectAllProfileCallablesDenied(
  callables: { read: typeof read; search: typeof search; update: typeof update },
  baseline: UpdateOwnMentorProfileInput['baseline'],
  code: string,
) {
  for (const operation of [
    () => callables.read({}),
    () => callables.search({ query: 'cs21' }),
    () => callables.update({ requestId: crypto.randomUUID(), baseline, biography: 'Unauthorized change', moduleIds: [] }),
  ]) {
    const error = await operation().then(() => null, (reason: unknown) => reason)
    expect(error).toMatchObject({ code })
    expect(String((error as Error).message)).not.toContain('Integration Mentor')
    expect(String((error as Error).message)).not.toContain('Line one')
    expect(String((error as Error).message)).not.toContain(uid)
    expect(String((error as Error).message)).not.toContain(email)
  }
}

beforeAll(async () => {
  email = `f04-${crypto.randomUUID()}@example.test`
  uid = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user.uid
  await db.collection('users').doc(uid).set({ id: uid, email, displayName: 'Integration Mentor', role: 'MENTOR', status: 'ACTIVE', createdAt: new Date() })
  await db.collection('mentorProfiles').doc(uid).set({ userId: uid, biography: '', moduleIds: [], active: true })
  for (const module of [
    { id: 'cs2103t', code: 'CS2103T', title: 'Software Engineering', active: true },
    { id: 'cs2040s', code: 'CS2040S', title: 'Data Structures and Algorithms', active: true },
    { id: 'cs3230', code: 'CS3230', title: 'Analysis of Algorithms', active: false },
  ]) await db.collection('modules').doc(module.id).set({ ...module, activeSearchPrefixes: activeSearchPrefixes(module) })
})
afterAll(async () => {
  await signOut(auth)
  if (uid) {
    await db.recursiveDelete(db.collection('mentorProfiles').doc(uid))
    await db.collection('users').doc(uid).delete()
    await adminAuth.deleteUser(uid)
  }
  await deleteApp(app)
  await deleteAdminApp(admin)
})

describe('Mentor profile callable emulator persistence', () => {
  it('denies all three callables without authentication and makes no profile or request-record change', async () => {
    const original = (await db.collection('mentorProfiles').doc(uid).get()).data()
    await signOut(auth)
    try {
      await expectAllProfileCallablesDenied({ read, search, update }, { revision: 0, updateTime: '0:000000000' }, 'functions/unauthenticated')
      expect((await db.collection('mentorProfiles').doc(uid).get()).data()).toEqual(original)
      expect((await db.collection('mentorProfiles').doc(uid).collection('saveRequests').get()).empty).toBe(true)
    } finally { await signInWithEmailAndPassword(auth, email, 'Synthetic-123!') }
  })

  it('seeds an idempotent active/inactive module catalogue with maintained prefixes', async () => {
    const script = fileURLToPath(new URL('../scripts/seed-emulator.ts', import.meta.url))
    const seedProjectId = `${projectId}-seed`
    const seedAdmin = initializeAdminApp({ projectId: seedProjectId }, 'f04-seed-admin')
    try {
      for (let pass = 0; pass < 2; pass += 1) {
        execFileSync(process.execPath, ['--import', 'tsx', script], { env: { ...process.env, GCLOUD_PROJECT: seedProjectId, FUNCTIONS_EMULATOR: 'true' }, stdio: 'pipe' })
        if (pass === 0) {
          const mentor = await getAdminAuth(seedAdmin).getUserByEmail('mentor@example.test')
          await getFirestore(seedAdmin).collection('mentorProfiles').doc(mentor.uid).update({ biography: 'Keep this edit', moduleIds: ['cs2103t'] })
        }
      }
      const snapshot = await getFirestore(seedAdmin).collection('modules').get()
      const seeded = snapshot.docs.filter((document) => ['cs2103t', 'cs2040s', 'cs3230'].includes(document.id))
      expect(seeded).toHaveLength(3)
      expect(seeded.filter((document) => document.data().active)).toHaveLength(2)
      expect(seeded.find((document) => document.id === 'cs3230')?.data().activeSearchPrefixes).toEqual([])
      expect(seeded.find((document) => document.id === 'cs2103t')?.data().activeSearchPrefixes).toContain('cs21')
      expect((await getAdminAuth(seedAdmin).getUserByEmail('student@example.test')).emailVerified).toBe(true)
      const mentor = await getAdminAuth(seedAdmin).getUserByEmail('mentor@example.test')
      expect(mentor.emailVerified).toBe(true)
      expect((await getFirestore(seedAdmin).collection('mentorProfiles').doc(mentor.uid).get()).data()).toMatchObject({
        biography: 'Keep this edit', moduleIds: ['cs2103t'],
      })
    } finally { await deleteAdminApp(seedAdmin) }
  }, 20000)
  it('reads only own public data and searches active module prefixes', async () => {
    const result = readOwnMentorProfileOutputSchema.parse((await read({})).data)
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    expect(result.profile).toMatchObject({ displayName: 'Integration Mentor', biography: '', moduleIds: [] })
    expect(result.profile).not.toHaveProperty('email')
    expect(searchMentorModulesOutputSchema.parse((await search({ query: '  CS2 ' })).data).modules.map((module) => module.id)).toEqual(['cs2040s', 'cs2103t'])
    expect(searchMentorModulesOutputSchema.parse((await search({ query: 'analysis' })).data).modules).toEqual([])
    await expect(read({ uid: 'other' } as never)).rejects.toMatchObject({ code: 'functions/invalid-argument' })
  })

  it('persists a save once, replays the same UUID, and rejects stale baselines', async () => {
    const initial = readOwnMentorProfileOutputSchema.parse((await read({})).data)
    if (initial.kind !== 'ready') throw new Error('Expected a ready profile')
    const payload: UpdateOwnMentorProfileInput = { requestId: crypto.randomUUID(), baseline: initial.profile.version, biography: 'Line one\nLine two', moduleIds: ['cs2103t'] }
    const first = updateOwnMentorProfileOutputSchema.parse((await update(payload)).data)
    expect(first).toEqual({ kind: 'accepted', stored: { biography: 'Line one\nLine two', moduleIds: ['cs2103t'], revision: 1 } })
    expect(updateOwnMentorProfileOutputSchema.parse((await update(payload)).data)).toEqual(first)
    const profile = (await db.collection('mentorProfiles').doc(uid).get()).data()
    expect(profile).toMatchObject({ userId: uid, active: true, biography: 'Line one\nLine two', moduleIds: ['cs2103t'] })
    expect(profile).not.toHaveProperty('profileRevision')
    expect((await db.collection('mentorProfiles').doc(uid).collection('private').doc('profileState').get()).data()).toEqual({ revision: 1 })
    await expect(update({ ...payload, biography: 'Changed' })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    const stale = updateOwnMentorProfileOutputSchema.parse((await update({ ...payload, requestId: crypto.randomUUID(), biography: 'Stale' })).data)
    expect(stale).toEqual({ kind: 'rejected', reason: 'CONFLICT' })
    expect((await db.collection('mentorProfiles').doc(uid).get()).data()?.biography).toBe('Line one\nLine two')
  })

  it('rejects an out-of-band edit when only profile updateTime changed', async () => {
    const initial = readOwnMentorProfileOutputSchema.parse((await read({})).data)
    if (initial.kind !== 'ready') throw new Error('Expected a ready profile')
    const profileRef = db.collection('mentorProfiles').doc(uid)
    await profileRef.update({ biography: 'Administrative edit' })
    const latest = readOwnMentorProfileOutputSchema.parse((await read({})).data)
    if (latest.kind !== 'ready') throw new Error('Expected a ready profile after edit')
    expect(latest.profile.version.revision).toBe(initial.profile.version.revision)
    expect(latest.profile.version.updateTime).not.toBe(initial.profile.version.updateTime)
    const requestId = crypto.randomUUID()
    const input: UpdateOwnMentorProfileInput = { requestId, baseline: initial.profile.version, biography: 'Stale overwrite', moduleIds: initial.profile.moduleIds }
    expect(updateOwnMentorProfileOutputSchema.parse((await update(input)).data)).toEqual({ kind: 'rejected', reason: 'CONFLICT' })
    expect((await profileRef.get()).data()?.biography).toBe('Administrative edit')
    expect((await profileRef.collection('saveRequests').doc(requestId).get()).data()?.outcome).toEqual({ kind: 'rejected', reason: 'CONFLICT' })
  })

  it('serializes concurrent identical UUID calls and compares canonical fingerprints', async () => {
    const initial = readOwnMentorProfileOutputSchema.parse((await read({})).data)
    if (initial.kind !== 'ready') throw new Error('Expected a ready profile')
    const requestId = crypto.randomUUID()
    const input: UpdateOwnMentorProfileInput = {
      requestId, baseline: initial.profile.version, biography: '  Canonical biography  ', moduleIds: ['cs2103t', 'cs2040s'],
    }
    const outcomes = await Promise.all([update(input), update(input)])
    const accepted = updateOwnMentorProfileOutputSchema.parse(outcomes[0]!.data)
    expect(accepted).toEqual({ kind: 'accepted', stored: { biography: 'Canonical biography', moduleIds: input.moduleIds, revision: initial.profile.version.revision + 1 } })
    expect(updateOwnMentorProfileOutputSchema.parse(outcomes[1]!.data)).toEqual(accepted)
    expect(updateOwnMentorProfileOutputSchema.parse((await update({ ...input, biography: 'Canonical biography', moduleIds: ['cs2040s', 'cs2103t'] })).data)).toEqual(accepted)
    for (const changed of [
      { ...input, biography: 'Different biography' },
      { ...input, baseline: { ...input.baseline, revision: input.baseline.revision + 1 } },
      { ...input, moduleIds: ['cs2103t'] },
    ]) await expect(update(changed)).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    const profile = (await db.collection('mentorProfiles').doc(uid).get()).data()
    expect(profile).toMatchObject({ biography: 'Canonical biography', moduleIds: ['cs2103t', 'cs2040s'] })
    expect((await db.collection('mentorProfiles').doc(uid).collection('private').doc('profileState').get()).data()).toEqual({ revision: initial.profile.version.revision + 1 })
    expect((await db.collection('mentorProfiles').doc(uid).collection('saveRequests').doc(requestId).get()).exists).toBe(true)
  }, 30000)

  it('rejects newly selected inactive modules and direct privileged fields', async () => {
    const current = readOwnMentorProfileOutputSchema.parse((await read({})).data)
    if (current.kind !== 'ready') throw new Error('Expected a ready profile')
    const rejected = updateOwnMentorProfileOutputSchema.parse((await update({ requestId: crypto.randomUUID(), baseline: current.profile.version, biography: current.profile.biography, moduleIds: ['cs2103t', 'cs3230'] })).data)
    expect(rejected).toMatchObject({ kind: 'rejected', reason: 'MODULE_INELIGIBLE' })
    const missing = updateOwnMentorProfileOutputSchema.parse((await update({ requestId: crypto.randomUUID(), baseline: current.profile.version, biography: current.profile.biography, moduleIds: ['cs2103t', 'module-missing'] })).data)
    expect(missing).toMatchObject({ kind: 'rejected', reason: 'MODULE_INELIGIBLE' })
    await expect(update({ requestId: crypto.randomUUID(), baseline: current.profile.version, biography: '', moduleIds: [], active: true } as never)).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    expect((await db.collection('mentorProfiles').doc(uid).get()).data()?.moduleIds).toEqual(current.profile.moduleIds)
  })

  it('paginates 21+ active prefix matches and survives deletion of the cursor document', async () => {
    const prefix = `zz${crypto.randomUUID().slice(0, 6)}`
    const batch = db.batch()
    for (let index = 0; index < 22; index += 1) {
      const id = `${prefix}-${String(index).padStart(2, '0')}`
      const module = { id, code: 'CS2103T', title: `${prefix} topic ${index}`, active: true }
      batch.set(db.collection('modules').doc(id), { ...module, activeSearchPrefixes: activeSearchPrefixes(module) })
    }
    await batch.commit()
    const first = searchMentorModulesOutputSchema.parse((await search({ query: prefix })).data)
    expect(first.modules).toHaveLength(20)
    expect(first.nextCursor).toBeTruthy()
    await db.collection('modules').doc(first.modules[19]!.id).delete()
    const second = searchMentorModulesOutputSchema.parse((await search({ query: prefix, cursor: first.nextCursor! })).data)
    expect(second.modules).toHaveLength(2)
    expect(second.modules[0]!.id).toBe(`${prefix}-20`)
    expect(second.nextCursor).toBeNull()
  })

  it('serializes distinct UUID saves from one baseline and denies replay after revocation', async () => {
    const initial = readOwnMentorProfileOutputSchema.parse((await read({})).data)
    if (initial.kind !== 'ready') throw new Error('Expected a ready profile')
    const first: UpdateOwnMentorProfileInput = { requestId: crypto.randomUUID(), baseline: initial.profile.version, biography: 'Concurrent first', moduleIds: initial.profile.moduleIds }
    const second: UpdateOwnMentorProfileInput = { ...first, requestId: crypto.randomUUID(), biography: 'Concurrent second' }
    const outcomes = await Promise.all([update(first), update(second)])
    expect(outcomes.map(({ data }) => updateOwnMentorProfileOutputSchema.parse(data).kind).sort()).toEqual(['accepted', 'rejected'])
    const rejected = outcomes.map(({ data }) => updateOwnMentorProfileOutputSchema.parse(data)).find((outcome) => outcome.kind === 'rejected')
    expect(rejected).toMatchObject({ kind: 'rejected', reason: 'CONFLICT' })
    const acceptedInput = updateOwnMentorProfileOutputSchema.parse(outcomes[0]!.data).kind === 'accepted' ? first : second
    await db.collection('users').doc(uid).update({ status: 'SUSPENDED' })
    try {
      await expect(update(acceptedInput)).rejects.toMatchObject({ code: 'functions/permission-denied' })
    } finally { await db.collection('users').doc(uid).update({ status: 'ACTIVE' }) }
    expect(updateOwnMentorProfileOutputSchema.parse((await update(acceptedInput)).data).kind).toBe('accepted')
    expect((await db.collection('mentorProfiles').doc(uid).get()).data()).not.toHaveProperty('profileRevision')
    expect((await db.collection('mentorProfiles').doc(uid).collection('private').doc('profileState').get()).data()).toEqual({ revision: initial.profile.version.revision + 1 })
  })

  it('durably replays module and conflict rejections after conditions change; a new UUID can save', async () => {
    const initial = readOwnMentorProfileOutputSchema.parse((await read({})).data)
    if (initial.kind !== 'ready') throw new Error('Expected a ready profile')
    const moduleId = `tc042-${crypto.randomUUID().slice(0, 8)}`
    const moduleRef = db.collection('modules').doc(moduleId)
    const module = { id: moduleId, code: 'TC042', title: 'Replay module', active: false }
    await moduleRef.set({ ...module, activeSearchPrefixes: activeSearchPrefixes(module) })
    try {
      const invalidInput: UpdateOwnMentorProfileInput = {
        requestId: crypto.randomUUID(), baseline: initial.profile.version,
        biography: 'Rejected module request', moduleIds: [...initial.profile.moduleIds, moduleId],
      }
      const rejected = updateOwnMentorProfileOutputSchema.parse((await update(invalidInput)).data)
      expect(rejected).toMatchObject({ kind: 'rejected', reason: 'MODULE_INELIGIBLE' })
      expect((await db.collection('mentorProfiles').doc(uid).get()).data()?.moduleIds).not.toContain(moduleId)
      expect((await db.collection('mentorProfiles').doc(uid).collection('saveRequests').doc(invalidInput.requestId).get()).data()?.outcome).toEqual(rejected)

      await moduleRef.update({ active: true, activeSearchPrefixes: activeSearchPrefixes({ ...module, active: true }) })
      expect(updateOwnMentorProfileOutputSchema.parse((await update(invalidInput)).data)).toEqual(rejected)
      expect((await db.collection('mentorProfiles').doc(uid).get()).data()?.moduleIds).not.toContain(moduleId)

      const corrected = updateOwnMentorProfileOutputSchema.parse((await update({ ...invalidInput, requestId: crypto.randomUUID() })).data)
      expect(corrected.kind).toBe('accepted')
      expect((await db.collection('mentorProfiles').doc(uid).get()).data()?.moduleIds).toContain(moduleId)

      const conflictInput: UpdateOwnMentorProfileInput = {
        ...invalidInput, requestId: crypto.randomUUID(), biography: 'Stale conflict request',
      }
      const conflict = updateOwnMentorProfileOutputSchema.parse((await update(conflictInput)).data)
      expect(conflict).toEqual({ kind: 'rejected', reason: 'CONFLICT' })
      const latest = readOwnMentorProfileOutputSchema.parse((await read({})).data)
      if (latest.kind !== 'ready') throw new Error('Expected a ready profile')
      const fresh = updateOwnMentorProfileOutputSchema.parse((await update({
        requestId: crypto.randomUUID(), baseline: latest.profile.version,
        biography: 'Newer profile after conflict', moduleIds: latest.profile.moduleIds,
      })).data)
      expect(fresh.kind).toBe('accepted')
      expect(updateOwnMentorProfileOutputSchema.parse((await update(conflictInput)).data)).toEqual(conflict)
      expect((await db.collection('mentorProfiles').doc(uid).get()).data()?.biography).toBe('Newer profile after conflict')
    } finally { await moduleRef.delete() }
  }, 30000)

  it('returns an accepted historical receipt without overwriting a newer accepted save', async () => {
    const initial = readOwnMentorProfileOutputSchema.parse((await read({})).data)
    if (initial.kind !== 'ready') throw new Error('Expected a ready profile')
    const firstInput: UpdateOwnMentorProfileInput = {
      requestId: crypto.randomUUID(), baseline: initial.profile.version,
      biography: 'Historical accepted receipt', moduleIds: initial.profile.moduleIds,
    }
    const first = updateOwnMentorProfileOutputSchema.parse((await update(firstInput)).data)
    expect(first.kind).toBe('accepted')
    const next = readOwnMentorProfileOutputSchema.parse((await read({})).data)
    if (next.kind !== 'ready') throw new Error('Expected a ready profile')
    const second = updateOwnMentorProfileOutputSchema.parse((await update({
      requestId: crypto.randomUUID(), baseline: next.profile.version,
      biography: 'Latest accepted profile', moduleIds: next.profile.moduleIds,
    })).data)
    expect(second.kind).toBe('accepted')
    expect(updateOwnMentorProfileOutputSchema.parse((await update(firstInput)).data)).toEqual(first)
    const current = readOwnMentorProfileOutputSchema.parse((await read({})).data)
    expect(current).toMatchObject({ kind: 'ready', profile: { biography: 'Latest accepted profile' } })
    if (current.kind === 'ready' && first.kind === 'accepted' && second.kind === 'accepted') {
      expect(current.profile.version.revision).toBe(second.stored.revision)
      expect(current.profile.version.revision).toBeGreaterThan(first.stored.revision)
    }
    expect((await db.collection('mentorProfiles').doc(uid).get()).data()?.biography).toBe('Latest accepted profile')
  }, 30000)

  it('keeps the saved profile public shape unchanged in Student discovery and direct get', async () => {
    const studentApp = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'f04-student-public' }, 'f04-student-public')
    const studentAuth = getAuth(studentApp)
    connectAuthEmulator(studentAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
    const studentFunctions = getFunctions(studentApp, 'asia-southeast1')
    connectFunctionsEmulator(studentFunctions, '127.0.0.1', 5001)
    const studentDb = getClientFirestore(studentApp)
    connectFirestoreEmulator(studentDb, '127.0.0.1', 18080)
    const studentEmail = `f04-${crypto.randomUUID()}@example.test`
    const student = (await createUserWithEmailAndPassword(studentAuth, studentEmail, 'Synthetic-123!')).user
    await db.collection('users').doc(student.uid).set({
      id: student.uid, email: studentEmail, displayName: 'Integration Student', role: 'STUDENT',
      status: 'ACTIVE', createdAt: new Date(),
    })
    try {
      await adminAuth.updateUser(student.uid, { emailVerified: true })
      await student.getIdToken(true)
      const studentCallables = {
        read: httpsCallable<Record<string, never>, unknown>(studentFunctions, 'readOwnMentorProfile'),
        search: httpsCallable<{ query: string; cursor?: string }, unknown>(studentFunctions, 'searchMentorModules'),
        update: httpsCallable<UpdateOwnMentorProfileInput, unknown>(studentFunctions, 'updateOwnMentorProfile'),
      }
      const mentorBeforeDenial = (await db.collection('mentorProfiles').doc(uid).get()).data()
      await expectAllProfileCallablesDenied(studentCallables, { revision: 0, updateTime: '0:000000000' }, 'functions/permission-denied')
      expect((await db.collection('mentorProfiles').doc(uid).get()).data()).toEqual(mentorBeforeDenial)
      expect((await db.collection('mentorProfiles').doc(student.uid).get()).exists).toBe(false)
      const studentDiscover = httpsCallable<{ limit: number }, unknown>(studentFunctions, 'discoverMentors')
      const discovery = discoverMentorsOutputSchema.parse((await studentDiscover({ limit: 50 })).data)
      const found = discovery.mentors.find((mentor) => mentor.userId === uid)
      expect(found).toEqual({
        userId: uid, displayName: 'Integration Mentor', biography: 'Latest accepted profile',
        moduleIds: expect.arrayContaining(['cs2103t']),
      })
      expect(Object.keys(found ?? {}).sort()).toEqual(['biography', 'displayName', 'moduleIds', 'userId'])
      const direct = await getDoc(doc(studentDb, 'mentorProfiles', uid))
      expect(direct.exists()).toBe(true)
      expect(Object.keys(direct.data() ?? {}).sort()).toEqual(['active', 'biography', 'moduleIds', 'userId'])
      expect(direct.data()).toMatchObject({ biography: 'Latest accepted profile', moduleIds: found?.moduleIds })
      expect(direct.data()).not.toHaveProperty('profileRevision')
      await expect(getDoc(doc(studentDb, 'mentorProfiles', uid, 'private', 'profileState'))).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(getDoc(doc(studentDb, 'mentorProfiles', uid, 'saveRequests', 'any'))).rejects.toMatchObject({ code: 'permission-denied' })
    } finally {
      await signOut(studentAuth)
      await db.collection('users').doc(student.uid).delete()
      await adminAuth.deleteUser(student.uid)
      await deleteApp(studentApp)
    }
  }, 30000)

  it('denies all three callables when the Mentor becomes a Student, suspended, or Auth-disabled', async () => {
    const current = readOwnMentorProfileOutputSchema.parse((await read({})).data)
    if (current.kind !== 'ready') throw new Error('Expected a ready profile')
    const original = (await db.collection('mentorProfiles').doc(uid).get()).data()
    const callables = { read, search, update }

    await db.collection('users').doc(uid).update({ role: 'STUDENT' })
    try {
      await expectAllProfileCallablesDenied(callables, current.profile.version, 'functions/permission-denied')
    } finally { await db.collection('users').doc(uid).update({ role: 'MENTOR' }) }

    await db.collection('users').doc(uid).update({ status: 'SUSPENDED' })
    try {
      await expectAllProfileCallablesDenied(callables, current.profile.version, 'functions/permission-denied')
    } finally { await db.collection('users').doc(uid).update({ status: 'ACTIVE' }) }

    await adminAuth.updateUser(uid, { disabled: true })
    try {
      await expectAllProfileCallablesDenied(callables, current.profile.version, 'functions/permission-denied')
    } finally { await adminAuth.updateUser(uid, { disabled: false }) }

    expect((await db.collection('mentorProfiles').doc(uid).get()).data()).toEqual(original)
  }, 30000)

  it('denies all three callables for a non-exempt unverified Mentor and after Auth deletion', async () => {
    const otherApp = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'f04-auth-denial' }, 'f04-auth-denial')
    const otherAuth = getAuth(otherApp)
    connectAuthEmulator(otherAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
    const otherFunctions = getFunctions(otherApp, 'asia-southeast1')
    connectFunctionsEmulator(otherFunctions, '127.0.0.1', 5001)
    const otherCallables = {
      read: httpsCallable<Record<string, never>, unknown>(otherFunctions, 'readOwnMentorProfile'),
      search: httpsCallable<{ query: string; cursor?: string }, unknown>(otherFunctions, 'searchMentorModules'),
      update: httpsCallable<UpdateOwnMentorProfileInput, unknown>(otherFunctions, 'updateOwnMentorProfile'),
    }
    const otherEmail = `f04-${crypto.randomUUID()}@unverified.test`
    const otherUser = (await createUserWithEmailAndPassword(otherAuth, otherEmail, 'Synthetic-123!')).user
    const otherUid = otherUser.uid
    const profileRef = db.collection('mentorProfiles').doc(otherUid)
    await db.collection('users').doc(otherUid).set({ id: otherUid, email: otherEmail, displayName: 'Other Mentor', role: 'MENTOR', status: 'ACTIVE', createdAt: new Date() })
    await profileRef.set({ userId: otherUid, biography: '', moduleIds: [], active: true })
    const baseline = { revision: 0, updateTime: '0:000000000' }
    try {
      await expectAllProfileCallablesDenied(otherCallables, baseline, 'functions/failed-precondition')
      expect((await profileRef.get()).data()).not.toHaveProperty('profileRevision')
      expect((await profileRef.collection('private').doc('profileState').get()).exists).toBe(false)

      await adminAuth.updateUser(otherUid, { emailVerified: true })
      await otherUser.getIdToken(true)
      const current = readOwnMentorProfileOutputSchema.parse((await otherCallables.read({})).data)
      if (current.kind !== 'ready') throw new Error('Expected a ready profile after verification')
      await adminAuth.deleteUser(otherUid)
      await expectAllProfileCallablesDenied(otherCallables, current.profile.version, 'functions/permission-denied')
      expect((await profileRef.get()).data()).not.toHaveProperty('profileRevision')
      expect((await profileRef.collection('private').doc('profileState').get()).exists).toBe(false)
    } finally {
      await signOut(otherAuth)
      await db.recursiveDelete(profileRef)
      await db.collection('users').doc(otherUid).delete()
      await adminAuth.deleteUser(otherUid).catch((error: { code?: string }) => {
        if (error.code !== 'auth/user-not-found') throw error
      })
      await deleteApp(otherApp)
    }
  }, 30000)
})
