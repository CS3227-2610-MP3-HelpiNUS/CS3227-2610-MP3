import { beforeEach, describe, expect, it, vi } from 'vitest'

const { auth, identity, signOut } = vi.hoisted(() => {
  const identity = { uid: 'stale-emulator-user', email: 'student@example.test', emailVerified: true, reload: vi.fn() }
  const auth = { currentUser: identity }
  return { auth, identity, signOut: vi.fn() }
})

vi.mock('../services/firebase', () => ({ firebase: { auth, firestore: {}, functions: {} } }))
vi.mock('../services/firebaseConfig', () => ({
  firebaseEnvironment: 'development',
  isEmulatorConnectionAllowed: () => true,
}))
vi.mock('firebase/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('firebase/auth')>(),
  signOut,
}))

import { firebaseServices } from '../services/firebaseServices'

describe('Firebase session recovery', () => {
  beforeEach(() => {
    identity.reload.mockReset()
    signOut.mockReset().mockResolvedValue(undefined)
    auth.currentUser = identity
  })

  it('signs out and returns a clean signed-out session for a stale identity', async () => {
    identity.reload.mockRejectedValue({ code: 'auth/user-token-expired' })
    await expect(firebaseServices.session.getCurrent()).resolves.toEqual({ user: null })
    expect(signOut).toHaveBeenCalledOnce()
    expect(signOut).toHaveBeenCalledWith(auth)
  })

  it('preserves a real session-loading failure for the service error boundary', async () => {
    const failure = Object.assign(new Error('Connection failed'), { code: 'auth/network-request-failed' })
    identity.reload.mockRejectedValue(failure)
    await expect(firebaseServices.session.getCurrent()).rejects.toBe(failure)
    expect(signOut).not.toHaveBeenCalled()
  })
})
