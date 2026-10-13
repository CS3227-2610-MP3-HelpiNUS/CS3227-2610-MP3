import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import type { InitializeStudentProfileInput } from '@helpinus/shared'
import { userSchema } from '@helpinus/shared'

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
  const syntheticEmulatorUser = emulator && email.endsWith('@example.test')
  if (!syntheticEmulatorUser && auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Verify your email before continuing.')
  }

  const ref = db.collection('users').doc(auth.uid)
  let output!: { user: Record<string, unknown> }
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    if (existing.exists) {
      const value = existing.data()!
      if (value.role !== 'STUDENT' || value.email !== email) {
        throw new HttpsError('permission-denied', 'An existing profile cannot be changed through registration.')
      }
      const createdAt = value.createdAt instanceof Date
        ? value.createdAt.toISOString()
        : typeof value.createdAt?.toDate === 'function'
          ? value.createdAt.toDate().toISOString()
          : value.createdAt
      const parsed = userSchema.safeParse({ ...value, createdAt })
      if (!parsed.success || parsed.data.id !== auth.uid) {
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
