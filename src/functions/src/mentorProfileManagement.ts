import { createHash } from 'node:crypto'
import { FieldValue, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import {
  canonicalDocumentIdSchema, mentorProfileSchema, moduleSchema,
  updateOwnMentorProfileOutputSchema,
  type ReadOwnMentorProfileOutput, type UpdateOwnMentorProfileInput,
  type UpdateOwnMentorProfileOutput,
} from '@helpinus/shared'
import { assertCurrentMentorRecord, requireCurrentMentor } from './auth.js'

function version(profileSnapshot: DocumentSnapshot, stateSnapshot: DocumentSnapshot): { revision: number; updateTime: string } | null {
  const revision = stateSnapshot.exists ? stateSnapshot.data()?.revision : 0
  const stamp = profileSnapshot.updateTime
  if (!Number.isSafeInteger(revision) || revision < 0 || !stamp) return null
  return { revision, updateTime: `${stamp.seconds}:${String(stamp.nanoseconds).padStart(9, '0')}` }
}

function validProfile(snapshot: DocumentSnapshot, uid: string) {
  const raw = snapshot.data()
  const parsed = mentorProfileSchema.safeParse(raw)
  if (!parsed.success || raw?.userId !== uid || parsed.data.userId !== uid) return null
  const ids = parsed.data.moduleIds
  if (!Array.isArray(raw?.moduleIds) || ids.some((id, index) => raw.moduleIds[index] !== id || !canonicalDocumentIdSchema.safeParse(id).success) || new Set(ids).size !== ids.length) return null
  return parsed.data
}

export async function readOwnMentorProfileHandler(_input: Record<string, never>, request: CallableRequest<unknown>, db: Firestore): Promise<ReadOwnMentorProfileOutput> {
  const user = await requireCurrentMentor(request)
  const profileRef = db.collection('mentorProfiles').doc(user.uid)
  const stateRef = profileRef.collection('private').doc('profileState')
  const [snapshot, stateSnapshot] = await db.runTransaction(async (transaction) => Promise.all([
    transaction.get(profileRef), transaction.get(stateRef),
  ]), { readOnly: true })
  if (!snapshot.exists) return { kind: 'missing' }
  if (snapshot.data()?.active !== true) return { kind: 'inactive' }
  const profile = validProfile(snapshot, user.uid)
  const currentVersion = version(snapshot, stateSnapshot)
  if (!profile || !currentVersion) return { kind: 'invalid' }
  const result: ReadOwnMentorProfileOutput = {
    kind: 'ready',
    profile: { displayName: user.displayName, biography: profile.biography, moduleIds: profile.moduleIds, version: currentVersion },
    metadata: { kind: 'ready', modules: [] },
  }
  if (profile.moduleIds.length === 0) return result
  try {
    const documents = await db.getAll(...profile.moduleIds.map((id) => db.collection('modules').doc(id)))
    const modules = documents.map((document, index) => {
      const id = profile.moduleIds[index]!
      if (!document.exists) return { id, state: 'missing' as const }
      const parsed = moduleSchema.safeParse(document.data())
      if (!parsed.success || document.data()?.id !== id || parsed.data.id !== id) throw new Error('invalid metadata')
      return { id, state: parsed.data.active ? 'active' as const : 'inactive' as const, code: parsed.data.code, title: parsed.data.title }
    })
    return { ...result, metadata: { kind: 'ready', modules } }
  } catch {
    console.error('Mentor module metadata unavailable')
    return { ...result, metadata: { kind: 'unavailable' } }
  }
}

function fingerprint(uid: string, input: UpdateOwnMentorProfileInput): string {
  return createHash('sha256').update(JSON.stringify({ uid, baseline: input.baseline, biography: input.biography.trim(), moduleIds: [...input.moduleIds].sort() })).digest('hex')
}

export async function updateOwnMentorProfileHandler(input: UpdateOwnMentorProfileInput, request: CallableRequest<unknown>, db: Firestore): Promise<UpdateOwnMentorProfileOutput> {
  const user = await requireCurrentMentor(request)
  const profileRef = db.collection('mentorProfiles').doc(user.uid)
  const stateRef = profileRef.collection('private').doc('profileState')
  const recordRef = profileRef.collection('saveRequests').doc(input.requestId)
  const userRef = db.collection('users').doc(user.uid)
  const expectedFingerprint = fingerprint(user.uid, input)
  return db.runTransaction(async (transaction) => {
    const [userSnapshot, profileSnapshot, stateSnapshot, recordSnapshot] = await Promise.all([
      transaction.get(userRef), transaction.get(profileRef), transaction.get(stateRef), transaction.get(recordRef),
    ])
    assertCurrentMentorRecord(userSnapshot.data(), user.uid, user.email)
    if (!profileSnapshot.exists || profileSnapshot.data()?.active !== true || !validProfile(profileSnapshot, user.uid) || !version(profileSnapshot, stateSnapshot)) {
      throw new HttpsError('failed-precondition', 'Your Mentor profile is unavailable. Contact support.')
    }
    if (recordSnapshot.exists) {
      const record = recordSnapshot.data()
      if (record?.fingerprint !== expectedFingerprint) throw new HttpsError('invalid-argument', 'This request ID was used for another change.')
      const outcome = updateOwnMentorProfileOutputSchema.safeParse(record?.outcome)
      if (!outcome.success) throw new HttpsError('internal', 'The saved request is invalid.')
      return outcome.data
    }
    const current = version(profileSnapshot, stateSnapshot)
    const profile = validProfile(profileSnapshot, user.uid)!
    let outcome: UpdateOwnMentorProfileOutput
    if (!current || current.revision !== input.baseline.revision || current.updateTime !== input.baseline.updateTime) {
      outcome = { kind: 'rejected', reason: 'CONFLICT' }
    } else {
      const existing = new Set(profile.moduleIds)
      const newIds = input.moduleIds.filter((id) => !existing.has(id))
      const moduleDocuments = await Promise.all(newIds.map((id) => transaction.get(db.collection('modules').doc(id))))
      const invalid = moduleDocuments.some((document, index) => {
        const parsed = moduleSchema.safeParse(document.data())
        return !parsed.success || !parsed.data.active || parsed.data.id !== newIds[index]
      })
      outcome = invalid
        ? { kind: 'rejected', reason: 'MODULE_INELIGIBLE', fieldErrors: { moduleIds: ['Choose active catalogue modules.'] } }
        : { kind: 'accepted', stored: { biography: input.biography.trim(), moduleIds: input.moduleIds, revision: current.revision + 1 } }
    }
    if (outcome.kind === 'accepted') {
      transaction.update(profileRef, { biography: outcome.stored.biography, moduleIds: outcome.stored.moduleIds })
      transaction.set(stateRef, { revision: outcome.stored.revision })
    }
    transaction.create(recordRef, { fingerprint: expectedFingerprint, outcome, createdAt: FieldValue.serverTimestamp() })
    return outcome
  })
}
