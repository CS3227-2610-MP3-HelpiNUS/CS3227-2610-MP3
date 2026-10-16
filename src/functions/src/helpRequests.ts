import { createHash } from 'node:crypto'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import {
  canonicalDocumentIdSchema, f01HelpRequestSchema, mentorProfileSchema,
  moduleSchema, userSchema, type CreateHelpRequestInput,
  type F01HelpRequest, type HelpRequestSummary, type RespondToHelpRequestInput,
} from '@helpinus/shared'
import { requireCurrentMentor, requireRole, type AuthorizedUser } from './auth.js'

type Stored = Omit<F01HelpRequest, 'createdAt' | 'updatedAt'> & { createdAt: Timestamp; updatedAt: Timestamp }
type CreateResult = { kind: 'created'; helpRequest: F01HelpRequest } | { kind: 'duplicate'; existingHelpRequestId: string; currentStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' }
type DecideResult = { kind: 'decided' | 'already_decided'; helpRequest: F01HelpRequest; conversationId: string | null } | { kind: 'conflict'; actualStatus: 'ACCEPTED' | 'REJECTED' }
type Provision = (transaction: Transaction, request: Stored, existingConversation: DocumentSnapshot) => string

const failIntegrity = (): never => { throw new HttpsError('failed-precondition', 'Request data needs support review.', { reason: 'INTEGRITY_ERROR' }) }
const unavailable = (): never => { throw new HttpsError('unavailable', 'Acceptance is waiting for conversation integration.', { reason: 'F02_UNAVAILABLE' }) }
const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : value
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const tupleDigest = (studentId: string, mentorId: string, moduleId: string) => digest([studentId, mentorId, moduleId].map((part) => `${part.length}:${part}`))

function parseUser(snapshot: DocumentSnapshot, uid: string, role: 'STUDENT' | 'MENTOR', email?: string) {
  const raw = snapshot.data()
  const parsed = userSchema.safeParse({ ...raw, createdAt: iso(raw?.createdAt) })
  if (!parsed.success || parsed.data.id !== uid || parsed.data.role !== role || parsed.data.status !== 'ACTIVE' || (email && parsed.data.email !== email)) {
    throw new HttpsError('permission-denied', 'Account access has changed.')
  }
  return parsed.data
}

function parseRequest(snapshot: DocumentSnapshot): { stored: Stored; public: F01HelpRequest } {
  const raw = snapshot.data()
  const publicRecord = f01HelpRequestSchema.safeParse({ ...raw, createdAt: iso(raw?.createdAt), updatedAt: iso(raw?.updatedAt) })
  if (!publicRecord.success || publicRecord.data.id !== snapshot.id || !(raw?.createdAt instanceof Timestamp) || !(raw?.updatedAt instanceof Timestamp)) return failIntegrity()
  return { stored: raw as Stored, public: publicRecord.data }
}

function counts(snapshot: DocumentSnapshot): HelpRequestSummary | null {
  if (!snapshot.exists) return null
  const raw = snapshot.data()
  const pendingCount = raw?.pendingCount
  const acceptedCount = raw?.acceptedCount
  const rejectedCount = raw?.rejectedCount
  if (!raw || ![pendingCount, acceptedCount, rejectedCount].every((n) => Number.isSafeInteger(n) && n >= 0) || raw.openCount !== pendingCount + acceptedCount) return failIntegrity()
  return { pendingCount, acceptedCount, rejectedCount, openCount: raw.openCount, updatedAt: iso(raw.updatedAt) as string }
}

async function requireCurrentStudent(request: CallableRequest<unknown>): Promise<AuthorizedUser> {
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

export async function createHelpRequestHandler(input: CreateHelpRequestInput, request: CallableRequest<unknown>, db: Firestore): Promise<CreateResult> {
  const actor = await requireCurrentStudent(request)
  const fingerprint = digest([input.mentorId, input.moduleId, input.title, input.description])
  const tupleHash = tupleDigest(actor.uid, input.mentorId, input.moduleId)
  const receiptRef = db.collection('helpRequestOperations').doc(actor.uid).collection('operations').doc(input.operationId)
  const keyRef = db.collection('pendingHelpRequestKeys').doc(tupleHash)
  const studentRef = db.collection('users').doc(actor.uid)
  const mentorRef = db.collection('users').doc(input.mentorId)
  const profileRef = db.collection('mentorProfiles').doc(input.mentorId)
  const moduleRef = db.collection('modules').doc(input.moduleId)
  const summaryRef = db.collection('helpRequestSummaries').doc(actor.uid)
  const requestRef = db.collection('helpRequests').doc()

  return db.runTransaction(async (tx) => {
    const [receipt, key, student, mentor, profile, module, summary] = await Promise.all([
      tx.get(receiptRef), tx.get(keyRef), tx.get(studentRef), tx.get(mentorRef), tx.get(profileRef), tx.get(moduleRef), tx.get(summaryRef),
    ])
    parseUser(student, actor.uid, 'STUDENT', actor.email)
    const prior = receipt.data()
    if (receipt.exists) {
      if (prior?.studentId !== actor.uid || prior?.fingerprint !== fingerprint) throw new HttpsError('invalid-argument', 'Operation ID was reused with different content.', { reason: 'OPERATION_ID_REUSED' })
      if (typeof prior.helpRequestId !== 'string' || !canonicalDocumentIdSchema.safeParse(prior.helpRequestId).success) failIntegrity()
      const previous = parseRequest(await tx.get(db.collection('helpRequests').doc(prior.helpRequestId)))
      if (previous.public.studentId !== actor.uid || previous.public.mentorId !== input.mentorId || previous.public.moduleId !== input.moduleId) failIntegrity()
      if (prior.kind === 'CREATED') return { kind: 'created', helpRequest: previous.public }
      if (prior.kind === 'DUPLICATE') return { kind: 'duplicate', existingHelpRequestId: previous.public.id, currentStatus: previous.public.status }
      failIntegrity()
    }
    const mentorUser = parseUser(mentor, input.mentorId, 'MENTOR')
    const mentorProfile = mentorProfileSchema.safeParse(profile.data())
    const selectedModule = moduleSchema.safeParse(module.data())
    if (!mentorProfile.success || mentorProfile.data.userId !== input.mentorId || !mentorProfile.data.active || !mentorProfile.data.moduleIds.includes(input.moduleId) || !selectedModule.success || selectedModule.data.id !== input.moduleId || !selectedModule.data.active) {
      throw new HttpsError('failed-precondition', 'The selected Mentor or module is no longer available.', { reason: 'SELECTION_INELIGIBLE' })
    }
    if (key.exists) {
      const target = key.data()
      if (target?.studentId !== actor.uid || target?.mentorId !== input.mentorId || target?.moduleId !== input.moduleId || typeof target?.helpRequestId !== 'string') return failIntegrity()
      const existing = parseRequest(await tx.get(db.collection('helpRequests').doc(target.helpRequestId)))
      if (existing.public.status !== 'PENDING' || existing.public.studentId !== actor.uid || existing.public.mentorId !== input.mentorId || existing.public.moduleId !== input.moduleId) failIntegrity()
      tx.create(receiptRef, { studentId: actor.uid, fingerprint, kind: 'DUPLICATE', helpRequestId: existing.public.id })
      return { kind: 'duplicate', existingHelpRequestId: existing.public.id, currentStatus: 'PENDING' }
    }
    const priorCounts = counts(summary)
    const now = Timestamp.now()
    const stored: Stored = { id: requestRef.id, studentId: actor.uid, mentorId: input.mentorId, moduleId: input.moduleId, title: input.title, description: input.description, studentDisplayName: actor.displayName, mentorDisplayName: mentorUser.displayName, status: 'PENDING', createdAt: now, updatedAt: now }
    const publicRecord = f01HelpRequestSchema.parse({ ...stored, createdAt: iso(now), updatedAt: iso(now) })
    tx.create(requestRef, stored)
    tx.create(keyRef, { studentId: actor.uid, mentorId: input.mentorId, moduleId: input.moduleId, helpRequestId: requestRef.id })
    tx.create(receiptRef, { studentId: actor.uid, fingerprint, kind: 'CREATED', helpRequestId: requestRef.id })
    tx.set(summaryRef, { pendingCount: (priorCounts?.pendingCount ?? 0) + 1, acceptedCount: priorCounts?.acceptedCount ?? 0, rejectedCount: priorCounts?.rejectedCount ?? 0, openCount: (priorCounts?.openCount ?? 0) + 1, updatedAt: now })
    return { kind: 'created', helpRequest: publicRecord }
  })
}

// The production export intentionally has no provision adapter until F02 supplies
// its real transactional helper. Isolated tests may inject a test-only adapter.
export async function respondToHelpRequestHandler(input: RespondToHelpRequestInput, request: CallableRequest<unknown>, db: Firestore, provision?: Provision): Promise<DecideResult> {
  const actor = await requireCurrentMentor(request)
  const requestRef = db.collection('helpRequests').doc(input.helpRequestId)
  const conversationRef = db.collection('conversations').doc(input.helpRequestId)
  const mentorRef = db.collection('users').doc(actor.uid)
  return db.runTransaction(async (tx) => {
    const [requestSnapshot, conversation, mentor] = await Promise.all([tx.get(requestRef), tx.get(conversationRef), tx.get(mentorRef)])
    parseUser(mentor, actor.uid, 'MENTOR', actor.email)
    if (!requestSnapshot.exists || requestSnapshot.data()?.mentorId !== actor.uid) throw new HttpsError('permission-denied', 'Request access is unavailable.')
    const current = parseRequest(requestSnapshot)
    const keyRef = db.collection('pendingHelpRequestKeys').doc(tupleDigest(current.public.studentId, actor.uid, current.public.moduleId))
    const summaryRef = db.collection('helpRequestSummaries').doc(current.public.studentId)
    const [key, summary] = await Promise.all([tx.get(keyRef), tx.get(summaryRef)])
    const priorCounts = counts(summary)
    if (!priorCounts) return failIntegrity()
    if (current.public.status !== 'PENDING') {
      if (current.public.status === 'ACCEPTED') {
        const data = conversation.data()
        if (!conversation.exists || data?.helpRequestId !== current.public.id || data?.studentId !== current.public.studentId || data?.mentorId !== actor.uid || !Array.isArray(data.participantIds) || data.participantIds.length !== 2 || data.participantIds[0] !== current.public.studentId || data.participantIds[1] !== actor.uid) failIntegrity()
      } else if (conversation.exists) failIntegrity()
      if (current.public.status !== input.response) return { kind: 'conflict', actualStatus: current.public.status }
      return { kind: 'already_decided', helpRequest: current.public, conversationId: current.public.status === 'ACCEPTED' ? current.public.id : null }
    }
    if (conversation.exists || key.data()?.helpRequestId !== current.public.id || key.data()?.studentId !== current.public.studentId || key.data()?.mentorId !== actor.uid || key.data()?.moduleId !== current.public.moduleId || priorCounts.pendingCount < 1) failIntegrity()
    const now = Timestamp.now()
    const updated: Stored = { ...current.stored, status: input.response, updatedAt: now }
    let conversationId: string | null = null
    if (input.response === 'ACCEPTED') {
      if (!provision) return unavailable()
      conversationId = provision(tx, updated, conversation)
      if (conversationId !== current.public.id) failIntegrity()
    }
    tx.update(requestRef, { status: input.response, updatedAt: now })
    tx.delete(keyRef)
    tx.set(summaryRef, { pendingCount: priorCounts.pendingCount - 1, acceptedCount: priorCounts.acceptedCount + (input.response === 'ACCEPTED' ? 1 : 0), rejectedCount: priorCounts.rejectedCount + (input.response === 'REJECTED' ? 1 : 0), openCount: priorCounts.openCount - (input.response === 'REJECTED' ? 1 : 0), updatedAt: now })
    return { kind: 'decided', helpRequest: f01HelpRequestSchema.parse({ ...updated, createdAt: iso(updated.createdAt), updatedAt: iso(now) }), conversationId }
  })
}
