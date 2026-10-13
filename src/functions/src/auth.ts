import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import type { UserRole } from '@helpinus/shared'

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

export async function requireActiveUser(request: CallableRequest<unknown>): Promise<AuthorizedUser> {
  const auth = await requireAuthenticated(request)
  const snapshot = await getFirestore().collection('users').doc(auth.uid).get()
  if (!snapshot.exists) throw new HttpsError('failed-precondition', 'Your profile is not ready yet.')
  const profile = snapshot.data()
  if (profile?.status !== 'ACTIVE') throw new HttpsError('permission-denied', 'Your account is not active.')
  if (profile.role !== 'STUDENT' && profile.role !== 'MENTOR') {
    throw new HttpsError('permission-denied', 'Your account role is invalid.')
  }
  const email = typeof profile.email === 'string' ? profile.email : ''
  const tokenEmail = typeof auth.token.email === 'string' ? auth.token.email : ''
  if (email !== tokenEmail) throw new HttpsError('permission-denied', 'Your profile does not match your signed-in account.')
  const syntheticEmulatorUser = process.env.FUNCTIONS_EMULATOR === 'true' && email.endsWith('@example.test')
  if (!syntheticEmulatorUser && auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Verify your email before continuing.')
  }
  return {
    uid: auth.uid,
    email,
    displayName: typeof profile.displayName === 'string' ? profile.displayName : '',
    role: profile.role,
    status: 'ACTIVE',
  }
}

export async function requireRole(request: CallableRequest<unknown>, role: UserRole): Promise<AuthorizedUser> {
  const user = await requireActiveUser(request)
  if (user.role !== role) throw new HttpsError('permission-denied', `This operation requires ${role}.`)
  return user
}
