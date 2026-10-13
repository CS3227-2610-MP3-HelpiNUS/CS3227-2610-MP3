import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'

const app = initializeApp({ apiKey: 'fake-api-key', projectId: 'helpinus-integration-test', appId: 'integration-test' }, 'helpinus-integration')
const auth = getAuth(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
const functions = getFunctions(app, 'asia-southeast1')
connectFunctionsEmulator(functions, '127.0.0.1', 5001)

const initializeProfile = httpsCallable<{ displayName: string }, { user: { id: string; role: string; status: string; displayName: string } }>(functions, 'initializeStudentProfile')
const testAuthenticated = httpsCallable<{ displayName: string }, { uid: string; ok: boolean }>(functions, 'testAuthenticated')
let email = ''
const password = 'Synthetic-123!'

beforeAll(async () => {
  email = `integration-${crypto.randomUUID()}@example.test`
  await createUserWithEmailAndPassword(auth, email, password)
})
afterAll(async () => {
  await signOut(auth)
  await deleteApp(app)
})

describe('callable emulator integration', () => {
  it('rejects unauthenticated initialization', async () => {
    await signOut(auth)
    await expect(initializeProfile({ displayName: 'Unauthenticated' }))
      .rejects.toMatchObject({ code: 'functions/unauthenticated' })
    await signInWithEmailAndPassword(auth, email, password)
  })

  it('fails closed without a profile, then initializes idempotently as STUDENT', async () => {
    const user = auth.currentUser
    if (!user) throw new Error('Expected the synthetic emulator user to be signed in.')
    await expect(testAuthenticated({ displayName: 'Student' }))
      .rejects.toMatchObject({ code: 'functions/failed-precondition' })

    const first = await initializeProfile({ displayName: 'Integration Student', role: 'MENTOR', status: 'ACTIVE' } as never)
    expect(first.data.user).toMatchObject({ id: user.uid, role: 'STUDENT', status: 'ACTIVE', displayName: 'Integration Student' })

    const retry = await initializeProfile({ displayName: 'Changed Name' })
    expect(retry.data.user.displayName).toBe('Integration Student')
    await expect(testAuthenticated({ displayName: 'Student' })).resolves.toMatchObject({ data: { uid: user.uid, ok: true } })
  })
})
