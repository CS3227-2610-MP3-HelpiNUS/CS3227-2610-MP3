import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'

const get = vi.fn()
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({ collection: () => ({ doc: () => ({ get }) }) }) }))
import { requireActiveUser, requireAuthenticated, requireRole } from './auth.js'

const request = { auth: { uid: 'u1', token: { email: 'u1@example.test', email_verified: true } } } as never
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
    get.mockResolvedValue({ exists: true, data: () => ({ role: 'STUDENT', status: 'SUSPENDED', email: 'u1@example.test' }) })
    await expect(requireActiveUser(request)).rejects.toMatchObject({ code: 'permission-denied' })
    get.mockResolvedValue({ exists: true, data: () => ({ role: 'STUDENT', status: 'ACTIVE', email: 'other@example.test' }) })
    await expect(requireActiveUser(request)).rejects.toMatchObject({ code: 'permission-denied' })
  })
  it('uses profile role and denies the wrong role', async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ role: 'STUDENT', status: 'ACTIVE', email: 'u1@example.test', displayName: 'Student' }) })
    await expect(requireRole(request, 'MENTOR')).rejects.toBeInstanceOf(HttpsError)
  })
})
