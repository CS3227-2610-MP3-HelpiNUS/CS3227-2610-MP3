import { createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, signOut, updateProfile, type User as AuthUser } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { initializeStudentProfileOutputSchema, userSchema, type InitializeStudentProfileInput, type InitializeStudentProfileOutput } from '@helpinus/shared'
import { firebase } from './firebase'
import { firebaseEnvironment, isEmulatorConnectionAllowed } from './firebaseConfig'
import type { DashboardData, HelpiNUSServices, Session } from './contracts'
import { mockDashboard } from './mockServices'
import { isStaleAuthIdentityError, normalizeFirestoreTimestamp } from './firestoreData'

function configured() {
  if (!firebase) throw new Error('Firebase is not configured. Add the development Firebase settings to continue.')
  return firebase
}

function syntheticEmulatorUser(identity: AuthUser) {
  const emulatorEnabled = isEmulatorConnectionAllowed({
    isDevelopment: firebaseEnvironment === 'development',
    isDevBuild: import.meta.env.DEV,
    enabled: import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true',
    hostname: window.location.hostname,
  })
  return emulatorEnabled && identity.email?.endsWith('@example.test') === true
}

async function currentSession(): Promise<Session> {
  const client = configured()
  const identity = client.auth.currentUser
  if (!identity) return { user: null }
  try {
    await identity.reload()
  } catch (error) {
    if (isStaleAuthIdentityError(error)) {
      await signOut(client.auth)
      return { user: null }
    }
    throw error
  }
  if (client.auth.currentUser?.uid !== identity.uid) return { user: null }
  const email = identity.email ?? ''
  if (!identity.emailVerified && !syntheticEmulatorUser(identity)) return { user: null, issue: 'EMAIL_UNVERIFIED' }
  const snapshot = await getDoc(doc(client.firestore, 'users', identity.uid))
  if (!snapshot.exists()) return { user: null, issue: 'PROFILE_MISSING' }
  const data = snapshot.data()
  const parsed = userSchema.safeParse({ ...data, createdAt: normalizeFirestoreTimestamp(data.createdAt), id: snapshot.id })
  if (!parsed.success || data.id !== snapshot.id || snapshot.id !== identity.uid || parsed.data.email !== email) return { user: null, issue: 'PROFILE_INVALID' }
  if (parsed.data.status !== 'ACTIVE') return { user: null, issue: 'ACCOUNT_INACTIVE' }
  return { user: parsed.data }
}

async function initializeProfile(displayName?: string): Promise<Session> {
  const client = configured()
  const identity = client.auth.currentUser
  if (!identity) throw new Error('Sign in again to finish setting up your Student profile.')
  await identity.reload()
  await identity.getIdToken(true)
  const profileName = displayName ?? identity.displayName
  if (!profileName) throw new Error('Your account name is missing. Contact HelpiNUS support to finish setup.')
  const invoke = httpsCallable<InitializeStudentProfileInput, InitializeStudentProfileOutput>(client.functions, 'initializeStudentProfile')
  const result = await invoke({ displayName: profileName })
  initializeStudentProfileOutputSchema.parse(result.data)
  return currentSession()
}

export const firebaseServices: HelpiNUSServices = {
  session: {
    async getCurrent() { return currentSession() },
    subscribe(listener, onError) {
      const client = configured()
      return onAuthStateChanged(client.auth, () => { void currentSession().then(listener).catch(onError) }, onError)
    },
    async registerStudent({ displayName, email, password }) {
      const client = configured()
      const credential = await createUserWithEmailAndPassword(client.auth, email, password)
      await updateProfile(credential.user, { displayName })
      if (!syntheticEmulatorUser(credential.user)) await sendEmailVerification(credential.user)
      return initializeProfile(displayName)
    },
    async retryStudentProfile() { return initializeProfile() },
    async resendVerificationEmail() {
      const identity = configured().auth.currentUser
      if (!identity) throw new Error('Sign in again to resend your verification email.')
      await sendEmailVerification(identity)
    },
    async signIn({ email, password }) {
      const client = configured()
      await signInWithEmailAndPassword(client.auth, email, password)
      return currentSession()
    },
    async signOut() { await signOut(configured().auth) },
  },
  dashboard: {
    async getStudentDashboard(): Promise<DashboardData> { return mockDashboard },
  },
}
