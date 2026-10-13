import { FieldPath, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
  mentorProfileSchema,
  userSchema,
  type DiscoverMentorsOutput,
  type DiscoverMentorsParsedInput,
} from '@helpinus/shared'
import { requireActiveUser } from './auth.js'

const scanBatchSize = 100
const maxScanBatches = 5

function normalizeCreatedAt(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (typeof (value as { toDate?: unknown })?.toDate === 'function') {
    return (value as { toDate(): Date }).toDate().toISOString()
  }
  return value
}

export async function discoverMentorsHandler(
  input: DiscoverMentorsParsedInput,
  request: CallableRequest<unknown>,
  db: Firestore,
): Promise<DiscoverMentorsOutput> {
  await requireActiveUser(request)
  const eligible: Array<{
    cursor: string
    mentor: DiscoverMentorsOutput['mentors'][number]
  }> = []
  let scanCursor = input.cursor
  let scannedBatches = 0
  let exhausted = false

  while (eligible.length <= input.limit && scannedBatches < maxScanBatches) {
    let query = db
      .collection('mentorProfiles')
      .where('active', '==', true)
      .orderBy(FieldPath.documentId())

    if (scanCursor) query = query.startAfter(scanCursor)
    const profiles = await query.limit(scanBatchSize).get()
    scannedBatches += 1
    if (profiles.empty) {
      exhausted = true
      break
    }

    const users = await db.getAll(
      ...profiles.docs.map((profile) => db.collection('users').doc(profile.id)),
    )

    for (const [index, profile] of profiles.docs.entries()) {
      scanCursor = profile.id
      const profileData = mentorProfileSchema.safeParse(profile.data())
      const userData = users[index]?.data()
      const user = userSchema.safeParse({
        ...userData,
        createdAt: normalizeCreatedAt(userData?.createdAt),
      })
      if (!profileData.success || profileData.data.userId !== profile.id) continue
      if (
        !user.success
        || user.data.id !== profile.id
        || user.data.role !== 'MENTOR'
        || user.data.status !== 'ACTIVE'
      ) continue

      eligible.push({
        cursor: profile.id,
        mentor: {
          userId: user.data.id,
          displayName: user.data.displayName,
          biography: profileData.data.biography,
          moduleIds: profileData.data.moduleIds,
        },
      })
      if (eligible.length > input.limit) break
    }

    if (eligible.length > input.limit) break
    if (profiles.size < scanBatchSize) {
      exhausted = true
      break
    }
  }

  return {
    mentors: eligible.slice(0, input.limit).map(({ mentor }) => mentor),
    nextCursor: eligible.length > input.limit
      ? (eligible[input.limit - 1]?.cursor ?? null)
      : exhausted
        ? null
        : (scanCursor ?? null),
  }
}
