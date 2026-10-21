import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { initializeMentorProfileInputSchema, initializeStudentProfileInputSchema } from '@helpinus/shared'

const getUser = vi.fn()
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ getUser }) }))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}))
import { initializeMentorProfileHandler, initializeStudentProfileHandler } from './profile.js'

const request = (auth: CallableRequest<unknown>['auth'] | null) => ({ auth }) as unknown as CallableRequest<unknown>
const input = initializeStudentProfileInputSchema.parse({ displayName: 'Student', role: 'MENTOR', status: 'ACTIVE' })

function fakeDb(existing?: Record<string, unknown>) {
  const create = vi.fn()
  const get = vi.fn().mockResolvedValue({ exists: Boolean(existing), data: () => existing })
  const db = {
    collection: () => ({ doc: () => ({ id: 'u1' }) }),
    runTransaction: async (work: (transaction: { get: typeof get; create: typeof create }) => unknown) => work({ get, create }),
  }
  return { db: db as never, create, get }
}

describe('initializeStudentProfile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects unauthenticated requests', async () => {
    const { db } = fakeDb()
    await expect(initializeStudentProfileHandler(input, request(null), db, true))
      .rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('creates only a STUDENT ACTIVE profile from authenticated identity data', async () => {
    const { db, create } = fakeDb()
    const auth = { uid: 'u1', token: { email: 'u1@example.test', email_verified: false } } as never
    const result = await initializeStudentProfileHandler(input, request(auth), db, true)
    expect(result.user).toMatchObject({ id: 'u1', displayName: 'Student', email: 'u1@example.test', role: 'STUDENT', status: 'ACTIVE' })
    expect(create).toHaveBeenCalledWith({ id: 'u1' }, expect.objectContaining({ role: 'STUDENT', status: 'ACTIVE' }))
  })

  it('requires verified email outside the emulator', async () => {
    const { db } = fakeDb()
    const auth = { uid: 'u1', token: { email: 'u1@example.test', email_verified: false } } as never
    await expect(initializeStudentProfileHandler(input, request(auth), db, false))
      .rejects.toMatchObject({ code: 'failed-precondition' })
  })

  it('returns an existing matching student profile without changing it', async () => {
    const existing = { id: 'u1', displayName: 'Original', email: 'u1@example.test', role: 'STUDENT', status: 'ACTIVE', createdAt: new Date('2026-10-13T02:00:00.000Z') }
    const { db, create } = fakeDb(existing)
    const auth = { uid: 'u1', token: { email: 'u1@example.test', email_verified: true } } as never
    const result = await initializeStudentProfileHandler(input, request(auth), db, false)
    expect(result.user).toMatchObject({ displayName: 'Original', role: 'STUDENT' })
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses to convert an existing mentor profile', async () => {
    const { db, create } = fakeDb({ email: 'u1@example.test', role: 'MENTOR', status: 'ACTIVE' })
    const auth = { uid: 'u1', token: { email: 'u1@example.test', email_verified: true } } as never
    await expect(initializeStudentProfileHandler(input, request(auth), db, false))
      .rejects.toBeInstanceOf(HttpsError)
    expect(create).not.toHaveBeenCalled()
  })
})

function mentorDb(records: Record<string, Record<string, unknown>> = {}) {
  const create = vi.fn()
  const refs = new Map<string, { path: string }>()
  const db = {
    collection: (name: string) => ({ doc: (id: string) => {
      const path = `${name}/${id}`
      const ref = { path }
      refs.set(path, ref)
      return ref
    } }),
    runTransaction: async (work: (transaction: { get: (ref: { path: string }) => Promise<unknown>; create: typeof create }) => unknown) => work({
      get: async (ref) => ({ exists: Boolean(records[ref.path]), data: () => records[ref.path] }), create,
    }),
  }
  return { db: db as never, create }
}

const googleAuth = { uid: 'u1', token: { email: 'u1@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } } } as never
const existingMentor = { id: 'u1', displayName: 'Original Mentor', email: 'u1@example.test', role: 'MENTOR', status: 'ACTIVE', createdAt: '2026-10-13T02:00:00.000Z' }
const mentorInput = initializeMentorProfileInputSchema.parse({ displayName: 'New Mentor' })

describe('initializeMentorProfile', () => {
  beforeEach(() => {
    getUser.mockReset()
    getUser.mockResolvedValue({ uid: 'u1', email: 'u1@example.test', emailVerified: true, disabled: false,
      providerData: [{ providerId: 'google.com', email: 'u1@example.test' }] })
  })

  it('creates Mentor identity and domain profile without changing an existing Student', async () => {
    const student = { ...existingMentor, role: 'STUDENT' }
    const { db, create } = mentorDb({ 'users/u1': student })
    const result = await initializeMentorProfileHandler(mentorInput, request(googleAuth), db)
    expect(result.user).toMatchObject({ id: 'u1', displayName: 'New Mentor', role: 'MENTOR', status: 'ACTIVE' })
    expect(create).toHaveBeenCalledWith({ path: 'mentors/u1' }, expect.objectContaining({ role: 'MENTOR' }))
    expect(create).toHaveBeenCalledWith({ path: 'mentorProfiles/u1' }, { userId: 'u1', biography: '', moduleIds: [], active: true })
    expect(create).not.toHaveBeenCalledWith({ path: 'users/u1' }, expect.anything())
  })

  it('returns an existing Mentor unchanged and leaves its domain profile intact', async () => {
    const { db, create } = mentorDb({ 'mentors/u1': existingMentor, 'mentorProfiles/u1': { userId: 'u1', biography: 'Keep me', moduleIds: [], active: false } })
    const result = await initializeMentorProfileHandler(mentorInput, request(googleAuth), db)
    expect(result.user).toMatchObject(existingMentor)
    expect(create).not.toHaveBeenCalled()
  })

  it('copies a matching legacy Mentor identity without rewriting users/{uid}', async () => {
    const { db, create } = mentorDb({ 'users/u1': existingMentor })
    const result = await initializeMentorProfileHandler(mentorInput, request(googleAuth), db)
    expect(result.user).toMatchObject(existingMentor)
    expect(create).toHaveBeenCalledWith({ path: 'mentors/u1' }, expect.objectContaining({ displayName: 'Original Mentor' }))
    expect(create).not.toHaveBeenCalledWith({ path: 'users/u1' }, expect.anything())
  })

  it('requires the current verified Google sign-in and a matching Admin identity', async () => {
    const { db, create } = mentorDb()
    await expect(initializeMentorProfileHandler(mentorInput, request({ uid: 'u1', token: { email: 'u1@example.test', email_verified: true } } as never), db))
      .rejects.toMatchObject({ code: 'failed-precondition' })
    getUser.mockResolvedValueOnce({ uid: 'u1', email: 'u1@example.test', emailVerified: true, disabled: false, providerData: [] })
    await expect(initializeMentorProfileHandler(mentorInput, request(googleAuth), db)).rejects.toMatchObject({ code: 'permission-denied' })
    expect(create).not.toHaveBeenCalled()
  })
})
