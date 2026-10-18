import { getAuth } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { canonicalDocumentIdSchema, mentorProfileSchema, userSchema, type GetMentorRequestSelectionInput, type GetMentorRequestSelectionOutput } from '@helpinus/shared'
import { requireRole } from './auth.js'

function createdAt(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (typeof (value as { toDate?: unknown })?.toDate === 'function') return (value as { toDate(): Date }).toDate().toISOString()
  return value
}

export async function getMentorRequestSelectionHandler(
  input: GetMentorRequestSelectionInput,
  request: CallableRequest<unknown>,
  db: Firestore,
): Promise<GetMentorRequestSelectionOutput> {
  const student = await requireRole(request, 'STUDENT')
  let authUser
  try { authUser = await getAuth().getUser(student.uid) }
  catch (error) {
    if ((error as { code?: unknown })?.code === 'auth/user-not-found') {
      throw new HttpsError('permission-denied', 'Student account access has changed.')
    }
    throw new HttpsError('unavailable', 'Student account could not be checked. Try again.')
  }
  const synthetic = process.env.FUNCTIONS_EMULATOR === 'true' && student.email.endsWith('@example.test')
  if (authUser.disabled || authUser.email !== student.email || (!authUser.emailVerified && !synthetic)) {
    throw new HttpsError('permission-denied', 'Student account access has changed.')
  }
  let account, profile
  try {
    [account, profile] = await db.getAll(
      db.collection('users').doc(input.mentorId),
      db.collection('mentorProfiles').doc(input.mentorId),
    )
  } catch {
    throw new HttpsError('unavailable', 'Mentor selection could not be checked. Try again.')
  }
  const rawAccount = account?.data()
  const rawProfile = profile?.data()
  const mentor = userSchema.safeParse({ ...rawAccount, createdAt: createdAt(rawAccount?.createdAt) })
  const modules = mentorProfileSchema.safeParse(rawProfile)
  if (!mentor.success || mentor.data.id !== input.mentorId || mentor.data.role !== 'MENTOR' || mentor.data.status !== 'ACTIVE'
    || !modules.success || modules.data.userId !== input.mentorId || !modules.data.active
    || !Array.isArray(rawProfile?.moduleIds)
    || rawProfile.moduleIds.some((id: unknown) => !canonicalDocumentIdSchema.safeParse(id).success)) return { kind: 'unavailable' }
  return { kind: 'ready', mentor: { userId: input.mentorId, displayName: mentor.data.displayName, moduleIds: modules.data.moduleIds } }
}
