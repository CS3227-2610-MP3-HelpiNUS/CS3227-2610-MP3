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
    getDoc: vi.fn(),
    doc: vi.fn(),
    httpsCallable: vi.fn(),
    onAuthStateChanged: vi.fn(),
    signInWithPopup: vi.fn(),
    setCustomParameters: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  }
})

function userSnapshot(uid: string, email: string, displayName = 'Jamie Tan', role: 'STUDENT' | 'MENTOR' = 'STUDENT') {
  return {
    id: uid,
    exists: () => true,
    data: () => ({
      id: uid,
      displayName,
      email,
      role,
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
  GoogleAuthProvider: class GoogleAuthProvider { setCustomParameters = mocks.setCustomParameters },
  onAuthStateChanged: mocks.onAuthStateChanged,
  signInWithPopup: mocks.signInWithPopup,
  signOut: mocks.signOut,
  updateProfile: mocks.updateProfile,
}))
vi.mock('firebase/firestore', () => ({
  doc: mocks.doc,
  getDoc: mocks.getDoc,
}))
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.httpsCallable }))

import { firebaseServices } from '../services/firebaseServices'
import { setSelectedRole } from '../services/selectedRole'

describe('Firebase session recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setSelectedRole('STUDENT')
    mocks.doc.mockImplementation((_firestore: unknown, _collection: string, uid: string) => uid)
    mocks.identity.uid = 'stale-emulator-user'
    mocks.identity.displayName = null
    mocks.identity.email = 'student@example.test'
    mocks.identity.emailVerified = true
    mocks.identity.reload.mockResolvedValue(undefined)
    mocks.identity.getIdToken.mockResolvedValue('token')
    mocks.auth.currentUser = mocks.identity
    mocks.getDoc.mockResolvedValue(userSnapshot(mocks.identity.uid, mocks.identity.email))
    mocks.signOut.mockResolvedValue(undefined)
    mocks.signInWithPopup.mockResolvedValue({ user: mocks.identity })
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
    await expect(firebaseServices.session.getCurrent()).resolves.toEqual({ user: null, selectedRole: null })
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth)
  })

  it('preserves a real session-loading failure for the service error boundary', async () => {
    const failure = Object.assign(new Error('Connection failed'), { code: 'auth/network-request-failed' })
    mocks.identity.reload.mockRejectedValue(failure)
    await expect(firebaseServices.session.getCurrent()).rejects.toBe(failure)
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('signs in with Google and resolves the trusted profile', async () => {
    await expect(firebaseServices.session.signInWithGoogle('STUDENT')).resolves.toMatchObject({
      user: { id: mocks.identity.uid, role: 'STUDENT' },
    })
    expect(mocks.signInWithPopup).toHaveBeenCalledOnce()
    expect(mocks.setCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' })
    expect(mocks.doc).toHaveBeenCalledWith(expect.anything(), 'users', mocks.identity.uid)
  })

  it('reads only the selected Mentor collection and rejects a mismatched role', async () => {
    mocks.getDoc.mockResolvedValue(userSnapshot(mocks.identity.uid, mocks.identity.email, 'Google Mentor', 'MENTOR'))
    await expect(firebaseServices.session.signInWithGoogle('MENTOR')).resolves.toMatchObject({
      user: { id: mocks.identity.uid, role: 'MENTOR' }, selectedRole: 'MENTOR',
    })
    expect(mocks.doc).toHaveBeenCalledWith(expect.anything(), 'mentors', mocks.identity.uid)
    expect(mocks.doc).not.toHaveBeenCalledWith(expect.anything(), 'users', mocks.identity.uid)

    mocks.getDoc.mockResolvedValue(userSnapshot(mocks.identity.uid, mocks.identity.email))
    await expect(firebaseServices.session.getCurrent()).resolves.toEqual({ user: null, selectedRole: 'MENTOR', issue: 'PROFILE_INVALID' })
  })

  it('does not query a profile until the user selects a role', async () => {
    setSelectedRole(null)
    await expect(firebaseServices.session.getCurrent()).resolves.toEqual({ user: null, selectedRole: null })
    expect(mocks.getDoc).not.toHaveBeenCalled()
  })

  it('registers the Mentor profile alongside the same authenticated UID', async () => {
    mocks.identity.displayName = 'Google Mentor'
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce(userSnapshot(mocks.identity.uid, mocks.identity.email, 'Google Mentor', 'MENTOR'))
    mocks.httpsCallable.mockReturnValue(vi.fn().mockResolvedValue({
      data: { user: userSnapshot(mocks.identity.uid, mocks.identity.email, 'Google Mentor', 'MENTOR').data() },
    }))

    await expect(firebaseServices.session.registerMentorWithGoogle()).resolves.toMatchObject({
      user: { id: mocks.identity.uid, role: 'MENTOR' },
    })
    expect(mocks.signInWithPopup).not.toHaveBeenCalled()
    expect(mocks.httpsCallable).toHaveBeenCalledWith(expect.anything(), 'initializeMentorProfile')
    expect(mocks.doc.mock.calls.map((call) => call[1])).toEqual(['mentors', 'mentors'])
  })

  it('rejects a duplicate Google popup while authentication is pending', async () => {
    const popup = deferred<{ user: typeof mocks.identity }>()
    mocks.signInWithPopup.mockReturnValueOnce(popup.promise)
    const first = firebaseServices.session.signInWithGoogle('STUDENT')

    await expect(firebaseServices.session.signInWithGoogle('STUDENT')).rejects.toMatchObject({
      code: 'auth/cancelled-popup-request',
    })
    popup.resolve({ user: mocks.identity })
    await expect(first).resolves.toMatchObject({ user: { id: mocks.identity.uid } })
  })

  it('initializes a missing Google identity as a Student during registration', async () => {
    mocks.identity.displayName = 'Google Student'
    mocks.getDoc
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce(userSnapshot(mocks.identity.uid, mocks.identity.email, 'Google Student'))

    await expect(firebaseServices.session.registerStudentWithGoogle()).resolves.toMatchObject({
      user: { id: mocks.identity.uid, displayName: 'Google Student', role: 'STUDENT' },
    })
    expect(mocks.httpsCallable).toHaveBeenCalledWith(expect.anything(), 'initializeStudentProfile')
  })

  it('requests bounded name recovery when Google supplies no display name', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false })

    await expect(firebaseServices.session.registerStudentWithGoogle()).resolves.toEqual({
      user: null,
      selectedRole: 'STUDENT',
      issue: 'PROFILE_MISSING',
    })
    expect(mocks.httpsCallable).not.toHaveBeenCalled()
  })

  it('rejects a Google identity that supplies no email address', async () => {
    mocks.identity.email = null as unknown as string
    mocks.getDoc.mockResolvedValue({ exists: () => false })

    await expect(firebaseServices.session.registerStudentWithGoogle()).rejects.toMatchObject({
      code: 'auth/missing-email',
    })
    expect(mocks.httpsCallable).not.toHaveBeenCalled()
  })

  it('retries a failed display-name update with a user-supplied recovery name', async () => {
    mocks.updateProfile.mockRejectedValueOnce(new Error('profile update failed'))
    await expect(firebaseServices.session.retryStudentProfile('Jamie Tan')).rejects.toThrow('profile update failed')

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
