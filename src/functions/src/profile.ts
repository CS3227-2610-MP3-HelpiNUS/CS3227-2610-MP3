import { getAuth } from 'firebase-admin/auth'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import type { InitializeMentorProfileInput, InitializeStudentProfileInput } from '@helpinus/shared'
import { userSchema } from '@helpinus/shared'
import { assertGoogleMentorIdentity } from './googleMentorProvisioning.js'

function normalizedUser(value: Record<string, unknown> | undefined) {
  const createdAt = value?.createdAt as { toDate?: () => Date } | undefined
  return userSchema.safeParse({ ...value, createdAt: createdAt && typeof createdAt.toDate === 'function' ? createdAt.toDate().toISOString() : value?.createdAt instanceof Date ? value.createdAt.toISOString() : value?.createdAt })
}

export async function initializeStudentProfileHandler(
  input: InitializeStudentProfileInput,
  request: CallableRequest<unknown>,
  db: Firestore,
  emulator: boolean,
): Promise<{ user: Record<string, unknown> }> {
  const auth = request.auth
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in to continue.')
  const email = typeof auth.token.email === 'string' ? auth.token.email : ''
  if (!email) throw new HttpsError('failed-precondition', 'An email address is required.')
  if ((auth.token.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider !== 'google.com') {
    throw new HttpsError('failed-precondition', 'Sign in with Google to register.')
  }
  const syntheticEmulatorUser = emulator && email.endsWith('@example.test')
  if (!syntheticEmulatorUser && auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Verify your email before continuing.')
  }

  const ref = db.collection('users').doc(auth.uid)
  let output!: { user: Record<string, unknown> }
  await db.runTransaction(async (transaction) => {
    // Reading both records serializes competing Student/Mentor registrations.
    const [existing, mentor] = await Promise.all([
      transaction.get(ref), transaction.get(db.collection('mentors').doc(auth.uid)),
    ])
    if (mentor.exists || existing.data()?.role === 'MENTOR') {
      throw new HttpsError('already-exists', 'This Google account already has a Mentor profile. Contact support if the account has conflicting roles.')
    }
    if (existing.exists) {
      const value = existing.data()!
      if (value.role !== 'STUDENT' || value.email !== email) {
        throw new HttpsError('permission-denied', 'An existing profile cannot be changed through registration.')
      }
      const parsed = normalizedUser(value)
      if (!parsed.success || parsed.data.id !== auth.uid || parsed.data.status !== 'ACTIVE') {
        throw new HttpsError('permission-denied', 'Your account profile is invalid. Contact HelpiNUS support.')
      }
      output = { user: parsed.data }
      return
    }
    const user = {
      id: auth.uid,
      displayName: input.displayName,
      email,
      role: 'STUDENT',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    }
    transaction.create(ref, { ...user, createdAt: FieldValue.serverTimestamp() })
    output = { user }
  })
  return output
}

export async function initializeMentorProfileHandler(
  input: InitializeMentorProfileInput,
  request: CallableRequest<unknown>,
  db: Firestore,
): Promise<{ user: Record<string, unknown> }> {
  const auth = request.auth
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in to continue.')
  const email = typeof auth.token.email === 'string' ? auth.token.email : ''
  if (!email || auth.token.email_verified !== true ||
      (auth.token.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider !== 'google.com') {
    throw new HttpsError('failed-precondition', 'Sign in with a verified Google account to register as a Mentor.')
  }
  let identity
  try { identity = await getAuth().getUser(auth.uid) }
  catch (error) {
    if ((error as { code?: string })?.code === 'auth/user-not-found') {
      throw new HttpsError('permission-denied', 'Your verified Google account could not be confirmed.')
    }
    throw new HttpsError('unavailable', 'Account verification is temporarily unavailable. Try again.')
  }
  try { assertGoogleMentorIdentity(identity, email) }
  catch { throw new HttpsError('permission-denied', 'Your verified Google account could not be confirmed.') }

  const mentorRef = db.collection('mentors').doc(auth.uid)
  const domainRef = db.collection('mentorProfiles').doc(auth.uid)
  const legacyRef = db.collection('users').doc(auth.uid)
  return db.runTransaction(async (transaction) => {
    const [mentorSnapshot, domainSnapshot, legacySnapshot] = await Promise.all([
      transaction.get(mentorRef), transaction.get(domainRef), transaction.get(legacyRef),
    ])
    if (legacySnapshot.exists && legacySnapshot.data()?.role !== 'MENTOR') {
      throw new HttpsError('already-exists', 'This Google account already has a Student profile. Contact support if the account has conflicting roles.')
    }
    if (mentorSnapshot.exists) {
      const existing = normalizedUser(mentorSnapshot.data())
      if (!existing.success || existing.data.id !== auth.uid || existing.data.email !== email || existing.data.role !== 'MENTOR' || existing.data.status !== 'ACTIVE') {
        throw new HttpsError('permission-denied', 'An existing Mentor profile cannot be changed through registration.')
      }
      if (!domainSnapshot.exists) transaction.create(domainRef, { userId: auth.uid, biography: '', moduleIds: [], active: true })
      return { user: existing.data }
    }
    const legacy = normalizedUser(legacySnapshot.data())
    // Legacy Mentors live in users/{uid}. Copy only a valid matching identity; never rewrite it.
    const matchingLegacyMentor = legacy.success && legacy.data.id === auth.uid && legacy.data.email === email && legacy.data.role === 'MENTOR'
    if (legacySnapshot.exists && (!matchingLegacyMentor || legacy.data.status !== 'ACTIVE')) {
      throw new HttpsError('permission-denied', 'Your legacy Mentor profile needs support review.')
    }
    const user = {
      id: auth.uid,
      displayName: matchingLegacyMentor ? legacy.data.displayName : input.displayName,
      email,
      role: 'MENTOR' as const,
      status: matchingLegacyMentor ? legacy.data.status : 'ACTIVE' as const,
      createdAt: matchingLegacyMentor ? legacy.data.createdAt : new Date().toISOString(),
    }
    transaction.create(mentorRef, { ...user, createdAt: matchingLegacyMentor ? legacySnapshot.data()!.createdAt : FieldValue.serverTimestamp() })
    if (!domainSnapshot.exists) transaction.create(domainRef, { userId: auth.uid, biography: '', moduleIds: [], active: true })
    return { user }
  })
}
