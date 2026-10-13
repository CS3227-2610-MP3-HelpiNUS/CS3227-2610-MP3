import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const identity = {
    uid: 'stale-emulator-user',
    displayName: null as string | null,
    email: 'student@example.test',
    emailVerified: true,
    reload: vi.fn(),
    getIdToken: vi.fn(),
  }
  return {
    auth: { currentUser: identity as typeof identity | null },
    identity,
    authStateCallback: null as null | ((identity: unknown) => void),
    createUserWithEmailAndPassword: vi.fn(),
    getDoc: vi.fn(),
    httpsCallable: vi.fn(),
    onAuthStateChanged: vi.fn(),
    sendEmailVerification: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  }
})

function userSnapshot(uid: string, email: string, displayName = 'Jamie Tan') {
  return {
    id: uid,
    exists: () => true,
    data: () => ({
      id: uid,
      displayName,
      email,
      role: 'STUDENT',
      status: 'ACTIVE',
      createdAt: '2026-01-12T09:00:00.000Z',
    }),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

vi.mock('../services/firebase', () => ({ firebase: { auth: mocks.auth, firestore: {}, functions: {} } }))
vi.mock('../services/firebaseConfig', () => ({
  firebaseEnvironment: 'development',
  isEmulatorConnectionAllowed: () => true,
}))
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  onAuthStateChanged: mocks.onAuthStateChanged,
  sendEmailVerification: mocks.sendEmailVerification,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signOut: mocks.signOut,
  updateProfile: mocks.updateProfile,
}))
vi.mock('firebase/firestore', () => ({
  doc: (_firestore: unknown, _collection: string, uid: string) => uid,
  getDoc: mocks.getDoc,
}))
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.httpsCallable }))

import { firebaseServices } from '../services/firebaseServices'

describe('Firebase session recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.identity.uid = 'stale-emulator-user'
    mocks.identity.displayName = null
    mocks.identity.email = 'student@example.test'
    mocks.identity.emailVerified = true
    mocks.identity.reload.mockResolvedValue(undefined)
    mocks.identity.getIdToken.mockResolvedValue('token')
    mocks.auth.currentUser = mocks.identity
    mocks.getDoc.mockResolvedValue(userSnapshot(mocks.identity.uid, mocks.identity.email))
    mocks.signOut.mockResolvedValue(undefined)
    mocks.sendEmailVerification.mockResolvedValue(undefined)
    mocks.onAuthStateChanged.mockImplementation((_auth, callback) => {
      mocks.authStateCallback = callback as (identity: unknown) => void
      return () => {}
    })
    mocks.httpsCallable.mockReturnValue(vi.fn().mockResolvedValue({
      data: { user: userSnapshot(mocks.identity.uid, mocks.identity.email).data() },
    }))
  })

  it('signs out and returns a clean signed-out session for a stale identity', async () => {
    mocks.identity.reload.mockRejectedValue({ code: 'auth/user-token-expired' })
    await expect(firebaseServices.session.getCurrent()).resolves.toEqual({ user: null })
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth)
  })

  it('preserves a real session-loading failure for the service error boundary', async () => {
    const failure = Object.assign(new Error('Connection failed'), { code: 'auth/network-request-failed' })
    mocks.identity.reload.mockRejectedValue(failure)
    await expect(firebaseServices.session.getCurrent()).rejects.toBe(failure)
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('retries a failed display-name update with a user-supplied recovery name', async () => {
    mocks.createUserWithEmailAndPassword.mockResolvedValue({ user: mocks.identity })
    mocks.updateProfile.mockRejectedValueOnce(new Error('profile update failed'))
    await expect(firebaseServices.session.registerStudent({
      displayName: 'Jamie Tan',
      email: mocks.identity.email,
      password: 'Student-demo-123!',
    })).rejects.toThrow('profile update failed')

    mocks.updateProfile.mockImplementation(async (identity: typeof mocks.identity, update: { displayName: string }) => {
      identity.displayName = update.displayName
    })
    await expect(firebaseServices.session.retryStudentProfile(' Jamie Tan ')).resolves.toMatchObject({
      user: { id: mocks.identity.uid, displayName: 'Jamie Tan' },
    })
    expect(mocks.updateProfile).toHaveBeenLastCalledWith(mocks.identity, { displayName: 'Jamie Tan' })
  })

  it('discards a delayed profile read after the authenticated identity changes', async () => {
    const oldIdentity = { ...mocks.identity, uid: 'old-user', email: 'old@example.test', reload: vi.fn().mockResolvedValue(undefined) }
    const newIdentity = { ...mocks.identity, uid: 'new-user', email: 'new@example.test', reload: vi.fn().mockResolvedValue(undefined) }
    const oldRead = deferred<ReturnType<typeof userSnapshot>>()
    mocks.auth.currentUser = oldIdentity
    mocks.getDoc.mockImplementation((uid: string) => uid === oldIdentity.uid
      ? oldRead.promise
      : Promise.resolve(userSnapshot(newIdentity.uid, newIdentity.email)))
    const listener = vi.fn()

    firebaseServices.session.subscribe(listener, vi.fn())
    mocks.authStateCallback?.(oldIdentity)
    await vi.waitFor(() => expect(mocks.getDoc).toHaveBeenCalledWith(oldIdentity.uid))

    mocks.auth.currentUser = newIdentity
    mocks.authStateCallback?.(newIdentity)
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ id: newIdentity.uid }),
    })))

    oldRead.resolve(userSnapshot(oldIdentity.uid, oldIdentity.email))
    await Promise.resolve()
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
