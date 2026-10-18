import { createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, signOut, updateProfile, type User as AuthUser } from 'firebase/auth'
import { Timestamp, collection, doc, documentId, getDoc, limit, onSnapshot, orderBy, query, startAfter, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { appointmentSchema, availabilitySlotSchema, callableSchemas, f01HelpRequestSchema, helpRequestSummarySchema, initializeStudentProfileOutputSchema, moduleSchema, userSchema, type CallableInput, type CallableName, type CallableOutput, type InitializeStudentProfileInput, type InitializeStudentProfileOutput } from '@helpinus/shared'
import { firebase } from './firebase'
import { firebaseEnvironment, isEmulatorConnectionAllowed } from './firebaseConfig'
import type { DashboardData, HelpiNUSServices, Session } from './contracts'
import { mockDashboard } from './mockServices'
import { isStaleAuthIdentityError, normalizeFirestoreTimestamp } from './firestoreData'
import { firebaseConversations } from './firebaseConversations'

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

const staleSessionRead = Symbol('stale-session-read')

function identityIsCurrent(identity: AuthUser | null) {
  return configured().auth.currentUser === identity
}

async function sessionForIdentity(identity: AuthUser | null): Promise<Session | typeof staleSessionRead> {
  const client = configured()
  if (!identity) return identityIsCurrent(identity) ? { user: null } : staleSessionRead
  try {
    await identity.reload()
  } catch (error) {
    if (isStaleAuthIdentityError(error)) {
      if (!identityIsCurrent(identity)) return staleSessionRead
      await signOut(client.auth)
      return { user: null }
    }
    throw error
  }
  if (!identityIsCurrent(identity)) return staleSessionRead
  const email = identity.email ?? ''
  if (!identity.emailVerified && !syntheticEmulatorUser(identity)) return { user: null, issue: 'EMAIL_UNVERIFIED' }
  const snapshot = await getDoc(doc(client.firestore, 'users', identity.uid))
  if (!identityIsCurrent(identity)) return staleSessionRead
  if (!snapshot.exists()) return { user: null, issue: 'PROFILE_MISSING' }
  const data = snapshot.data()
  const parsed = userSchema.safeParse({ ...data, createdAt: normalizeFirestoreTimestamp(data.createdAt), id: snapshot.id })
  if (!parsed.success || data.id !== snapshot.id || snapshot.id !== identity.uid || parsed.data.email !== email) return { user: null, issue: 'PROFILE_INVALID' }
  if (parsed.data.status !== 'ACTIVE') return { user: null, issue: 'ACCOUNT_INACTIVE' }
  return { user: parsed.data }
}

async function currentSession(): Promise<Session> {
  const result = await sessionForIdentity(configured().auth.currentUser)
  return result === staleSessionRead ? currentSession() : result
}

async function initializeProfile(displayName?: string): Promise<Session> {
  const client = configured()
  const identity = client.auth.currentUser
  if (!identity) throw new Error('Sign in again to finish setting up your Student profile.')
  await identity.reload()
  await identity.getIdToken(true)
  const suppliedName = displayName?.trim()
  const profileName = suppliedName || identity.displayName?.trim()
  if (!profileName) throw new Error('Your account name is missing. Contact HelpiNUS support to finish setup.')
  if (suppliedName && identity.displayName !== suppliedName) {
    await updateProfile(identity, { displayName: suppliedName })
  }
  const invoke = httpsCallable<InitializeStudentProfileInput, InitializeStudentProfileOutput>(client.functions, 'initializeStudentProfile')
  const result = await invoke({ displayName: profileName })
  initializeStudentProfileOutputSchema.parse(result.data)
  return currentSession()
}

async function invokeCallable<Name extends CallableName>(
  name: Name,
  input: CallableInput<Name>,
): Promise<CallableOutput<Name>> {
  const result = await httpsCallable<CallableInput<Name>, unknown>(
    configured().functions,
    name,
  )(input)
  return callableSchemas[name].output.parse(result.data) as CallableOutput<Name>
}

export const firebaseServices: HelpiNUSServices = {
  session: {
    async getCurrent() { return currentSession() },
    subscribe(listener, onError) {
      const client = configured()
      let requestId = 0
      return onAuthStateChanged(client.auth, (identity) => {
        const currentRequest = ++requestId
        void sessionForIdentity(identity).then((session) => {
          if (currentRequest === requestId && session !== staleSessionRead) listener(session)
        }).catch(() => {
          if (currentRequest === requestId) onError()
        })
      }, onError)
    },
    async registerStudent({ displayName, email, password }) {
      const client = configured()
      const normalizedName = displayName.trim()
      const credential = await createUserWithEmailAndPassword(client.auth, email, password)
      await updateProfile(credential.user, { displayName: normalizedName })
      if (!syntheticEmulatorUser(credential.user)) await sendEmailVerification(credential.user)
      return initializeProfile(normalizedName)
    },
    async retryStudentProfile(displayName) { return initializeProfile(displayName) },
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
  modules: {
    async getById(id) {
      const snapshot = await getDoc(doc(configured().firestore, 'modules', id))
      if (!snapshot.exists()) return null
      const data = snapshot.data()
      if (data.id !== undefined && data.id !== snapshot.id) {
        throw new Error('Module document ID does not match stored ID.')
      }
      return moduleSchema.parse({ ...data, id: snapshot.id })
    },
  },
  helpRequests: {
    async getSelection(mentorId) {
      const result = await invokeCallable('getMentorRequestSelection', { mentorId })
      if (result.kind !== 'ready' || result.mentor.userId !== mentorId) return null
      return result.mentor
    },
    subscribeStudentPage(uid, cursor, onData, onError) { return subscribeRequestPage('studentId', uid, null, 'desc', cursor, onData, onError) },
    subscribeMentorPendingPage(uid, cursor, onData, onError) { return subscribeRequestPage('mentorId', uid, 'PENDING', 'asc', cursor, onData, onError) },
    subscribeMentorDecidedPage(uid, cursor, onData, onError) { return subscribeRequestPage('mentorId', uid, ['ACCEPTED', 'REJECTED'], 'desc', cursor, onData, onError) },
    subscribeDetail(id, onData, onError) {
      return onSnapshot(doc(configured().firestore, 'helpRequests', id), (snapshot) => {
        try { onData(snapshot.exists() ? parseHelpRequest(snapshot.id, snapshot.data()) : null) }
        catch (error) { onError(error) }
      }, onError)
    },
    subscribeStudentSummary(uid, onData, onError) {
      return onSnapshot(doc(configured().firestore, 'helpRequestSummaries', uid), (snapshot) => {
        if (!snapshot.exists()) { onData({ pendingCount: 0, acceptedCount: 0, rejectedCount: 0, openCount: 0, updatedAt: new Date(0).toISOString() }); return }
        try { onData(helpRequestSummarySchema.parse({ ...snapshot.data(), updatedAt: normalizeFirestoreTimestamp(snapshot.data().updatedAt) })) }
        catch (error) { onError(error) }
      }, onError)
    },
  },
  conversations: firebaseConversations,
  scheduling: {
    subscribeOpenSlots(range, onData, onError) {
      const slots = query(
        collection(configured().firestore, 'availabilitySlots'),
        where('status', '==', 'OPEN'),
        where('appointmentId', '==', null),
        where('startsAt', '>=', Timestamp.fromDate(new Date(range.startsAt))),
        where('startsAt', '<', Timestamp.fromDate(new Date(range.endsAt))),
        orderBy('startsAt', 'asc'),
        limit(100),
      )
      return onSnapshot(slots, (snapshot) => {
        try { onData(snapshot.docs.map((item) => parseAvailabilitySlot(item.id, item.data()))) }
        catch (error) { onError(error) }
      }, onError)
    },
    subscribeMentorSlots(uid, range, onData, onError) {
      const slots = query(
        collection(configured().firestore, 'availabilitySlots'),
        where('mentorId', '==', uid),
        where('startsAt', '>=', Timestamp.fromDate(new Date(range.startsAt))),
        where('startsAt', '<', Timestamp.fromDate(new Date(range.endsAt))),
        orderBy('startsAt', 'asc'),
        limit(100),
      )
      return onSnapshot(slots, (snapshot) => {
        try { onData(snapshot.docs.map((item) => parseAvailabilitySlot(item.id, item.data()))) }
        catch (error) { onError(error) }
      }, onError)
    },
    subscribeAppointments(uid, role, onData, onError) {
      const appointments = query(
        collection(configured().firestore, 'appointments'),
        where(role === 'STUDENT' ? 'studentId' : 'mentorId', '==', uid),
        orderBy('startsAt', 'desc'),
        limit(100),
      )
      return onSnapshot(appointments, (snapshot) => {
        try { onData(snapshot.docs.map((item) => parseAppointment(item.id, item.data()))) }
        catch (error) { onError(error) }
      }, onError)
    },
  },
  callables: { invoke: invokeCallable },
}

function parseHelpRequest(id: string, data: Record<string, unknown>) {
  return f01HelpRequestSchema.parse({ ...data, id, createdAt: normalizeFirestoreTimestamp(data.createdAt), updatedAt: normalizeFirestoreTimestamp(data.updatedAt) })
}

function parseAvailabilitySlot(id: string, data: Record<string, unknown>) {
  return availabilitySlotSchema.parse({ ...data, id, startsAt: normalizeFirestoreTimestamp(data.startsAt), endsAt: normalizeFirestoreTimestamp(data.endsAt), createdAt: normalizeFirestoreTimestamp(data.createdAt), updatedAt: normalizeFirestoreTimestamp(data.updatedAt) })
}

function parseAppointment(id: string, data: Record<string, unknown>) {
  return appointmentSchema.parse({ ...data, id, startsAt: normalizeFirestoreTimestamp(data.startsAt), endsAt: normalizeFirestoreTimestamp(data.endsAt), createdAt: normalizeFirestoreTimestamp(data.createdAt), updatedAt: normalizeFirestoreTimestamp(data.updatedAt) })
}

function subscribeRequestPage(ownerField: 'studentId' | 'mentorId', uid: string, status: null | 'PENDING' | ['ACCEPTED', 'REJECTED'], direction: 'asc' | 'desc', cursor: { createdAt: string; id: string } | null, onData: Parameters<HelpiNUSServices['helpRequests']['subscribeStudentPage']>[2], onError: (error: unknown) => void) {
  const clauses = [where(ownerField, '==', uid)]
  if (status === 'PENDING') clauses.push(where('status', '==', status))
  if (Array.isArray(status)) clauses.push(where('status', 'in', status))
  const order = [orderBy('createdAt', direction), orderBy(documentId(), direction)]
  const page = cursor
    ? query(collection(configured().firestore, 'helpRequests'), ...clauses, ...order, startAfter(Timestamp.fromDate(new Date(cursor.createdAt)), cursor.id), limit(20))
    : query(collection(configured().firestore, 'helpRequests'), ...clauses, ...order, limit(20))
  return onSnapshot(page, (snapshot) => { try { onData(snapshot.docs.map((item) => parseHelpRequest(item.id, item.data()))) } catch (error) { onError(error) } }, onError)
}
