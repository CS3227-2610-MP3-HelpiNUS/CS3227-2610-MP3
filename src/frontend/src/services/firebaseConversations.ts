import { collection, doc, documentId, getDocFromServer, getDocs, limit, onSnapshot, orderBy, query, startAfter, Timestamp, where, type DocumentData, type DocumentSnapshot } from 'firebase/firestore'
import { f01HelpRequestSchema, f02ConversationSchema, f02SavedMessageSchema, type F01HelpRequest, type F02SavedMessage } from '@helpinus/shared'
import { firebase } from './firebase'
import type { ChatCursor, ChatRow, HelpiNUSServices } from './contracts'

function client() {
  if (!firebase) throw new Error('Firebase is not configured.')
  return firebase.firestore
}
const stamp = (value: unknown): string => {
  if (!(value instanceof Timestamp)) throw new Error('Invalid stored timestamp.')
  return value.toDate().toISOString()
}
const cursorFor = (snapshot: DocumentSnapshot<DocumentData>, field: string): ChatCursor => {
  const value = snapshot.data()?.[field]
  if (!(value instanceof Timestamp)) throw new Error('Invalid page cursor.')
  return { seconds: value.seconds, nanoseconds: value.nanoseconds, id: snapshot.id }
}
const timestampFor = (cursor: ChatCursor) => new Timestamp(cursor.seconds, cursor.nanoseconds)

function parseRequest(snapshot: DocumentSnapshot<DocumentData>): F01HelpRequest {
  const data = snapshot.data()
  if (!data) throw new Error('Request is unavailable.')
  return f01HelpRequestSchema.parse({ ...data, id: snapshot.id, createdAt: stamp(data.createdAt), updatedAt: stamp(data.updatedAt) })
}

function validPair(request: F01HelpRequest, parent: DocumentSnapshot<DocumentData>, conversation: DocumentSnapshot<DocumentData>): boolean {
  const data = conversation.data()
  if (!conversation.exists() || !data || request.status !== 'ACCEPTED' ||
      !(data.createdAt instanceof Timestamp) || !(data.updatedAt instanceof Timestamp)) return false
  const parsed = f02ConversationSchema.safeParse({ ...data, createdAt: stamp(data.createdAt), updatedAt: stamp(data.updatedAt) })
  const acceptedAt = parent.data()?.updatedAt
  return parsed.success && conversation.id === request.id && parsed.data.id === request.id &&
    parsed.data.helpRequestId === request.id && parsed.data.studentId === request.studentId &&
    parsed.data.mentorId === request.mentorId && parsed.data.participantIds[0] === request.studentId &&
    parsed.data.participantIds[1] === request.mentorId && acceptedAt instanceof Timestamp &&
    data.createdAt.isEqual(acceptedAt) && data.updatedAt.isEqual(acceptedAt)
}

function parseMessage(snapshot: DocumentSnapshot<DocumentData>, requestId: string): F02SavedMessage {
  const data = snapshot.data()
  if (!data || !(data.createdAt instanceof Timestamp) || !(data.readAt == null || data.readAt instanceof Timestamp)) throw new Error('Message data needs support review.')
  const parsed = f02SavedMessageSchema.parse({
    id: snapshot.id, conversationId: requestId, senderId: data.senderId,
    body: data.body, createdAt: stamp(data.createdAt), readAt: data.readAt ? stamp(data.readAt) : null,
  })
  if (parsed.body !== data.body || Object.keys(data).some((key) => !['senderId', 'body', 'createdAt', 'readAt'].includes(key))) throw new Error('Message data needs support review.')
  return parsed
}

async function rowFor(snapshot: DocumentSnapshot<DocumentData>): Promise<ChatRow> {
  const request = parseRequest(snapshot)
  if (request.status !== 'ACCEPTED') throw new Error('Conversation list changed.')
  try {
    const conversation = await getDocFromServer(doc(client(), 'conversations', request.id))
    if (validPair(request, snapshot, conversation)) return { kind: 'ready', request }
  } catch {
    // Recheck the owner-readable parent before presenting a generic anomaly.
    const current = await getDocFromServer(doc(client(), 'helpRequests', request.id))
    if (!current.exists() || parseRequest(current).status !== 'ACCEPTED') throw new Error('Conversation access changed.')
  }
  return { kind: 'support_needed', requestId: request.id, acceptedAt: request.updatedAt }
}

export const firebaseConversations: HelpiNUSServices['conversations'] = {
  subscribeList(uid, role, cursor, onData, onError) {
    const owner = role === 'STUDENT' ? 'studentId' : 'mentorId'
    const clauses = [where(owner, '==', uid), where('status', '==', 'ACCEPTED'), orderBy('updatedAt', 'desc'), orderBy(documentId(), 'desc')]
    const page = cursor
      ? query(collection(client(), 'helpRequests'), ...clauses, startAfter(timestampFor(cursor), cursor.id), limit(20))
      : query(collection(client(), 'helpRequests'), ...clauses, limit(20))
    let active = true
    let revision = 0
    const unsubscribe = onSnapshot(page, (snapshot) => {
      const current = ++revision
      const next = snapshot.docs.length === 20 ? cursorFor(snapshot.docs[19]!, 'updatedAt') : null
      const probe = next ? getDocs(query(collection(client(), 'helpRequests'), ...clauses, startAfter(timestampFor(next), next.id), limit(1))).then((page) => page.empty ? null : next) : Promise.resolve(null)
      void Promise.all([Promise.all(snapshot.docs.map(rowFor)), probe]).then(([rows, cursor]) => {
        if (active && current === revision) onData(rows, cursor)
      }).catch((error: unknown) => { if (active && current === revision) onError(error) })
    }, onError)
    return () => { active = false; revision++; unsubscribe() }
  },
  subscribeDetail(requestId, onData, onError) {
    let active = true
    let revision = 0
    const unsubscribe = onSnapshot(doc(client(), 'helpRequests', requestId), (snapshot) => {
      const current = ++revision
      void (async () => {
        if (!snapshot.exists()) { onData(null); return }
        const request = parseRequest(snapshot)
        if (request.status !== 'ACCEPTED') { onData(null); return }
        const row = await rowFor(snapshot)
        if (active && current === revision) onData(row.kind === 'ready' ? { request } : null)
      })().catch((error: unknown) => { if (active && current === revision) onError(error) })
    }, onError)
    return () => { active = false; revision++; unsubscribe() }
  },
  subscribeMessages(requestId, cursor, onData, onError) {
    const clauses = [orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc')]
    const page = cursor
      ? query(collection(client(), 'conversations', requestId, 'messages'), ...clauses, startAfter(timestampFor(cursor), cursor.id), limit(20))
      : query(collection(client(), 'conversations', requestId, 'messages'), ...clauses, limit(20))
    let active = true
    let revision = 0
    const unsubscribe = onSnapshot(page, (snapshot) => {
      const current = ++revision
      try {
        const messages = snapshot.docs.map((item) => parseMessage(item, requestId))
        const next = snapshot.docs.length === 20 ? cursorFor(snapshot.docs[19]!, 'createdAt') : null
        const probe = next ? getDocs(query(collection(client(), 'conversations', requestId, 'messages'), ...clauses, startAfter(timestampFor(next), next.id), limit(1))).then((page) => page.empty ? null : next) : Promise.resolve(null)
        void probe.then((cursor) => { if (active && current === revision) onData(messages, cursor) }).catch((error: unknown) => { if (active && current === revision) onError(error) })
      } catch (error) { if (active && current === revision) onError(error) }
    }, onError)
    return () => { active = false; revision++; unsubscribe() }
  },
  async getMessageFromServer(requestId, messageId) {
    const snapshot = await getDocFromServer(doc(client(), 'conversations', requestId, 'messages', messageId))
    return snapshot.exists() ? parseMessage(snapshot, requestId) : null
  },
}
