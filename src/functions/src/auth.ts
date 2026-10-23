import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { userSchema, type UserRole } from '@helpinus/shared'

export interface AuthorizedUser {
  uid: string
  email: string
  displayName: string
  role: UserRole
  status: 'ACTIVE'
}

export async function requireAuthenticated(request: CallableRequest<unknown>): Promise<{ uid: string; token: Record<string, unknown> }> {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.')
  return { uid: request.auth.uid, token: request.auth.token as Record<string, unknown> }
}

export async function requireActiveUser(request: CallableRequest<unknown>, role: UserRole = 'STUDENT'): Promise<AuthorizedUser> {
  const auth = await requireAuthenticated(request)
  const db = getFirestore()
  const [student, mentor] = await Promise.all([
    db.collection('users').doc(auth.uid).get(), db.collection('mentors').doc(auth.uid).get(),
  ])
  // Legacy Mentor copies in users are still a single role. Dual-role records fail closed.
  if (student.exists && mentor.exists && student.data()?.role !== 'MENTOR') {
    throw new HttpsError('permission-denied', 'This account has conflicting roles. Contact HelpiNUS support for review.')
  }
  const snapshot = role === 'MENTOR' ? mentor : student
  if (!snapshot.exists) throw new HttpsError('failed-precondition', 'Your profile is not ready yet.')
  const profile = snapshot.data()
  if (profile?.status !== 'ACTIVE') throw new HttpsError('permission-denied', 'Your account is not active.')
  const createdAt = profile.createdAt instanceof Date
    ? profile.createdAt.toISOString()
    : typeof profile.createdAt?.toDate === 'function'
      ? profile.createdAt.toDate().toISOString()
      : profile.createdAt
  const parsed = userSchema.safeParse({ ...profile, createdAt })
  if (!parsed.success || parsed.data.id !== auth.uid || parsed.data.role !== role) {
    throw new HttpsError('permission-denied', 'Your account profile is invalid. Contact HelpiNUS support.')
  }
  const email = parsed.data.email
  const tokenEmail = typeof auth.token.email === 'string' ? auth.token.email : ''
  if (email !== tokenEmail) throw new HttpsError('permission-denied', 'Your profile does not match your signed-in account.')
  const syntheticEmulatorUser = process.env.FUNCTIONS_EMULATOR === 'true' && email.endsWith('@example.test')
  if (!syntheticEmulatorUser && auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Verify your email before continuing.')
  }
  return {
    uid: auth.uid,
    email,
    displayName: parsed.data.displayName,
    role: parsed.data.role,
    status: 'ACTIVE',
  }
}

export async function requireRole(request: CallableRequest<unknown>, role: UserRole): Promise<AuthorizedUser> {
  return requireActiveUser(request, role)
}

export async function requireAnyActiveUser(request: CallableRequest<unknown>): Promise<AuthorizedUser> {
  const auth = await requireAuthenticated(request)
  const db = getFirestore()
  const [student, mentor] = await Promise.all([
    db.collection('users').doc(auth.uid).get(),
    db.collection('mentors').doc(auth.uid).get(),
  ])
  if (student.exists && student.data()?.role === 'STUDENT') {
    if (mentor.exists) {
      throw new HttpsError('permission-denied', 'This account has conflicting roles. Contact HelpiNUS support for review.')
    }
    return requireActiveUser(request, 'STUDENT')
  }
  if (mentor.exists) return requireActiveUser(request, 'MENTOR')
  throw new HttpsError('failed-precondition', 'Your profile is not ready yet.')
}

export function assertCurrentMentorRecord(data: unknown, uid: string, email: string): void {
  const record = data as Record<string, unknown> | undefined
  const createdAt = record?.createdAt as { toDate?: () => Date } | undefined
  const parsed = userSchema.safeParse({ ...record, createdAt: createdAt && typeof createdAt.toDate === 'function' ? createdAt.toDate().toISOString() : record?.createdAt })
  if (!parsed.success || parsed.data.id !== uid || parsed.data.email !== email || parsed.data.role !== 'MENTOR' || parsed.data.status !== 'ACTIVE') {
    throw new HttpsError('permission-denied', 'Mentor account access has changed.')
  }
}

export async function requireCurrentMentor(request: CallableRequest<unknown>): Promise<AuthorizedUser> {
  const user = await requireRole(request, 'MENTOR')
  let authUser
  try { authUser = await getAuth().getUser(user.uid) }
  catch { throw new HttpsError('permission-denied', 'Mentor account access has changed.') }
  const synthetic = process.env.FUNCTIONS_EMULATOR === 'true' && user.email.endsWith('@example.test')
  if (authUser.disabled || authUser.email !== user.email || (!authUser.emailVerified && !synthetic)) {
    throw new HttpsError('permission-denied', 'Mentor account access has changed.')
  }
  return user
}

export async function requireCurrentStudent(request: CallableRequest<unknown>): Promise<AuthorizedUser> {
  const user = await requireRole(request, 'STUDENT')
  let authUser
  try { authUser = await getAuth().getUser(user.uid) }
  catch { throw new HttpsError('permission-denied', 'Student account access has changed.') }
  const synthetic = process.env.FUNCTIONS_EMULATOR === 'true' && user.email.endsWith('@example.test')
  if (authUser.disabled || authUser.email !== user.email || (!authUser.emailVerified && !synthetic)) {
    throw new HttpsError('permission-denied', 'Student account access has changed.')
  }
  return user
}
