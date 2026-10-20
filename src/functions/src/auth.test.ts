import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'

const get = vi.fn()
const getUser = vi.fn()
const collection = vi.fn((name: string) => ({ doc: () => ({ get, path: name }) }))
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({ collection }) }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ getUser }) }))
import { assertCurrentMentorRecord, requireActiveUser, requireAuthenticated, requireCurrentMentor, requireRole } from './auth.js'

const request = { auth: { uid: 'u1', token: { email: 'u1@example.test', email_verified: true } } } as never
const validProfile = { id: 'u1', displayName: 'Student', email: 'u1@example.test', role: 'STUDENT', status: 'ACTIVE', createdAt: '2026-10-13T02:00:00.000Z' }
describe('profile authorization', () => {
  beforeEach(() => { get.mockReset(); getUser.mockReset(); collection.mockClear() })
  it('checks current Auth state and transaction user eligibility for Mentor operations', async () => {
    const mentor = { ...validProfile, role: 'MENTOR' }
    get.mockResolvedValue({ exists: true, data: () => mentor })
    getUser.mockResolvedValue({ email: mentor.email, emailVerified: true, disabled: false })
    await expect(requireCurrentMentor(request)).resolves.toMatchObject({ uid: 'u1', role: 'MENTOR' })
    expect(collection).toHaveBeenCalledWith('mentors')
    getUser.mockResolvedValue({ email: mentor.email, emailVerified: true, disabled: true })
    await expect(requireCurrentMentor(request)).rejects.toMatchObject({ code: 'permission-denied' })
    expect(() => assertCurrentMentorRecord(mentor, 'u1', mentor.email)).not.toThrow()
    expect(() => assertCurrentMentorRecord({ ...mentor, status: 'SUSPENDED' }, 'u1', mentor.email)).toThrow()
  })
  it('rejects unauthenticated callers', async () => {
    await expect(requireAuthenticated({ auth: null } as never)).rejects.toMatchObject({ code: 'unauthenticated' })
  })
  it('fails closed when profile is missing', async () => {
    get.mockResolvedValue({ exists: false })
    await expect(requireActiveUser(request)).rejects.toMatchObject({ code: 'failed-precondition' })
  })
  it('requires an ACTIVE profile matching the signed-in email', async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ ...validProfile, status: 'SUSPENDED' }) })
    await expect(requireActiveUser(request)).rejects.toMatchObject({ code: 'permission-denied' })
    get.mockResolvedValue({ exists: true, data: () => ({ ...validProfile, email: 'other@example.test' }) })
    await expect(requireActiveUser(request)).rejects.toMatchObject({ code: 'permission-denied' })
  })
  it('uses profile role and denies the wrong role', async () => {
    get.mockResolvedValue({ exists: true, data: () => validProfile })
    await expect(requireRole(request, 'MENTOR')).rejects.toBeInstanceOf(HttpsError)
    expect(collection).toHaveBeenCalledWith('mentors')
  })
  it('checks the Student collection even if the same UID also has a Mentor identity', async () => {
    get.mockResolvedValue({ exists: true, data: () => validProfile })
    await expect(requireRole(request, 'STUDENT')).resolves.toMatchObject({ uid: 'u1', role: 'STUDENT' })
    expect(collection).toHaveBeenCalledWith('users')
  })
  it('rejects profiles missing trusted fields or carrying another uid', async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ ...validProfile, displayName: '   ' }) })
    await expect(requireActiveUser(request)).rejects.toMatchObject({ code: 'permission-denied' })
    get.mockResolvedValue({ exists: true, data: () => ({ ...validProfile, id: 'other' }) })
    await expect(requireActiveUser(request)).rejects.toMatchObject({ code: 'permission-denied' })
  })
  it('requires verified email outside the emulator', async () => {
    const original = process.env.FUNCTIONS_EMULATOR
    try {
      process.env.FUNCTIONS_EMULATOR = 'false'
      get.mockResolvedValue({ exists: true, data: () => validProfile })
      await expect(requireActiveUser({ auth: { uid: 'u1', token: { email: 'u1@example.test', email_verified: false } } } as never))
        .rejects.toMatchObject({ code: 'failed-precondition' })
      process.env.FUNCTIONS_EMULATOR = 'true'
      await expect(requireActiveUser({ auth: { uid: 'u1', token: { email: 'u1@example.test', email_verified: false } } } as never))
        .resolves.toMatchObject({ uid: 'u1', role: 'STUDENT' })
      get.mockResolvedValue({ exists: true, data: () => ({ ...validProfile, email: 'u1@example.edu' }) })
      await expect(requireActiveUser({ auth: { uid: 'u1', token: { email: 'u1@example.edu', email_verified: false } } } as never))
        .rejects.toMatchObject({ code: 'failed-precondition' })
    } finally {
      if (original === undefined) delete process.env.FUNCTIONS_EMULATOR
      else process.env.FUNCTIONS_EMULATOR = original
    }
  })
  it('keeps the synthetic Mentor exception disabled when FUNCTIONS_EMULATOR is false', async () => {
    const original = process.env.FUNCTIONS_EMULATOR
    try {
      process.env.FUNCTIONS_EMULATOR = 'false'
      const synthetic = { ...validProfile, role: 'MENTOR' }
      get.mockResolvedValue({ exists: true, data: () => synthetic })
      getUser.mockResolvedValue({ email: synthetic.email, emailVerified: false, disabled: false })
      await expect(requireCurrentMentor({ auth: { uid: 'u1', token: { email: synthetic.email, email_verified: false } } } as never))
        .rejects.toMatchObject({ code: 'failed-precondition' })

      const ordinary = { ...synthetic, email: 'u1@example.edu' }
      get.mockResolvedValue({ exists: true, data: () => ordinary })
      getUser.mockResolvedValue({ email: ordinary.email, emailVerified: false, disabled: false })
      await expect(requireCurrentMentor({ auth: { uid: 'u1', token: { email: ordinary.email, email_verified: false } } } as never))
        .rejects.toMatchObject({ code: 'failed-precondition' })

      getUser.mockResolvedValue({ email: ordinary.email, emailVerified: true, disabled: false })
      await expect(requireCurrentMentor({ auth: { uid: 'u1', token: { email: ordinary.email, email_verified: true } } } as never))
        .resolves.toMatchObject({ uid: 'u1', role: 'MENTOR' })
    } finally {
      if (original === undefined) delete process.env.FUNCTIONS_EMULATOR
      else process.env.FUNCTIONS_EMULATOR = original
    }
  })
})
