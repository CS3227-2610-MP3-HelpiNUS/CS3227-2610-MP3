import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentStudyAssistantDependencies } from './studentStudyAssistant.js'
import type { StudentStudyAssistantProvider } from './studentStudyAssistantProvider.js'

const actor = vi.hoisted(() => ({
  uid: 'student-one', email: 'student@example.test', displayName: 'Student One',
  role: 'STUDENT' as const, status: 'ACTIVE' as const,
}))
vi.mock('./auth.js', () => ({ requireRole: vi.fn(async () => actor) }))

import {
  cleanupExpiredStudentStudyAssistantConversations,
  deleteStudentStudyAssistantConversationHandler,
  readStudentStudyAssistantConversationHandler,
  studentStudyAssistHandler,
} from './studentStudyAssistant.js'

interface StoredEntry { [key: string]: unknown }

class MemorySnapshot {
  constructor(readonly ref: MemoryDocumentRef, private readonly value: StoredEntry | undefined) {}
  get exists() { return this.value !== undefined }
  get id() { return this.ref.id }
  data() { return this.value }
}

class MemoryQuery {
  protected filters: Array<[string, string, unknown]> = []
  protected orders: Array<[string, 'asc' | 'desc']> = []
  protected cursor: unknown[] | null = null
  protected maximum = Number.MAX_SAFE_INTEGER

  constructor(protected readonly db: MemoryFirestore, readonly path: string) {}
  protected copy() {
    const next = new MemoryQuery(this.db, this.path)
    next.filters = [...this.filters]
    next.orders = [...this.orders]
    next.cursor = this.cursor ? [...this.cursor] : null
    next.maximum = this.maximum
    return next
  }
  where(field: string, operator: string, value: unknown) {
    const next = this.copy()
    next.filters.push([field, operator, value])
    return next
  }
  orderBy(field: unknown, direction: 'asc' | 'desc') {
    const next = this.copy()
    next.orders.push([typeof field === 'string' ? field : '__name__', direction])
    return next
  }
  startAfter(...values: unknown[]) {
    const next = this.copy()
    next.cursor = values
    return next
  }
  limit(maximum: number) {
    const next = this.copy()
    next.maximum = maximum
    return next
  }
  async get() {
    const prefix = `${this.path}/`
    const comparable = (value: unknown) => value instanceof Timestamp ? value.toMillis() : value
    let docs = [...this.db.store.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .filter(([, value]) => this.filters.every(([field, operator, expected]) => {
        const actualValue = comparable(value[field])
        const expectedValue = comparable(expected)
        if (operator === '==') return actualValue === expectedValue
        if (operator === '>') return (actualValue as number) > (expectedValue as number)
        if (operator === '<=') return (actualValue as number) <= (expectedValue as number)
        return false
      }))
    docs.sort((left, right) => {
      for (const [field, direction] of this.orders) {
        const leftValue = comparable(field === '__name__' ? left[0].split('/').at(-1) : left[1][field])
        const rightValue = comparable(field === '__name__' ? right[0].split('/').at(-1) : right[1][field])
        if (leftValue === rightValue) continue
        const comparison = (leftValue as number | string) < (rightValue as number | string) ? -1 : 1
        return direction === 'asc' ? comparison : -comparison
      }
      return 0
    })
    if (this.cursor) {
      const cursorIndex = docs.findIndex(([path, value]) => this.orders.every(([field], index) =>
        comparable(field === '__name__' ? path.split('/').at(-1) : value[field]) === comparable(this.cursor?.[index])))
      docs = cursorIndex >= 0 ? docs.slice(cursorIndex + 1) : []
    }
    const snapshots = docs.slice(0, this.maximum)
      .map(([path, value]) => new MemorySnapshot(new MemoryDocumentRef(this.db, path), value))
    return { docs: snapshots, empty: snapshots.length === 0, size: snapshots.length }
  }
}

class MemoryCollectionRef extends MemoryQuery {
  get parent() {
    const parts = this.path.split('/')
    return parts.length > 1 ? new MemoryDocumentRef(this.db, parts.slice(0, -1).join('/')) : null
  }
  doc(id?: string) {
    return new MemoryDocumentRef(this.db, `${this.path}/${id ?? `generated-${++this.db.generated}`}`)
  }
}

class MemoryDocumentRef {
  constructor(readonly db: MemoryFirestore, readonly path: string) {}
  get id() { return this.path.split('/').at(-1)! }
  get parent() { return new MemoryCollectionRef(this.db, this.path.split('/').slice(0, -1).join('/')) }
  collection(name: string) { return new MemoryCollectionRef(this.db, `${this.path}/${name}`) }
  async set(value: StoredEntry, options?: { merge?: boolean }) {
    const previous = this.db.store.get(this.path)
    this.db.store.set(this.path, options?.merge ? { ...previous, ...value } : value)
  }
}

class MemoryTransaction {
  constructor(private readonly db: MemoryFirestore) {}
  async get(target: MemoryDocumentRef | MemoryQuery) {
    return target instanceof MemoryQuery ? target.get() : new MemorySnapshot(target, this.db.store.get(target.path))
  }
  set(ref: MemoryDocumentRef, value: StoredEntry) { this.db.store.set(ref.path, value) }
  create(ref: MemoryDocumentRef, value: StoredEntry) {
    if (this.db.store.has(ref.path)) throw new Error(`already exists: ${ref.path}`)
    this.db.store.set(ref.path, value)
  }
  delete(ref: MemoryDocumentRef) { this.db.store.delete(ref.path) }
}

class MemoryFirestore {
  readonly store = new Map<string, StoredEntry>()
  generated = 0
  collection(name: string) { return new MemoryCollectionRef(this, name) }
  collectionGroup(name: string) {
    const query: Record<string, unknown> = {}
    query.where = () => query
    query.limit = () => query
    query.get = async () => {
      const docs = [...this.store.entries()]
        .filter(([path]) => path.split('/').at(-2) === name)
        .map(([path, value]) => new MemorySnapshot(new MemoryDocumentRef(this, path), value))
      return { docs, empty: docs.length === 0, size: docs.length }
    }
    return query
  }
  async runTransaction<Result>(work: (transaction: MemoryTransaction) => Promise<Result>) {
    return work(new MemoryTransaction(this))
  }
  async recursiveDelete(ref: MemoryCollectionRef) {
    const prefix = `${ref.path}/`
    for (const key of [...this.store.keys()]) if (key.startsWith(prefix)) this.store.delete(key)
  }
  batch() {
    const deletes: MemoryDocumentRef[] = []
    return {
      delete: (ref: MemoryDocumentRef) => { deletes.push(ref) },
      commit: async () => { for (const ref of deletes) this.store.delete(ref.path) },
    }
  }
}

const request = {} as CallableRequest<unknown>
const fixedNow = Timestamp.fromDate(new Date('2026-10-21T08:00:00.000Z'))

function database() {
  const db = new MemoryFirestore()
  db.store.set('users/student-one', {
    id: actor.uid, email: actor.email, displayName: actor.displayName, role: 'STUDENT', status: 'ACTIVE',
  })
  return db
}

function dependencies(overrides: Partial<StudentStudyAssistantDependencies> = {}): StudentStudyAssistantDependencies {
  return {
    provider: { answer: vi.fn(async () => ({ kind: 'grounded' as const, content: 'BFS uses a queue.', citationChunkIds: ['chunk-1'] })) },
    retriever: { retrieve: vi.fn(async () => ({
      corpusGeneration: 'synthetic-v1',
      chunks: [{
        chunkId: 'chunk-1', sourceId: 'source-1', title: 'Synthetic Notes',
        canonicalUrl: 'https://example.test/source', version: 'v1', section: 'BFS',
        content: 'BFS uses a queue.', contentHash: 'fixture-hash', approvedBy: 'fixture',
        approvedAt: '2026-10-21T00:00:00.000Z', accessClassification: 'ALL_ACTIVE_STUDENTS' as const,
        reviewState: 'APPROVED' as const, keywords: ['bfs'],
      }],
    })) },
    enabled: true,
    requestsPerWindow: 20,
    providerTimeoutMs: 1000,
    now: () => fixedNow,
    newLeaseToken: () => 'lease-one',
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('Student Study Assistant send persistence', () => {
  it('persists a grounded first turn, safe citations, and a metadata-only audit', async () => {
    const db = database()
    const provider = { answer: vi.fn(async () => ({ kind: 'grounded' as const, content: 'BFS uses a queue.', citationChunkIds: ['chunk-1'] })) }
    const result = await studentStudyAssistHandler({
      requestId: '11111111-1111-4111-8111-111111111111', conversationId: null, userMessage: 'Explain BFS.',
    }, request, db as unknown as Firestore, dependencies({ provider }))

    expect(result.kind).toBe('grounded')
    expect(result.assistantMessage).toMatchObject({ grounding: 'GROUNDED', citations: [{
      sourceId: 'source-1', title: 'Synthetic Notes', canonicalUrl: 'https://example.test/source', version: 'v1', section: 'BFS',
    }] })
    expect(result.replayed).toBe(false)
    expect([...db.store.keys()].filter((path) => path.includes('/studentStudyAssistantMessages/'))).toHaveLength(2)
    const audit = [...db.store.entries()].find(([path]) => path.startsWith('studentStudyAssistantAuditEvents/'))?.[1]
    expect(audit).toMatchObject({ featureId: 'S2-D1-F03', feature: 'STUDENT_STUDY_ASSISTANT', event: 'MESSAGE_COMPLETED' })
    expect(JSON.stringify(audit)).not.toContain('Explain BFS')
    expect(JSON.stringify(audit)).not.toContain('BFS uses a queue')
  })

  it('replays a completed request without calling the provider or adding messages', async () => {
    const db = database()
    const provider = { answer: vi.fn(async () => ({ kind: 'grounded' as const, content: 'BFS uses a queue.', citationChunkIds: ['chunk-1'] })) }
    const deps = dependencies({ provider })
    const input = { requestId: '22222222-2222-4222-8222-222222222222', conversationId: null, userMessage: 'Explain BFS.' }
    const first = await studentStudyAssistHandler(input, request, db as unknown as Firestore, deps)
    const replay = await studentStudyAssistHandler(input, request, db as unknown as Firestore, deps)
    expect(replay).toEqual({ ...first, replayed: true })
    expect(provider.answer).toHaveBeenCalledOnce()
    expect([...db.store.keys()].filter((path) => path.includes('/studentStudyAssistantMessages/'))).toHaveLength(2)
  })

  it('loads the newest page in chronological display order with grounded citations preserved', async () => {
    const db = database()
    const deps = dependencies()
    const sent = await studentStudyAssistHandler({
      requestId: '88888888-8888-4888-8888-888888888888', conversationId: null, userMessage: 'Explain BFS.',
    }, request, db as unknown as Firestore, deps)
    const loaded = await readStudentStudyAssistantConversationHandler({
      conversationId: sent.conversation.id,
      limit: 50,
    }, request, db as unknown as Firestore, deps)
    expect(loaded.messages.map(({ role }) => role)).toEqual(['STUDENT', 'ASSISTANT'])
    expect(loaded.messages[1]).toMatchObject({
      role: 'ASSISTANT', grounding: 'GROUNDED', citations: [{ sourceId: 'source-1' }],
    })
    expect(loaded.nextCursor).toBeNull()
  })

  it('returns insufficient context without invoking the provider', async () => {
    const db = database()
    const provider = { answer: vi.fn() } as unknown as StudentStudyAssistantProvider
    const result = await studentStudyAssistHandler({
      requestId: '33333333-3333-4333-8333-333333333333', conversationId: null, userMessage: 'Unsupported topic.',
    }, request, db as unknown as Firestore, dependencies({
      provider,
      retriever: { retrieve: vi.fn(async () => ({ chunks: [], corpusGeneration: 'disabled' })) },
    }))
    expect(result.kind).toBe('insufficient_context')
    expect(result.assistantMessage).toMatchObject({ grounding: 'INSUFFICIENT_CONTEXT', citations: [] })
    expect(provider.answer).not.toHaveBeenCalled()
  })

  it('rejects a provider citation that was not selected by trusted retrieval', async () => {
    const db = database()
    const provider = {
      answer: vi.fn(async () => ({
        kind: 'grounded' as const,
        content: 'Untrusted answer.',
        citationChunkIds: ['invented-chunk'],
      })),
    }
    await expect(studentStudyAssistHandler({
      requestId: '66666666-6666-4666-8666-666666666666', conversationId: null, userMessage: 'Explain BFS.',
    }, request, db as unknown as Firestore, dependencies({ provider }))).rejects.toMatchObject({
      code: 'unavailable',
      details: { reason: 'INVALID_PROVENANCE' },
    })
    expect([...db.store.keys()].some((path) => path.includes('/studentStudyAssistantMessages/'))).toBe(false)
  })

  it('maps a provider timeout safely and releases the idempotency lease for retry', async () => {
    const db = database()
    const provider = { answer: vi.fn(() => new Promise<never>(() => undefined)) }
    const requestId = '77777777-7777-4777-8777-777777777777'
    await expect(studentStudyAssistHandler({
      requestId, conversationId: null, userMessage: 'Explain BFS.',
    }, request, db as unknown as Firestore, dependencies({ provider, providerTimeoutMs: 5 }))).rejects.toMatchObject({
      code: 'deadline-exceeded',
      details: { reason: 'PROVIDER_TIMEOUT' },
    })
    expect([...db.store.keys()].some((path) => path.endsWith(`/studentStudyAssistantSendOperations/${requestId}`))).toBe(false)
  })

  it('rejects invisible control smuggling before retrieval, provider use, or persistence', async () => {
    const db = database()
    const provider = { answer: vi.fn() } as unknown as StudentStudyAssistantProvider
    const retriever = { retrieve: vi.fn() }
    await expect(studentStudyAssistHandler({
      requestId: '99999999-9999-4999-8999-999999999999',
      conversationId: null,
      userMessage: 'Explain\u200bBFS.',
    }, request, db as unknown as Firestore, dependencies({ provider, retriever }))).rejects.toMatchObject({
      code: 'invalid-argument',
      details: { reason: 'UNSAFE_TEXT_CONTROL' },
    })
    expect(retriever.retrieve).not.toHaveBeenCalled()
    expect(provider.answer).not.toHaveBeenCalled()
    expect([...db.store.keys()].some((path) => path.includes('studentStudyAssistantSendOperations'))).toBe(false)
  })

  it('removes content and receipts on deletion so an old send cannot be replayed', async () => {
    const db = database()
    const deps = dependencies()
    const sendInput = { requestId: '44444444-4444-4444-8444-444444444444', conversationId: null, userMessage: 'Explain BFS.' }
    const sent = await studentStudyAssistHandler(sendInput, request, db as unknown as Firestore, deps)
    await expect(deleteStudentStudyAssistantConversationHandler({
      requestId: '55555555-5555-4555-8555-555555555555', conversationId: sent.conversation.id,
    }, request, db as unknown as Firestore, deps)).resolves.toEqual({ kind: 'deleted', conversationId: sent.conversation.id })
    expect([...db.store.keys()].some((path) => path.includes('/studentStudyAssistantMessages/'))).toBe(false)
    expect([...db.store.keys()].some((path) => path.includes('/studentStudyAssistantSendOperations/'))).toBe(false)
    expect(db.store.get(`studentStudyAssistantUsers/${actor.uid}/studentStudyAssistantConversations/${sent.conversation.id}`))
      .toMatchObject({ title: '', preview: '', contentDeletedAt: fixedNow })
    await expect(studentStudyAssistHandler(sendInput, request, db as unknown as Firestore, deps)).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('physically cleans expired message content and receipts in a bounded maintenance batch', async () => {
    const db = database()
    const conversationId = 'expired-conversation'
    const conversationPath = `studentStudyAssistantUsers/${actor.uid}/studentStudyAssistantConversations/${conversationId}`
    db.store.set(conversationPath, {
      ownerId: actor.uid, title: 'Expired', preview: 'private preview', lastActivityAt: Timestamp.fromMillis(1),
      expiresAt: Timestamp.fromMillis(2), nextSequence: 2, deletedAt: null, contentDeletedAt: null,
    })
    db.store.set(`${conversationPath}/studentStudyAssistantMessages/message-one`, {
      role: 'STUDENT', content: 'private content', sequence: 0, createdAt: Timestamp.fromMillis(1),
    })
    db.store.set(`studentStudyAssistantUsers/${actor.uid}/studentStudyAssistantSendOperations/operation-one`, {
      conversationId, output: { assistantMessage: { content: 'private output' } },
    })
    await expect(cleanupExpiredStudentStudyAssistantConversations(
      db as unknown as Firestore, fixedNow, 10,
    )).resolves.toBe(1)
    expect([...db.store.keys()].some((path) => path.includes('/studentStudyAssistantMessages/'))).toBe(false)
    expect([...db.store.keys()].some((path) => path.includes('/studentStudyAssistantSendOperations/'))).toBe(false)
    expect(db.store.get(conversationPath)).toMatchObject({ title: '', preview: '', deletedAt: fixedNow, contentDeletedAt: fixedNow })
    expect(db.store.get(`studentStudyAssistantDeletionTombstones/${actor.uid}/studentStudyAssistantConversations/${conversationId}`))
      .toMatchObject({ ownerId: actor.uid, reason: 'EXPIRED' })
  })
})
