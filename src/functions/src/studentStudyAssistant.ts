import { createHash, randomUUID } from 'node:crypto'
import {
  FieldPath,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import {
  callableSchemas,
  studentStudyAssistantConversationSchema,
  studentStudyAssistantMessageSchema,
  type DeleteStudentStudyAssistantConversationInput,
  type ListStudentStudyAssistantConversationsParsedInput,
  type ReadStudentStudyAssistantConversationParsedInput,
  type StudentStudyAssistInput,
  type StudentStudyAssistOutput,
  type StudentStudyAssistantCitation,
  type StudentStudyAssistantConversation,
  type StudentStudyAssistantMessage,
} from '@helpinus/shared'
import { requireRole, type AuthorizedUser } from './auth.js'
import {
  createStudentStudyAssistantProvider,
  studentStudyAssistantProviderResultSchema,
  type StudentStudyAssistantProvider,
} from './studentStudyAssistantProvider.js'
import {
  citationFromChunk,
  createStudentStudyAssistantRetriever,
  type StudentStudyAssistantRetriever,
} from './studentStudyAssistantRetrieval.js'

const conversationRetentionMs = 14 * 24 * 60 * 60 * 1000
const auditRetentionMs = 30 * 24 * 60 * 60 * 1000
const operationLeaseMs = 30 * 1000
const rateWindowMs = 60 * 1000
const defaultRequestsPerWindow = 20
const defaultReplaysPerWindow = 60
const historyMessageLimit = 12
const historyCharacterLimit = 16_000
const retrievalLimit = 4
const hasInvisibleControl = (value: string) => Array.from(value).some((character) => {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 0x08 || codePoint === 0x0b || codePoint === 0x0c ||
    (codePoint >= 0x0e && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) || (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x206f) || codePoint === 0xfeff
})

export const studentStudyAssistantExpiryCleanupPolicy = Object.freeze({
  collectionGroup: 'studentStudyAssistantConversations',
  field: 'expiresAt',
  targetHours: 24,
  investigateAfterHours: 72,
})

export const studentStudyAssistantAuditCleanupPolicy = Object.freeze({
  collection: 'studentStudyAssistantAuditEvents',
  field: 'expiresAt',
  retentionDays: 30,
})

export const studentStudyAssistantDeleteOperationCleanupPolicy = Object.freeze({
  collectionGroup: 'studentStudyAssistantDeleteOperations',
  field: 'expiresAt',
  retentionDays: 30,
})

export interface StudentStudyAssistantDependencies {
  provider: StudentStudyAssistantProvider
  retriever: StudentStudyAssistantRetriever
  enabled: boolean
  requestsPerWindow: number
  replaysPerWindow: number
  providerTimeoutMs: number
  now: () => Timestamp
  newLeaseToken: () => string
}

interface StoredConversation {
  ownerId: string
  title: string
  preview: string
  lastActivityAt: Timestamp
  expiresAt: Timestamp
  nextSequence: number
  deletedAt: Timestamp | null
  contentDeletedAt?: Timestamp | null
}

interface StoredMessage {
  role: 'STUDENT' | 'ASSISTANT'
  content: string
  sequence: number
  createdAt: Timestamp
  grounding?: 'GROUNDED' | 'INSUFFICIENT_CONTEXT'
  citations?: StudentStudyAssistantCitation[]
}

interface SendClaim {
  conversationId: string
  leaseToken: string
  replay: StudentStudyAssistOutput | null
}

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const iso = (value: Timestamp) => value.toDate().toISOString()
const failIntegrity = (): never => {
  throw new HttpsError('failed-precondition', 'Study assistant data needs support review.', { reason: 'INTEGRITY_ERROR' })
}
const denyConversation = (): never => {
  throw new HttpsError('permission-denied', 'Study assistant conversation access is unavailable.')
}
const expiredConversation = (): never => {
  throw new HttpsError('failed-precondition', 'This Study assistant conversation has expired.', { reason: 'CONVERSATION_EXPIRED' })
}

function integerSetting(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function createStudentStudyAssistantDependencies(
  emulator = process.env.FUNCTIONS_EMULATOR === 'true',
): StudentStudyAssistantDependencies {
  return {
    provider: createStudentStudyAssistantProvider(emulator),
    retriever: createStudentStudyAssistantRetriever(emulator),
    // Emulators are usable by default with synthetic fixtures. Production is
    // fail-closed until the provider, corpus, retention jobs, and secret are
    // reviewed and an administrator explicitly enables the feature.
    enabled: emulator
      ? process.env.STUDENT_STUDY_ASSISTANT_ENABLED !== 'false'
      : process.env.STUDENT_STUDY_ASSISTANT_ENABLED === 'true',
    requestsPerWindow: integerSetting(process.env.STUDENT_STUDY_ASSISTANT_REQUESTS_PER_MINUTE, defaultRequestsPerWindow),
    replaysPerWindow: integerSetting(process.env.STUDENT_STUDY_ASSISTANT_REPLAYS_PER_MINUTE, defaultReplaysPerWindow),
    providerTimeoutMs: Math.min(integerSetting(process.env.STUDENT_STUDY_ASSISTANT_PROVIDER_TIMEOUT_MS, 15_000), 30_000),
    now: Timestamp.now,
    newLeaseToken: randomUUID,
  }
}

function requireEnabled(dependencies: StudentStudyAssistantDependencies): void {
  if (!dependencies.enabled) {
    throw new HttpsError('unavailable', 'The Study assistant is temporarily unavailable.', { reason: 'FEATURE_DISABLED' })
  }
}

function assertCurrentStudent(snapshot: DocumentSnapshot, actor: AuthorizedUser): void {
  const data = snapshot.data()
  if (!snapshot.exists || data?.id !== actor.uid || data.email !== actor.email || data.role !== 'STUDENT' || data.status !== 'ACTIVE') {
    throw new HttpsError('permission-denied', 'Student account access has changed.')
  }
}

function parseStoredConversation(
  snapshot: DocumentSnapshot,
  actor: AuthorizedUser,
  now: Timestamp,
): { stored: StoredConversation; public: StudentStudyAssistantConversation } {
  const data = snapshot.data() as Partial<StoredConversation> | undefined
  if (!snapshot.exists || !data || data.ownerId !== actor.uid) return denyConversation()
  if (data.deletedAt instanceof Timestamp) return denyConversation()
  if (!(data.lastActivityAt instanceof Timestamp) || !(data.expiresAt instanceof Timestamp) ||
      !Number.isSafeInteger(data.nextSequence) || (data.nextSequence ?? -1) < 0 ||
      typeof data.title !== 'string' || typeof data.preview !== 'string') return failIntegrity()
  if (data.expiresAt.toMillis() <= now.toMillis()) return expiredConversation()
  const publicConversation = studentStudyAssistantConversationSchema.safeParse({
    id: snapshot.id,
    title: data.title,
    preview: data.preview,
    lastActivityAt: iso(data.lastActivityAt),
    expiresAt: iso(data.expiresAt),
  })
  if (!publicConversation.success) return failIntegrity()
  return { stored: data as StoredConversation, public: publicConversation.data }
}

function parseStoredMessage(snapshot: QueryDocumentSnapshot): StudentStudyAssistantMessage & { sequence: number } {
  const data = snapshot.data() as Partial<StoredMessage>
  if ((data.role !== 'STUDENT' && data.role !== 'ASSISTANT') || typeof data.content !== 'string' ||
      !(data.createdAt instanceof Timestamp) || !Number.isSafeInteger(data.sequence) || (data.sequence ?? -1) < 0) return failIntegrity()
  if (data.role === 'STUDENT' && (data.grounding !== undefined || data.citations !== undefined)) return failIntegrity()
  const message = studentStudyAssistantMessageSchema.safeParse({
    id: snapshot.id,
    role: data.role,
    content: data.content,
    createdAt: iso(data.createdAt),
    ...(data.role === 'ASSISTANT' ? { grounding: data.grounding, citations: data.citations } : {}),
  })
  if (!message.success) return failIntegrity()
  return { ...message.data, sequence: data.sequence as number }
}

function encodeCursor(values: unknown[]): string {
  return Buffer.from(JSON.stringify(values), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string, kind: 'conversation' | 'message'): [number, string] {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown
    if (!Array.isArray(parsed) || parsed.length !== 2 || !Number.isSafeInteger(parsed[0]) ||
        (parsed[0] as number) < 0 || typeof parsed[1] !== 'string' || parsed[1].length < 1 || parsed[1].length > 128) throw new Error('invalid')
    return [parsed[0] as number, parsed[1]]
  } catch {
    throw new HttpsError('invalid-argument', `The ${kind} cursor is invalid.`)
  }
}

function titleFrom(message: string): string {
  const singleLine = message.replace(/\s+/gu, ' ').trim()
  return singleLine.length <= 80 ? singleLine : `${singleLine.slice(0, 77)}...`
}

function previewFrom(message: string): string {
  const singleLine = message.replace(/\s+/gu, ' ').trim()
  return singleLine.slice(0, 240)
}

async function withProviderTimeout<Result>(work: Promise<Result>, timeoutMs: number): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new HttpsError(
          'deadline-exceeded',
          'The Study assistant took too long to answer. Retry with the same request.',
          { reason: 'PROVIDER_TIMEOUT' },
        )), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function auditRecord(event: string, actor: AuthorizedUser, now: Timestamp, metadata: Record<string, unknown>) {
  return {
    featureId: 'S2-D1-F03',
    feature: 'STUDENT_STUDY_ASSISTANT',
    event,
    actorId: actor.uid,
    occurredAt: now,
    expiresAt: Timestamp.fromMillis(now.toMillis() + auditRetentionMs),
    ...metadata,
  }
}

function safeErrorReason(error: unknown): string {
  if (error instanceof HttpsError) {
    const reason = (error.details as { reason?: unknown } | undefined)?.reason
    return typeof reason === 'string' ? reason.slice(0, 80) : error.code.toLocaleUpperCase('en')
  }
  return 'INTERNAL'
}

async function recordAuditBestEffort(
  db: Firestore,
  event: string,
  actor: AuthorizedUser,
  now: Timestamp,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await db.collection('studentStudyAssistantAuditEvents').doc().set(auditRecord(event, actor, now, metadata))
  } catch {
    // Operational logging must never broaden access or replace the safe error.
  }
}

async function claimSend(
  input: StudentStudyAssistInput,
  actor: AuthorizedUser,
  db: Firestore,
  dependencies: StudentStudyAssistantDependencies,
): Promise<SendClaim> {
  const now = dependencies.now()
  const conversationId = input.conversationId ?? digest(['conversation', actor.uid, input.requestId]).slice(0, 40)
  const fingerprint = digest([input.conversationId, input.userMessage])
  const leaseToken = dependencies.newLeaseToken()
  const ownerRef = db.collection('studentStudyAssistantUsers').doc(actor.uid)
  const operationRef = ownerRef.collection('studentStudyAssistantSendOperations').doc(input.requestId)
  const conversationRef = ownerRef.collection('studentStudyAssistantConversations').doc(conversationId)
  const tombstoneRef = db.collection('studentStudyAssistantDeletionTombstones').doc(actor.uid).collection('studentStudyAssistantConversations').doc(conversationId)
  const rateRef = db.collection('studentStudyAssistantRateControls').doc(actor.uid)
  const userRef = db.collection('users').doc(actor.uid)

  return db.runTransaction(async (transaction) => {
    const [user, operation, conversation, tombstone, rate] = await Promise.all([
      transaction.get(userRef),
      transaction.get(operationRef),
      transaction.get(conversationRef),
      transaction.get(tombstoneRef),
      transaction.get(rateRef),
    ])
    assertCurrentStudent(user, actor)
    const saved = operation.data()
    if (tombstone.exists) return denyConversation()
    if (operation.exists) {
      if (saved?.ownerId !== actor.uid || saved.fingerprint !== fingerprint || saved.conversationId !== conversationId) {
        throw new HttpsError('invalid-argument', 'This request ID was used for another Study assistant message.', { reason: 'REQUEST_ID_REUSED' })
      }
      if (saved.state === 'COMPLETED') {
        parseStoredConversation(conversation, actor, now)
        const output = callableSchemas.studentStudyAssist.output.safeParse(saved.output)
        if (!output.success) return failIntegrity()
        const rateData = rate.data()
        const sameReplayWindow = rate.exists && rateData?.replayWindowStartedAt instanceof Timestamp &&
          now.toMillis() - rateData.replayWindowStartedAt.toMillis() < rateWindowMs
        const replayCount = sameReplayWindow && Number.isSafeInteger(rateData?.replayCount) ? rateData.replayCount as number : 0
        if (replayCount >= dependencies.replaysPerWindow) {
          throw new HttpsError('resource-exhausted', 'Too many Study assistant retries. Try again shortly.', { reason: 'REPLAY_RATE_LIMITED' })
        }
        transaction.set(rateRef, {
          ...(rateData ?? {}),
          replayWindowStartedAt: sameReplayWindow ? rateData.replayWindowStartedAt : now,
          replayCount: replayCount + 1,
          updatedAt: now,
        })
        return { conversationId, leaseToken, replay: { ...output.data, replayed: true } }
      }
      if (saved.state !== 'PENDING' || !(saved.leaseExpiresAt instanceof Timestamp)) return failIntegrity()
      if (saved.leaseExpiresAt.toMillis() > now.toMillis()) {
        throw new HttpsError('aborted', 'This message is already being processed. Retry shortly.', { reason: 'REQUEST_IN_PROGRESS' })
      }
    }
    if (input.conversationId) parseStoredConversation(conversation, actor, now)
    else if (conversation.exists) return failIntegrity()

    const rateData = rate.data()
    const sameWindow = rate.exists && rateData?.windowStartedAt instanceof Timestamp &&
      now.toMillis() - rateData.windowStartedAt.toMillis() < rateWindowMs
    const count = sameWindow && Number.isSafeInteger(rateData?.count) ? rateData.count as number : 0
    if (count >= dependencies.requestsPerWindow) {
      throw new HttpsError('resource-exhausted', 'Too many Study assistant requests. Try again shortly.', { reason: 'RATE_LIMITED' })
    }
    transaction.set(rateRef, {
      ...(rateData ?? {}),
      windowStartedAt: sameWindow ? rateData.windowStartedAt : now,
      count: count + 1,
      updatedAt: now,
    })
    transaction.set(operationRef, {
      ownerId: actor.uid,
      conversationId,
      fingerprint,
      state: 'PENDING',
      leaseToken,
      leaseExpiresAt: Timestamp.fromMillis(now.toMillis() + operationLeaseMs),
      createdAt: operation.exists && saved?.createdAt instanceof Timestamp ? saved.createdAt : now,
      updatedAt: now,
    })
    return { conversationId, leaseToken, replay: null }
  })
}

async function releaseSendClaim(
  input: StudentStudyAssistInput,
  actor: AuthorizedUser,
  claim: SendClaim,
  db: Firestore,
): Promise<void> {
  const operationRef = db.collection('studentStudyAssistantUsers').doc(actor.uid).collection('studentStudyAssistantSendOperations').doc(input.requestId)
  try {
    await db.runTransaction(async (transaction) => {
      const operation = await transaction.get(operationRef)
      if (operation.data()?.state === 'PENDING' && operation.data()?.leaseToken === claim.leaseToken) transaction.delete(operationRef)
    })
  } catch {
    // The short lease safely permits a later retry if best-effort cleanup fails.
  }
}

async function loadHistory(actor: AuthorizedUser, conversationId: string, db: Firestore): Promise<Array<{ role: 'STUDENT' | 'ASSISTANT'; content: string }>> {
  const snapshot = await db.collection('studentStudyAssistantUsers').doc(actor.uid)
    .collection('studentStudyAssistantConversations').doc(conversationId).collection('studentStudyAssistantMessages')
    .orderBy('sequence', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(historyMessageLimit).get()
  const recent: Array<{ role: 'STUDENT' | 'ASSISTANT'; content: string }> = []
  let characters = 0
  for (const document of snapshot.docs) {
    const { role, content } = parseStoredMessage(document)
    if (characters + content.length > historyCharacterLimit) break
    recent.push({ role, content })
    characters += content.length
  }
  return recent.reverse()
}

async function finalizeSend(
  input: StudentStudyAssistInput,
  actor: AuthorizedUser,
  claim: SendClaim,
  providerResult: { kind: 'grounded' | 'insufficient_context'; content: string },
  citations: StudentStudyAssistantCitation[],
  corpusGeneration: string,
  db: Firestore,
  dependencies: StudentStudyAssistantDependencies,
  providerLatencyMs: number,
): Promise<StudentStudyAssistOutput> {
  const now = dependencies.now()
  const expiresAt = Timestamp.fromMillis(now.toMillis() + conversationRetentionMs)
  const ownerRef = db.collection('studentStudyAssistantUsers').doc(actor.uid)
  const operationRef = ownerRef.collection('studentStudyAssistantSendOperations').doc(input.requestId)
  const conversationRef = ownerRef.collection('studentStudyAssistantConversations').doc(claim.conversationId)
  const tombstoneRef = db.collection('studentStudyAssistantDeletionTombstones').doc(actor.uid).collection('studentStudyAssistantConversations').doc(claim.conversationId)
  const userRef = db.collection('users').doc(actor.uid)
  const auditRef = db.collection('studentStudyAssistantAuditEvents').doc()

  return db.runTransaction(async (transaction) => {
    const [user, operation, conversation, tombstone] = await Promise.all([
      transaction.get(userRef), transaction.get(operationRef), transaction.get(conversationRef), transaction.get(tombstoneRef),
    ])
    assertCurrentStudent(user, actor)
    if (tombstone.exists) return denyConversation()
    const operationData = operation.data()
    if (!operation.exists || operationData?.ownerId !== actor.uid || operationData.leaseToken !== claim.leaseToken || operationData.state !== 'PENDING') {
      if (operationData?.state === 'COMPLETED') {
        const saved = callableSchemas.studentStudyAssist.output.safeParse(operationData.output)
        if (saved.success) return { ...saved.data, replayed: true }
      }
      throw new HttpsError('aborted', 'The Study assistant request changed while it was running. Retry.', { reason: 'REQUEST_CHANGED' })
    }

    const existing = conversation.exists ? parseStoredConversation(conversation, actor, now) : null
    if (Boolean(input.conversationId) !== Boolean(existing)) return failIntegrity()
    const sequence = existing?.stored.nextSequence ?? 0
    const userMessageId = digest(['user', actor.uid, input.requestId]).slice(0, 40)
    const assistantMessageId = digest(['assistant', actor.uid, input.requestId]).slice(0, 40)
    const userMessage = {
      id: userMessageId, role: 'STUDENT', content: input.userMessage, createdAt: iso(now),
    } as const
    const assistantMessage = providerResult.kind === 'grounded'
      ? {
        id: assistantMessageId, role: 'ASSISTANT' as const, content: providerResult.content, createdAt: iso(now),
        grounding: 'GROUNDED' as const, citations,
      }
      : {
        id: assistantMessageId, role: 'ASSISTANT' as const, content: providerResult.content, createdAt: iso(now),
        grounding: 'INSUFFICIENT_CONTEXT' as const, citations: [],
      }
    const publicConversation: StudentStudyAssistantConversation = {
      id: claim.conversationId,
      title: existing?.public.title ?? titleFrom(input.userMessage),
      preview: previewFrom(providerResult.content),
      lastActivityAt: iso(now),
      expiresAt: iso(expiresAt),
    }
    const output = callableSchemas.studentStudyAssist.output.parse({
      kind: providerResult.kind,
      conversation: publicConversation,
      userMessage,
      assistantMessage,
      replayed: false,
    })

    transaction.set(conversationRef, {
      ownerId: actor.uid,
      title: publicConversation.title,
      preview: publicConversation.preview,
      lastActivityAt: now,
      expiresAt,
      nextSequence: sequence + 2,
      deletedAt: null,
      contentDeletedAt: null,
    })
    transaction.create(conversationRef.collection('studentStudyAssistantMessages').doc(userMessageId), {
      role: 'STUDENT', content: input.userMessage, sequence, createdAt: now,
    })
    transaction.create(conversationRef.collection('studentStudyAssistantMessages').doc(assistantMessageId), {
      role: 'ASSISTANT', content: providerResult.content, sequence: sequence + 1, createdAt: now,
      grounding: assistantMessage.grounding, citations: assistantMessage.citations,
    })
    transaction.set(operationRef, {
      ...operationData,
      state: 'COMPLETED',
      output,
      completedAt: now,
      updatedAt: now,
    })
    transaction.create(auditRef, auditRecord('MESSAGE_COMPLETED', actor, now, {
      conversationId: claim.conversationId,
      requestId: input.requestId,
      outcome: output.kind,
      citationSourceIds: citations.map((citation) => citation.sourceId),
      corpusGeneration,
      providerStatus: output.kind === 'grounded' ? 'GROUNDED' : 'INSUFFICIENT_CONTEXT',
      providerLatencyMs,
    }))
    return callableSchemas.studentStudyAssist.output.parse(output)
  })
}

export async function studentStudyAssistHandler(
  input: StudentStudyAssistInput,
  request: CallableRequest<unknown>,
  db: Firestore,
  dependencies: StudentStudyAssistantDependencies = createStudentStudyAssistantDependencies(),
): Promise<StudentStudyAssistOutput> {
  const actor = await requireRole(request, 'STUDENT')
  requireEnabled(dependencies)
  if (hasInvisibleControl(input.userMessage)) {
    await recordAuditBestEffort(db, 'VALIDATION_REJECTED', actor, dependencies.now(), {
      requestId: input.requestId,
      conversationId: input.conversationId,
      reason: 'UNSAFE_TEXT_CONTROL',
    })
    throw new HttpsError('invalid-argument', 'The message contains unsupported invisible control characters.', {
      reason: 'UNSAFE_TEXT_CONTROL',
    })
  }
  let claim: SendClaim
  try {
    claim = await claimSend(input, actor, db, dependencies)
  } catch (error) {
    await recordAuditBestEffort(db, 'REQUEST_REJECTED', actor, dependencies.now(), {
      requestId: input.requestId,
      conversationId: input.conversationId,
      reason: safeErrorReason(error),
    })
    throw error
  }
  if (claim.replay) {
    await recordAuditBestEffort(db, 'MESSAGE_REPLAYED', actor, dependencies.now(), {
      requestId: input.requestId,
      conversationId: claim.conversationId,
    })
    return callableSchemas.studentStudyAssist.output.parse(claim.replay)
  }

  const providerStartedAt = Date.now()
  try {
    const [retrieval, history] = await Promise.all([
      dependencies.retriever.retrieve(input.userMessage, retrievalLimit),
      input.conversationId ? loadHistory(actor, claim.conversationId, db) : Promise.resolve([]),
    ])
    const rawProviderResult = retrieval.chunks.length === 0
      ? {
        kind: 'insufficient_context' as const,
        content: 'I could not find enough information in the approved sources to answer that question.',
        citationChunkIds: [],
      }
      : await withProviderTimeout(
        dependencies.provider.answer({ userMessage: input.userMessage, history, context: retrieval.chunks }),
        dependencies.providerTimeoutMs,
      )
    const providerResult = studentStudyAssistantProviderResultSchema.parse(rawProviderResult)
    const retrievedById = new Map(retrieval.chunks.map((chunk) => [chunk.chunkId, chunk]))
    const selectedChunks = providerResult.citationChunkIds.map((chunkId) => retrievedById.get(chunkId))
    if (selectedChunks.some((chunk) => !chunk)) {
      throw new HttpsError('unavailable', 'The Study assistant returned invalid source provenance. Try again.', { reason: 'INVALID_PROVENANCE' })
    }
    const citations = providerResult.kind === 'grounded'
      ? selectedChunks.map((chunk) => citationFromChunk(chunk!))
      : []
    return await finalizeSend(
      input, actor, claim, providerResult, citations, retrieval.corpusGeneration,
      db, dependencies, Math.max(0, Date.now() - providerStartedAt),
    )
  } catch (error) {
    await releaseSendClaim(input, actor, claim, db)
    await recordAuditBestEffort(db, 'MESSAGE_FAILED', actor, dependencies.now(), {
      requestId: input.requestId,
      conversationId: claim.conversationId,
      reason: safeErrorReason(error),
      providerLatencyMs: Math.max(0, Date.now() - providerStartedAt),
    })
    if (error instanceof HttpsError) throw error
    throw new HttpsError('unavailable', 'The Study assistant could not answer right now. Try again.', { reason: 'PROVIDER_FAILURE' })
  }
}

export async function listStudentStudyAssistantConversationsHandler(
  input: ListStudentStudyAssistantConversationsParsedInput,
  request: CallableRequest<unknown>,
  db: Firestore,
  dependencies: StudentStudyAssistantDependencies = createStudentStudyAssistantDependencies(),
) {
  const actor = await requireRole(request, 'STUDENT')
  requireEnabled(dependencies)
  const now = dependencies.now()
  let query = db.collection('studentStudyAssistantUsers').doc(actor.uid).collection('studentStudyAssistantConversations')
    .where('deletedAt', '==', null)
    .where('expiresAt', '>', now)
    .orderBy('expiresAt', 'desc')
    .orderBy(FieldPath.documentId(), 'desc')
    .limit(input.limit + 1)
  if (input.cursor) {
    const [expiresAtMillis, id] = decodeCursor(input.cursor, 'conversation')
    query = query.startAfter(Timestamp.fromMillis(expiresAtMillis), id)
  }
  const snapshot = await query.get()
  const parsed = snapshot.docs.map((document) => parseStoredConversation(document, actor, now))
  const visible = parsed.slice(0, input.limit)
  const last = visible.at(-1)
  return callableSchemas.listStudentStudyAssistantConversations.output.parse({
    conversations: visible.map(({ public: conversation }) => conversation),
    nextCursor: parsed.length > input.limit && last
      ? encodeCursor([last.stored.expiresAt.toMillis(), last.public.id])
      : null,
  })
}

export async function readStudentStudyAssistantConversationHandler(
  input: ReadStudentStudyAssistantConversationParsedInput,
  request: CallableRequest<unknown>,
  db: Firestore,
  dependencies: StudentStudyAssistantDependencies = createStudentStudyAssistantDependencies(),
) {
  const actor = await requireRole(request, 'STUDENT')
  requireEnabled(dependencies)
  const now = dependencies.now()
  const conversationRef = db.collection('studentStudyAssistantUsers').doc(actor.uid).collection('studentStudyAssistantConversations').doc(input.conversationId)
  const tombstoneRef = db.collection('studentStudyAssistantDeletionTombstones').doc(actor.uid).collection('studentStudyAssistantConversations').doc(input.conversationId)
  let messageQuery = conversationRef.collection('studentStudyAssistantMessages')
    .orderBy('sequence', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(input.limit + 1)
  if (input.cursor) {
    const [sequence, id] = decodeCursor(input.cursor, 'message')
    messageQuery = messageQuery.startAfter(sequence, id)
  }
  const result = await db.runTransaction(async (transaction) => {
    const [conversation, tombstone, messages] = await Promise.all([
      transaction.get(conversationRef), transaction.get(tombstoneRef), transaction.get(messageQuery),
    ])
    if (tombstone.exists) return denyConversation()
    return { conversation: parseStoredConversation(conversation, actor, now), messages: messages.docs.map(parseStoredMessage) }
  }, { readOnly: true })
  const visible = result.messages.slice(0, input.limit)
  const last = visible.at(-1)
  return callableSchemas.readStudentStudyAssistantConversation.output.parse({
    conversation: result.conversation.public,
    messages: visible.slice().reverse().map(({ sequence, ...message }) => {
      void sequence
      return message
    }),
    nextCursor: result.messages.length > input.limit && last ? encodeCursor([last.sequence, last.id]) : null,
  })
}

export async function deleteStudentStudyAssistantConversationHandler(
  input: DeleteStudentStudyAssistantConversationInput,
  request: CallableRequest<unknown>,
  db: Firestore,
  dependencies: StudentStudyAssistantDependencies = createStudentStudyAssistantDependencies(),
) {
  const actor = await requireRole(request, 'STUDENT')
  requireEnabled(dependencies)
  const now = dependencies.now()
  const ownerRef = db.collection('studentStudyAssistantUsers').doc(actor.uid)
  const conversationRef = ownerRef.collection('studentStudyAssistantConversations').doc(input.conversationId)
  const operationRef = ownerRef.collection('studentStudyAssistantDeleteOperations').doc(input.requestId)
  const tombstoneRef = db.collection('studentStudyAssistantDeletionTombstones').doc(actor.uid).collection('studentStudyAssistantConversations').doc(input.conversationId)
  const userRef = db.collection('users').doc(actor.uid)
  const auditRef = db.collection('studentStudyAssistantAuditEvents').doc()
  const fingerprint = digest([input.conversationId])

  const deletion = await db.runTransaction(async (transaction) => {
    const [user, conversation, operation, tombstone] = await Promise.all([
      transaction.get(userRef), transaction.get(conversationRef), transaction.get(operationRef), transaction.get(tombstoneRef),
    ])
    assertCurrentStudent(user, actor)
    const saved = operation.data()
    if (operation.exists) {
      if (saved?.ownerId !== actor.uid || saved.fingerprint !== fingerprint) {
        throw new HttpsError('invalid-argument', 'This request ID was used for another deletion.', { reason: 'REQUEST_ID_REUSED' })
      }
      return {
        output: callableSchemas.deleteStudentStudyAssistantConversation.output.parse(saved.output),
        shouldPurge: conversation.exists,
      }
    }
    if (!conversation.exists && !tombstone.exists) return denyConversation()
    if (tombstone.exists && (!conversation.exists || conversation.data()?.deletedAt instanceof Timestamp)) {
      return {
        output: callableSchemas.deleteStudentStudyAssistantConversation.output.parse({
          kind: 'already_deleted',
          conversationId: input.conversationId,
        }),
        shouldPurge: conversation.exists,
      }
    }
    if (conversation.exists) {
      const data = conversation.data()
      if (data?.ownerId !== actor.uid) return denyConversation()
      transaction.set(conversationRef, {
        ...data,
        deletedAt: now,
        expiresAt: now,
        title: '',
        preview: '',
        contentDeletedAt: null,
      })
    }
    const result = callableSchemas.deleteStudentStudyAssistantConversation.output.parse({
      kind: tombstone.exists ? 'already_deleted' : 'deleted',
      conversationId: input.conversationId,
    })
    if (!tombstone.exists) transaction.create(tombstoneRef, { ownerId: actor.uid, conversationId: input.conversationId, deletedAt: now })
    transaction.create(operationRef, {
      ownerId: actor.uid,
      fingerprint,
      output: result,
      createdAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + auditRetentionMs),
    })
    transaction.create(auditRef, auditRecord('CONVERSATION_DELETED', actor, now, { conversationId: input.conversationId }))
    return { output: result, shouldPurge: true }
  })

  if (deletion.shouldPurge) {
    try {
      await purgeStudentStudyAssistantConversationContent(ownerRef, conversationRef, input.conversationId, db, dependencies.now())
    } catch {
      throw new HttpsError('unavailable', 'The conversation is hidden, but content cleanup is still pending. Retry shortly.', { reason: 'DELETION_CLEANUP_PENDING' })
    }
  }
  return callableSchemas.deleteStudentStudyAssistantConversation.output.parse(deletion.output)
}

async function purgeStudentStudyAssistantConversationContent(
  ownerRef: DocumentReference,
  conversationRef: DocumentReference,
  conversationId: string,
  db: Firestore,
  completedAt: Timestamp,
): Promise<void> {
  await db.recursiveDelete(conversationRef.collection('studentStudyAssistantMessages'))
  while (true) {
    const receipts = await ownerRef.collection('studentStudyAssistantSendOperations')
      .where('conversationId', '==', conversationId).limit(200).get()
    if (receipts.empty) break
    const batch = db.batch()
    for (const receipt of receipts.docs) batch.delete(receipt.ref)
    await batch.commit()
    if (receipts.size < 200) break
  }
  // update() intentionally fails if the document was removed concurrently. It
  // must never recreate a tombstoned conversation shell during cleanup.
  await conversationRef.update({ title: '', preview: '', contentDeletedAt: completedAt })
}

/**
 * Scheduler/operations seam for the 24-hour physical cleanup target. It is not
 * exported as a deployed scheduled Function until deployment cadence and IAM
 * are approved; callers can safely invoke it in bounded batches.
 */
export async function cleanupExpiredStudentStudyAssistantConversations(
  db: Firestore,
  now = Timestamp.now(),
  limit = 100,
): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(limit, 200))
  const expired = await db.collectionGroup(studentStudyAssistantExpiryCleanupPolicy.collectionGroup)
    .where('contentDeletedAt', '==', null)
    .where(studentStudyAssistantExpiryCleanupPolicy.field, '<=', now)
    .limit(boundedLimit)
    .get()
  let cleaned = 0
  for (const conversation of expired.docs) {
    const ownerRef = conversation.ref.parent.parent
    const ownerId = ownerRef?.id
    if (!ownerRef || !ownerId || conversation.data().ownerId !== ownerId) continue
    const tombstoneRef = db.collection('studentStudyAssistantDeletionTombstones').doc(ownerId)
      .collection('studentStudyAssistantConversations').doc(conversation.id)
    const markedForCleanup = await db.runTransaction(async (transaction) => {
      const [current, tombstone] = await Promise.all([
        transaction.get(conversation.ref), transaction.get(tombstoneRef),
      ])
      const data = current.data()
      if (!current.exists || data?.ownerId !== ownerId || !(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() > now.toMillis()) return false
      if (!tombstone.exists) transaction.create(tombstoneRef, { ownerId, conversationId: conversation.id, deletedAt: now, reason: 'EXPIRED' })
      transaction.set(conversation.ref, {
        ...data,
        deletedAt: data.deletedAt instanceof Timestamp ? data.deletedAt : now,
        title: '',
        preview: '',
      })
      return true
    })
    if (!markedForCleanup) continue
    await purgeStudentStudyAssistantConversationContent(ownerRef, conversation.ref, conversation.id, db, now)
    cleaned += 1
  }
  return cleaned
}

/** Bounded maintenance seam for metadata-only audit records past 30 days. */
export async function cleanupExpiredStudentStudyAssistantAuditEvents(
  db: Firestore,
  now = Timestamp.now(),
  limit = 200,
): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(limit, 500))
  const expired = await db.collection(studentStudyAssistantAuditCleanupPolicy.collection)
    .where(studentStudyAssistantAuditCleanupPolicy.field, '<=', now)
    .limit(boundedLimit)
    .get()
  if (expired.empty) return 0
  const batch = db.batch()
  for (const event of expired.docs) batch.delete(event.ref)
  await batch.commit()
  return expired.size
}

/** Bounded maintenance seam for expired delete-idempotency receipts. */
export async function cleanupExpiredStudentStudyAssistantDeleteOperations(
  db: Firestore,
  now = Timestamp.now(),
  limit = 200,
): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(limit, 500))
  const expired = await db.collectionGroup(studentStudyAssistantDeleteOperationCleanupPolicy.collectionGroup)
    .where(studentStudyAssistantDeleteOperationCleanupPolicy.field, '<=', now)
    .limit(boundedLimit)
    .get()
  const deletable = expired.docs.filter((operation) => {
    const value = operation.data().expiresAt
    return value instanceof Timestamp && value.toMillis() <= now.toMillis()
  })
  if (deletable.length === 0) return 0
  const batch = db.batch()
  for (const operation of deletable) batch.delete(operation.ref)
  await batch.commit()
  return deletable.length
}
