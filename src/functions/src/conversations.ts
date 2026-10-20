import { getAuth } from 'firebase-admin/auth'
import { Timestamp, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import {
  f01HelpRequestSchema, f02ConversationSchema, f02SavedMessageSchema, userSchema,
  type AcknowledgeMessageInput, type F01HelpRequest, type F02SavedMessage, type SendMessageInput,
} from '@helpinus/shared'
import { requireAuthenticated, requireRole } from './auth.js'

type StoredRequest = Omit<F01HelpRequest, 'createdAt' | 'updatedAt'> & { createdAt: Timestamp; updatedAt: Timestamp }
const denied = (): never => { throw new HttpsError('permission-denied', 'Conversation access is unavailable.') }
const integrity = (): never => { throw new HttpsError('failed-precondition', 'Conversation data needs support review.', { reason: 'INTEGRITY_ERROR' }) }
const iso = (value: Timestamp) => value.toDate().toISOString()

export function assertMatchingAcceptedConversation(request: StoredRequest, snapshot: DocumentSnapshot): void {
  const data = snapshot.data()
  if (!data) return integrity()
  if (!snapshot.exists || request.status !== 'ACCEPTED' ||
      !(request.updatedAt instanceof Timestamp) || !(data.createdAt instanceof Timestamp) || !(data.updatedAt instanceof Timestamp)) integrity()
  const parsed = f02ConversationSchema.safeParse({ ...data, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt) })
  if (!parsed.success || snapshot.id !== request.id || parsed.data.id !== request.id ||
      parsed.data.helpRequestId !== request.id || parsed.data.studentId !== request.studentId ||
      parsed.data.mentorId !== request.mentorId || parsed.data.participantIds[0] !== request.studentId ||
      parsed.data.participantIds[1] !== request.mentorId ||
      !data.createdAt.isEqual(request.updatedAt) || !data.updatedAt.isEqual(request.updatedAt)) integrity()
}

export function provisionForAcceptedRequest(tx: Transaction, request: StoredRequest, existing: DocumentSnapshot): string {
  if (existing.exists || request.status !== 'ACCEPTED' || !(request.updatedAt instanceof Timestamp)) integrity()
  tx.create(existing.ref, {
    id: request.id, helpRequestId: request.id, studentId: request.studentId,
    mentorId: request.mentorId, participantIds: [request.studentId, request.mentorId],
    createdAt: request.updatedAt, updatedAt: request.updatedAt,
  })
  return request.id
}

async function currentActor(call: CallableRequest<unknown>, db: Firestore, requestId: string) {
  const { uid } = await requireAuthenticated(call)
  const parent = await db.collection('helpRequests').doc(requestId).get()
  const data = parent.data()
  if (!parent.exists || !data) return denied()
  if (data.studentId === data.mentorId) return denied()
  const role = data.studentId === uid ? 'STUDENT' : data.mentorId === uid ? 'MENTOR' : denied()
  const actor = await requireRole(call, role)
  let authUser
  try { authUser = await getAuth().getUser(actor.uid) } catch { return denied() }
  const synthetic = process.env.FUNCTIONS_EMULATOR === 'true' && actor.email.endsWith('@example.test')
  if (authUser.disabled || authUser.email !== actor.email || (!authUser.emailVerified && !synthetic)) denied()
  return { actor, userRef: db.collection(role === 'MENTOR' ? 'mentors' : 'users').doc(actor.uid) }
}

function assertActor(snapshot: DocumentSnapshot, actor: { uid: string; email: string; role: string }) {
  const data = snapshot.data()
  const parsed = userSchema.safeParse({ ...data, createdAt: data?.createdAt instanceof Timestamp ? iso(data.createdAt) : data?.createdAt instanceof Date ? data.createdAt.toISOString() : data?.createdAt })
  if (!parsed.success || parsed.data.id !== actor.uid || parsed.data.email !== actor.email ||
      parsed.data.role !== actor.role || parsed.data.status !== 'ACTIVE') denied()
}

function assertParent(snapshot: DocumentSnapshot, actor: { uid: string; role: string }): StoredRequest {
  const data = snapshot.data()
  if (!data) return denied()
  if (!snapshot.exists || !(data.createdAt instanceof Timestamp) || !(data.updatedAt instanceof Timestamp)) denied()
  const parsed = f01HelpRequestSchema.safeParse({ ...data, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt) })
  if (!parsed.success || parsed.data.id !== snapshot.id || parsed.data.status !== 'ACCEPTED' ||
      !((actor.role === 'STUDENT' && parsed.data.studentId === actor.uid) ||
        (actor.role === 'MENTOR' && parsed.data.mentorId === actor.uid))) denied()
  return data as StoredRequest
}

function parseMessage(snapshot: DocumentSnapshot, requestId: string): F02SavedMessage {
  const data = snapshot.data()
  if (!data) return integrity()
  if (!snapshot.exists || !(data.createdAt instanceof Timestamp) ||
      !(data.readAt == null || data.readAt instanceof Timestamp)) integrity()
  const parsed = f02SavedMessageSchema.safeParse({
    id: snapshot.id, conversationId: requestId, senderId: data.senderId, body: data.body,
    createdAt: iso(data.createdAt), readAt: data.readAt ? iso(data.readAt) : null,
  })
  if (!parsed.success) return integrity()
  if (parsed.data.body !== data.body ||
      Object.keys(data).some((key) => !['senderId', 'body', 'createdAt', 'readAt'].includes(key))) return integrity()
  return parsed.data
}

export async function sendMessageHandler(input: SendMessageInput, call: CallableRequest<unknown>, db: Firestore): Promise<{ message: F02SavedMessage }> {
  const { actor, userRef } = await currentActor(call, db, input.requestId)
  const requestRef = db.collection('helpRequests').doc(input.requestId)
  const conversationRef = db.collection('conversations').doc(input.requestId)
  const messageRef = conversationRef.collection('messages').doc(input.messageId)
  return db.runTransaction(async (tx) => {
    const [user, parent, conversation, message] = await Promise.all([tx.get(userRef), tx.get(requestRef), tx.get(conversationRef), tx.get(messageRef)])
    assertActor(user, actor)
    const stored = assertParent(parent, actor)
    assertMatchingAcceptedConversation(stored, conversation)
    if (message.exists) {
      const saved = parseMessage(message, input.requestId)
      if (saved.senderId !== actor.uid || saved.body !== input.body) throw new HttpsError('already-exists', 'Message ID was reused.', { reason: 'ID_REUSED' })
      return { message: saved }
    }
    const now = Timestamp.now()
    tx.create(messageRef, { senderId: actor.uid, body: input.body, createdAt: now, readAt: null })
    return { message: { id: input.messageId, conversationId: input.requestId, senderId: actor.uid, body: input.body, createdAt: iso(now), readAt: null } }
  })
}

export async function acknowledgeMessageHandler(input: AcknowledgeMessageInput, call: CallableRequest<unknown>, db: Firestore): Promise<{ readAt: string }> {
  const { actor, userRef } = await currentActor(call, db, input.requestId)
  const requestRef = db.collection('helpRequests').doc(input.requestId)
  const conversationRef = db.collection('conversations').doc(input.requestId)
  const messageRef = conversationRef.collection('messages').doc(input.messageId)
  return db.runTransaction(async (tx) => {
    const [user, parent, conversation, message] = await Promise.all([tx.get(userRef), tx.get(requestRef), tx.get(conversationRef), tx.get(messageRef)])
    assertActor(user, actor)
    const stored = assertParent(parent, actor)
    assertMatchingAcceptedConversation(stored, conversation)
    if (!message.exists) denied()
    const saved = parseMessage(message, input.requestId)
    if (saved.senderId === actor.uid || ![stored.studentId, stored.mentorId].includes(saved.senderId)) denied()
    if (saved.readAt) return { readAt: saved.readAt }
    const now = Timestamp.now()
    tx.update(messageRef, { readAt: now })
    return { readAt: iso(now) }
  })
}
