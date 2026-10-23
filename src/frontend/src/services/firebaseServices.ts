import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, updateProfile, type User as AuthUser } from 'firebase/auth'
import { Timestamp, collection, doc, documentId, getDoc, limit, onSnapshot, orderBy, query, startAfter, where, type DocumentData, type Query, type QueryDocumentSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { appointmentSchema, availabilitySlotSchema, callableSchemas, f01HelpRequestSchema, helpRequestSummarySchema, moduleSchema, userSchema, type CallableInput, type CallableName, type CallableOutput, type UserRole } from '@helpinus/shared'
import { firebase } from './firebase'
import { firebaseEnvironment, isEmulatorConnectionAllowed } from './firebaseConfig'
import type { DashboardData, HelpiNUSServices, Session } from './contracts'
import { mockDashboard } from './mockServices'
import { isStaleAuthIdentityError, normalizeFirestoreTimestamp } from './firestoreData'
import { firebaseConversations } from './firebaseConversations'
import { getSelectedRole, setSelectedRole } from './selectedRole'

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
  const role = getSelectedRole()
  if (!identity) return identityIsCurrent(identity) ? { user: null, selectedRole: role } : staleSessionRead
  if (!role) return { user: null, selectedRole: null }
  try {
    await identity.reload()
  } catch (error) {
    if (isStaleAuthIdentityError(error)) {
      if (!identityIsCurrent(identity)) return staleSessionRead
      await signOut(client.auth)
      setSelectedRole(null)
      return { user: null, selectedRole: null }
    }
    throw error
  }
  if (!identityIsCurrent(identity) || getSelectedRole() !== role) return staleSessionRead
  const email = identity.email ?? ''
  if (!identity.emailVerified && !syntheticEmulatorUser(identity)) return { user: null, selectedRole: role, issue: 'EMAIL_UNVERIFIED' }
  const [student, mentor] = await Promise.all([
    getDoc(doc(client.firestore, 'users', identity.uid)), getDoc(doc(client.firestore, 'mentors', identity.uid)),
  ])
  if (!identityIsCurrent(identity) || getSelectedRole() !== role) return staleSessionRead
  const googleIdentity = { email, displayName: identity.displayName }
  if (student.exists() && mentor.exists() && student.data().role !== 'MENTOR') {
    return { user: null, selectedRole: role, identity: googleIdentity, issue: 'ROLE_CONFLICT' }
  }
  const snapshot = role === 'STUDENT' ? student : mentor
  if (!snapshot.exists()) {
    const other = role === 'STUDENT' ? mentor : student
    const wrongRole = other.exists() && other.data().role !== role
    return { user: null, selectedRole: role, identity: googleIdentity, issue: wrongRole ? 'WRONG_ROLE' : 'PROFILE_MISSING' }
  }
  if (role === 'STUDENT' && snapshot.data().role === 'MENTOR') {
    return { user: null, selectedRole: role, identity: googleIdentity, issue: 'WRONG_ROLE' }
  }
  const data = snapshot.data()
  const parsed = userSchema.safeParse({ ...data, createdAt: normalizeFirestoreTimestamp(data.createdAt), id: snapshot.id })
  if (!parsed.success || data.id !== snapshot.id || snapshot.id !== identity.uid || parsed.data.email !== email || parsed.data.role !== role || !parsed.data.displayName.trim()) return { user: null, selectedRole: role, issue: 'PROFILE_INVALID' }
  if (parsed.data.status !== 'ACTIVE') return { user: null, selectedRole: role, issue: 'ACCOUNT_INACTIVE' }
  return { user: parsed.data, selectedRole: role, identity: googleIdentity }
}

async function currentSession(): Promise<Session> {
  const result = await sessionForIdentity(configured().auth.currentUser)
  return result === staleSessionRead ? currentSession() : result
}

async function initializeProfile(role: UserRole, displayName?: string): Promise<Session> {
  const client = configured()
  const identity = client.auth.currentUser
  if (!identity) throw new Error(`Sign in again to finish setting up your ${role === 'STUDENT' ? 'Student' : 'Mentor'} profile.`)
  if (registrationIdentity?.uid !== identity.uid || registrationIdentity.role !== role) {
    throw Object.assign(new Error('Continue with Google to confirm registration.'), { code: 'auth/registration-required' })
  }
  await identity.reload()
  if (!identity.email) {
    throw Object.assign(new Error('The Google identity did not provide an email address.'), { code: 'auth/missing-email' })
  }
  await identity.getIdToken(true)
  const suppliedName = displayName?.trim()
  const profileName = suppliedName || identity.displayName?.trim()
  if (!profileName) return { user: null, selectedRole: role, identity: { email: identity.email, displayName: identity.displayName }, issue: 'PROFILE_MISSING' }
  if (suppliedName && identity.displayName !== suppliedName) {
    await updateProfile(identity, { displayName: suppliedName })
  }
  if (!identityIsCurrent(identity) || getSelectedRole() !== role) return currentSession()
  await invokeCallable(role === 'STUDENT' ? 'initializeStudentProfile' : 'initializeMentorProfile', { displayName: profileName })
  return currentSession()
}

let googleAuthenticationPending = false
let registrationIdentity: { uid: string; role: UserRole } | null = null

async function authenticateWithGoogle(role: UserRole, createProfile: boolean): Promise<Session> {
  if (googleAuthenticationPending) {
    throw Object.assign(new Error('A Google sign-in request is already in progress.'), { code: 'auth/cancelled-popup-request' })
  }
  googleAuthenticationPending = true
  const previousRole = getSelectedRole()
  registrationIdentity = null
  try {
    const client = configured()
    setSelectedRole(role)
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    const authenticated = await signInWithPopup(client.auth, provider)
    const session = await currentSession()
    if (createProfile && session.issue === 'PROFILE_MISSING' && client.auth.currentUser?.uid === authenticated.user.uid && getSelectedRole() === role) {
      registrationIdentity = { uid: authenticated.user.uid, role }
      return await initializeProfile(role)
    }
    return session
  } catch (error) {
    if ((error as { code?: string })?.code?.startsWith('auth/popup-') || (error as { code?: string })?.code === 'auth/cancelled-popup-request') setSelectedRole(previousRole)
    throw error
  } finally {
    googleAuthenticationPending = false
  }
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

const schedulingPageSize = 100

function subscribeAllSchedulingPages<T>(
  createPage: (cursor: QueryDocumentSnapshot<DocumentData> | null) => Query<DocumentData>,
  parse: (id: string, data: DocumentData) => T,
  onData: (items: T[]) => void,
  onError: (error: unknown) => void,
) {
  const pages: T[][] = []
  const pageCursors: Array<string | null> = []
  const unsubscribers: Array<(() => void) | undefined> = []
  let stopped = false

  const emit = () => {
    const unique = new Map<string, T>()
    for (const page of pages) for (const item of page) unique.set((item as { id: string }).id, item)
    onData([...unique.values()])
  }
  const truncate = (from: number) => {
    for (let index = from; index < unsubscribers.length; index += 1) unsubscribers[index]?.()
    unsubscribers.length = from
    pages.length = from
    pageCursors.length = from
  }
  const listen = (index: number, cursor: QueryDocumentSnapshot<DocumentData> | null) => {
    unsubscribers[index] = onSnapshot(createPage(cursor), (snapshot) => {
      if (stopped) return
      try {
        pages[index] = snapshot.docs.map((item) => parse(item.id, item.data()))
        const last = snapshot.docs.at(-1) ?? null
        const nextCursor = snapshot.docs.length === schedulingPageSize ? last : null
        const nextCursorId = nextCursor?.id ?? null
        if (pageCursors[index + 1] !== nextCursorId) {
          truncate(index + 1)
          if (nextCursor) {
            pageCursors[index + 1] = nextCursorId
            listen(index + 1, nextCursor)
          }
        }
        emit()
      } catch (error) { onError(error) }
    }, onError)
  }

  pageCursors[0] = null
  listen(0, null)
  return () => {
    stopped = true
    truncate(0)
  }
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
    async signInWithGoogle(role) { return authenticateWithGoogle(role, false) },
    async registerStudentWithGoogle() { return authenticateWithGoogle('STUDENT', true) },
    async registerMentorWithGoogle() { return authenticateWithGoogle('MENTOR', true) },
    async retryStudentProfile(displayName) { setSelectedRole('STUDENT'); return initializeProfile('STUDENT', displayName) },
    async retryMentorProfile(displayName) { setSelectedRole('MENTOR'); return initializeProfile('MENTOR', displayName) },
    async signOut() { await signOut(configured().auth); registrationIdentity = null; setSelectedRole(null) },
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
      const lowerBound = Math.max(Date.parse(range.startsAt), Date.now())
      return subscribeAllSchedulingPages((cursor) => query(
        collection(configured().firestore, 'availabilitySlots'),
        where('status', '==', 'OPEN'),
        where('appointmentId', '==', null),
        where('startsAt', '>=', Timestamp.fromMillis(lowerBound)),
        where('startsAt', '<', Timestamp.fromDate(new Date(range.endsAt))),
        orderBy('startsAt', 'asc'),
        orderBy(documentId(), 'asc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(schedulingPageSize),
      ), parseAvailabilitySlot, onData, onError)
    },
    subscribeMentorSlots(uid, range, onData, onError) {
      return subscribeAllSchedulingPages((cursor) => query(
        collection(configured().firestore, 'availabilitySlots'),
        where('mentorId', '==', uid),
        where('startsAt', '>=', Timestamp.fromDate(new Date(range.startsAt))),
        where('startsAt', '<', Timestamp.fromDate(new Date(range.endsAt))),
        orderBy('startsAt', 'asc'),
        orderBy(documentId(), 'asc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(schedulingPageSize),
      ), parseAvailabilitySlot, onData, onError)
    },
    subscribeUpcomingAppointments(uid, role, onData, onError) {
      const lowerBound = Timestamp.now()
      return subscribeAllSchedulingPages((cursor) => query(
        collection(configured().firestore, 'appointments'),
        where(role === 'STUDENT' ? 'studentId' : 'mentorId', '==', uid),
        where('startsAt', '>=', lowerBound),
        orderBy('startsAt', 'asc'),
        orderBy(documentId(), 'asc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(schedulingPageSize),
      ), parseAppointment, onData, onError)
    },
    subscribeAppointmentHistory(uid, role, pageSize, onData, onError) {
      const upperBound = Timestamp.now()
      return subscribeAllSchedulingPages((cursor) => query(
        collection(configured().firestore, 'appointments'),
        where(role === 'STUDENT' ? 'studentId' : 'mentorId', '==', uid),
        where('startsAt', '<', upperBound),
        orderBy('startsAt', 'desc'),
        orderBy(documentId(), 'desc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(schedulingPageSize),
      ), parseAppointment, (items) => onData({ appointments: items.slice(0, pageSize), hasMore: items.length > pageSize }), onError)
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
