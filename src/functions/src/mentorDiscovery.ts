import type { Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { mentorProfileSchema, userSchema } from '@helpinus/shared'
import { requireActiveUser } from './auth.js'

function normalizeCreatedAt(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (typeof (value as { toDate?: unknown })?.toDate === 'function') {
    return (value as { toDate(): Date }).toDate().toISOString()
  }
  return value
}

export async function discoverMentorsHandler(
  request: CallableRequest<unknown>,
  db: Firestore,
) {
  await requireActiveUser(request)
  const profiles = await db.collection('mentorProfiles').where('active', '==', true).limit(100).get()
  if (profiles.empty) return { mentors: [] }

  const users = await db.getAll(...profiles.docs.map((profile) => db.collection('users').doc(profile.id)))
  const mentors = profiles.docs.flatMap((profile, index) => {
    const profileData = mentorProfileSchema.safeParse(profile.data())
    const userData = users[index]?.data()
    const user = userSchema.safeParse({
      ...userData,
      createdAt: normalizeCreatedAt(userData?.createdAt),
    })
    if (!profileData.success || profileData.data.userId !== profile.id) return []
    if (!user.success || user.data.id !== profile.id || user.data.role !== 'MENTOR' || user.data.status !== 'ACTIVE') return []
    return [{ profile: profileData.data, user: user.data }]
  })
  return { mentors }
}
