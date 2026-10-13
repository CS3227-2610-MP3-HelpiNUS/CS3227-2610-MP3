import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'

const get = vi.fn()
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({ collection: () => ({ doc: () => ({ get }) }) }) }))
import { requireActiveUser, requireAuthenticated, requireRole } from './auth.js'

const request = { auth: { uid: 'u1', token: { email: 'u1@example.test', email_verified: true } } } as never
const validProfile = { id: 'u1', displayName: 'Student', email: 'u1@example.test', role: 'STUDENT', status: 'ACTIVE', createdAt: '2026-10-13T02:00:00.000Z' }
describe('profile authorization', () => {
  beforeEach(() => { get.mockReset() })
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
  })
  it('rejects profiles missing trusted fields or carrying another uid', async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ ...validProfile, displayName: '   ' }) })
    await expect(requireActiveUser(request)).rejects.toMatchObject({ code: 'permission-denied' })
    get.mockResolvedValue({ exists: true, data: () => ({ ...validProfile, id: 'other' }) })
    await expect(requireActiveUser(request)).rejects.toMatchObject({ code: 'permission-denied' })
  })
  it('requires verified email outside the emulator', async () => {
    get.mockResolvedValue({ exists: true, data: () => validProfile })
    await expect(requireActiveUser({ auth: { uid: 'u1', token: { email: 'u1@example.test', email_verified: false } } } as never))
      .rejects.toMatchObject({ code: 'failed-precondition' })
  })
})
