import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'

const actor = vi.hoisted(() => ({ uid: 'student', email: 'student@example.test', displayName: 'Student', role: 'STUDENT' as const, status: 'ACTIVE' as const }))
vi.mock('./auth.js', () => ({ requireRole: async () => actor }))
const authMocks = vi.hoisted(() => ({ getUser: vi.fn(async () => ({ email: actor.email, disabled: false, emailVerified: true })) }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ getUser: authMocks.getUser }) }))

import { getMentorRequestSelectionHandler } from './mentorRequestSelection.js'

afterEach(() => vi.clearAllMocks())

describe('F01 selected Mentor infrastructure fault', () => {
  it('returns a retryable non-sensitive error when Auth lookup fails before Firestore access', async () => {
    authMocks.getUser.mockRejectedValueOnce(new Error('private Auth uid student'))
    const getAll = vi.fn()
    const write = vi.fn()
    const db = { getAll, batch: write, runTransaction: write } as unknown as Firestore
    const error = await getMentorRequestSelectionHandler({ mentorId: 'mentor-one' }, {} as CallableRequest<unknown>, db)
      .then(() => null, (reason: unknown) => reason) as { code?: string; message?: string } | null
    expect(error?.code).toBe('unavailable')
    expect(error?.message).toContain('Try again')
    expect(error?.message).not.toContain('private Auth')
    expect(getAll).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('denies a deleted caller without disclosing its Auth record or touching Firestore', async () => {
    authMocks.getUser.mockRejectedValueOnce(Object.assign(new Error('private Auth uid student'), { code: 'auth/user-not-found' }))
    const getAll = vi.fn()
    const db = { getAll } as unknown as Firestore
    const error = await getMentorRequestSelectionHandler({ mentorId: 'mentor-one' }, {} as CallableRequest<unknown>, db)
      .then(() => null, (reason: unknown) => reason) as { code?: string; message?: string } | null
    expect(error?.code).toBe('permission-denied')
    expect(error?.message).not.toContain('private Auth')
    expect(getAll).not.toHaveBeenCalled()
  })

  it('returns a retryable non-sensitive error without attempting a write', async () => {
    const getAll = vi.fn(async () => { throw new Error('private Firestore path users/mentor-one') })
    const write = vi.fn()
    const db = { collection: () => ({ doc: () => ({}) }), getAll, batch: write, runTransaction: write } as unknown as Firestore
    const error = await getMentorRequestSelectionHandler({ mentorId: 'mentor-one' }, {} as CallableRequest<unknown>, db)
      .then(() => null, (reason: unknown) => reason) as { code?: string; message?: string } | null
    expect(error?.code).toBe('unavailable')
    expect(error?.message).toContain('Try again')
    expect(error?.message).not.toContain('users/mentor-one')
    expect(getAll).toHaveBeenCalledOnce()
    expect(write).not.toHaveBeenCalled()
  })
})
