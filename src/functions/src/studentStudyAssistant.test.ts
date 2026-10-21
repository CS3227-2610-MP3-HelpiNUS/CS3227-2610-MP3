import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentStudyAssistantDependencies } from './studentStudyAssistant.js'
import type {
  StudentStudyAssistantProvider,
  StudentStudyAssistantProviderInput,
} from './studentStudyAssistantProvider.js'

const actor = vi.hoisted(() => ({
  uid: 'student-one', email: 'student@example.test', displayName: 'Student One',
  role: 'STUDENT' as const, status: 'ACTIVE' as const,
}))
vi.mock('./auth.js', () => ({ requireRole: vi.fn(async () => actor) }))

import {
  cleanupExpiredStudentStudyAssistantAuditEvents,
  cleanupExpiredStudentStudyAssistantConversations,
  cleanupExpiredStudentStudyAssistantDeleteOperations,
  createStudentStudyAssistantDependencies,
  deleteStudentStudyAssistantConversationHandler,
  listStudentStudyAssistantConversationsHandler,
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
  async update(value: StoredEntry) {
    const previous = this.db.store.get(this.path)
    if (!previous) throw new Error(`missing document: ${this.path}`)
    this.db.store.set(this.path, { ...previous, ...value })
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
    replaysPerWindow: 60,
    providerTimeoutMs: 1000,
    now: () => fixedNow,
    newLeaseToken: () => 'lease-one',
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('Student Study Assistant runtime policy', () => {
  it('enables synthetic emulators by default but keeps production fail-closed', () => {
    const previous = process.env.STUDENT_STUDY_ASSISTANT_ENABLED
    delete process.env.STUDENT_STUDY_ASSISTANT_ENABLED
    try {
      expect(createStudentStudyAssistantDependencies(true).enabled).toBe(true)
      expect(createStudentStudyAssistantDependencies(false).enabled).toBe(false)
      process.env.STUDENT_STUDY_ASSISTANT_ENABLED = 'true'
      expect(createStudentStudyAssistantDependencies(false).enabled).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.STUDENT_STUDY_ASSISTANT_ENABLED
      else process.env.STUDENT_STUDY_ASSISTANT_ENABLED = previous
    }
  })
})

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

  it('rate-limits completed-result replay egress without duplicating messages', async () => {
    const db = database()
    const provider = { answer: vi.fn(async () => ({ kind: 'grounded' as const, content: 'BFS uses a queue.', citationChunkIds: ['chunk-1'] })) }
    const deps = dependencies({ provider, replaysPerWindow: 1 })
    const input = { requestId: '12121212-1212-4212-8212-121212121212', conversationId: null, userMessage: 'Explain BFS.' }
    await studentStudyAssistHandler(input, request, db as unknown as Firestore, deps)
    await expect(studentStudyAssistHandler(input, request, db as unknown as Firestore, deps)).resolves.toMatchObject({ replayed: true })
    await expect(studentStudyAssistHandler(input, request, db as unknown as Firestore, deps)).rejects.toMatchObject({
      code: 'resource-exhausted', details: { reason: 'REPLAY_RATE_LIMITED' },
    })
    expect(provider.answer).toHaveBeenCalledOnce()
    expect([...db.store.keys()].filter((path) => path.includes('/studentStudyAssistantMessages/'))).toHaveLength(2)
  })

  it('rejects changed content under a completed request ID', async () => {
    const db = database()
    const deps = dependencies()
    const requestId = '18181818-1818-4818-8818-181818181818'
    await studentStudyAssistHandler({ requestId, conversationId: null, userMessage: 'Explain BFS.' }, request, db as unknown as Firestore, deps)
    await expect(studentStudyAssistHandler({
      requestId, conversationId: null, userMessage: 'Different text.',
    }, request, db as unknown as Firestore, deps)).rejects.toMatchObject({
      code: 'invalid-argument', details: { reason: 'REQUEST_ID_REUSED' },
    })
  })

  it('rejects a concurrent duplicate while one provider call holds the lease', async () => {
    const db = database()
    let releaseProvider!: () => void
    const waiting = new Promise<void>((resolve) => { releaseProvider = resolve })
    const provider = { answer: vi.fn(async () => {
      await waiting
      return { kind: 'grounded' as const, content: 'BFS uses a queue.', citationChunkIds: ['chunk-1'] }
    }) }
    const deps = dependencies({ provider })
    const input = { requestId: '19191919-1919-4919-8919-191919191919', conversationId: null, userMessage: 'Explain BFS.' }
    const first = studentStudyAssistHandler(input, request, db as unknown as Firestore, deps)
    await vi.waitFor(() => expect(provider.answer).toHaveBeenCalledOnce())
    await expect(studentStudyAssistHandler(input, request, db as unknown as Firestore, deps)).rejects.toMatchObject({
      code: 'aborted', details: { reason: 'REQUEST_IN_PROGRESS' },
    })
    releaseProvider()
    await expect(first).resolves.toMatchObject({ kind: 'grounded' })
  })

  it('enforces the new-send request rate without calling the provider again', async () => {
    const db = database()
    const provider = { answer: vi.fn(async () => ({ kind: 'grounded' as const, content: 'BFS uses a queue.', citationChunkIds: ['chunk-1'] })) }
    const deps = dependencies({ provider, requestsPerWindow: 1 })
    await studentStudyAssistHandler({
      requestId: '20202020-2020-4020-8020-202020202020', conversationId: null, userMessage: 'Explain BFS.',
    }, request, db as unknown as Firestore, deps)
    await expect(studentStudyAssistHandler({
      requestId: '21212121-2121-4121-8121-212121212121', conversationId: null, userMessage: 'Explain queues.',
    }, request, db as unknown as Firestore, deps)).rejects.toMatchObject({
      code: 'resource-exhausted', details: { reason: 'RATE_LIMITED' },
    })
    expect(provider.answer).toHaveBeenCalledOnce()
  })

  it('rolls expiry forward and excludes expired content from list, read, and replay', async () => {
    const db = database()
    const firstDeps = dependencies()
    const firstInput = { requestId: '23232323-2323-4323-8323-232323232323', conversationId: null, userMessage: 'Explain BFS.' }
    const first = await studentStudyAssistHandler(firstInput, request, db as unknown as Firestore, firstDeps)
    const later = Timestamp.fromMillis(fixedNow.toMillis() + 24 * 60 * 60 * 1000)
    const continued = await studentStudyAssistHandler({
      requestId: '24242424-2424-4424-8424-242424242424', conversationId: first.conversation.id, userMessage: 'Explain queues.',
    }, request, db as unknown as Firestore, dependencies({ now: () => later }))
    expect(Date.parse(continued.conversation.expiresAt) - later.toMillis()).toBe(14 * 24 * 60 * 60 * 1000)

    const afterExpiry = Timestamp.fromMillis(Date.parse(continued.conversation.expiresAt) + 1)
    const expiredDeps = dependencies({ now: () => afterExpiry })
    await expect(readStudentStudyAssistantConversationHandler({
      conversationId: first.conversation.id, limit: 50,
    }, request, db as unknown as Firestore, expiredDeps)).rejects.toMatchObject({ code: 'failed-precondition' })
    await expect(studentStudyAssistHandler(firstInput, request, db as unknown as Firestore, expiredDeps))
      .rejects.toMatchObject({ code: 'failed-precondition' })
    await expect(listStudentStudyAssistantConversationsHandler({ limit: 20 }, request, db as unknown as Firestore, expiredDeps))
      .resolves.toEqual({ conversations: [], nextCursor: null })
  })

  it('uses stable bounded cursors for conversation and message pages', async () => {
    const db = database()
    const deps = dependencies({ requestsPerWindow: 20 })
    const conversationIds: string[] = []
    for (const [index, requestId] of [
      '25252525-2525-4525-8525-252525252525',
      '26262626-2626-4626-8626-262626262626',
      '27272727-2727-4727-8727-272727272727',
    ].entries()) {
      const result = await studentStudyAssistHandler({
        requestId, conversationId: null, userMessage: `Explain BFS ${index}.`,
      }, request, db as unknown as Firestore, dependencies({
        requestsPerWindow: 20,
        now: () => Timestamp.fromMillis(fixedNow.toMillis() + index),
      }))
      conversationIds.push(result.conversation.id)
    }
    const firstPage = await listStudentStudyAssistantConversationsHandler({ limit: 2 }, request, db as unknown as Firestore, deps)
    expect(firstPage.conversations.map(({ id }) => id)).toEqual([conversationIds[2], conversationIds[1]])
    expect(firstPage.nextCursor).toEqual(expect.any(String))
    const secondPage = await listStudentStudyAssistantConversationsHandler({
      limit: 2, cursor: firstPage.nextCursor!,
    }, request, db as unknown as Firestore, deps)
    expect(secondPage.conversations.map(({ id }) => id)).toEqual([conversationIds[0]])

    const conversationId = conversationIds[0]!
    const firstMessages = await readStudentStudyAssistantConversationHandler({
      conversationId, limit: 1,
    }, request, db as unknown as Firestore, deps)
    expect(firstMessages.messages.map(({ role }) => role)).toEqual(['ASSISTANT'])
    expect(firstMessages.nextCursor).toEqual(expect.any(String))
    const secondMessages = await readStudentStudyAssistantConversationHandler({
      conversationId, limit: 1, cursor: firstMessages.nextCursor!,
    }, request, db as unknown as Firestore, deps)
    expect(secondMessages.messages.map(({ role }) => role)).toEqual(['STUDENT'])
  })

  it('bounds recent provider history by messages and characters without summaries', async () => {
    const db = database()
    let lastProviderInput: StudentStudyAssistantProviderInput | undefined
    const provider: StudentStudyAssistantProvider = { answer: vi.fn(async (input) => {
      lastProviderInput = input
      return { kind: 'grounded' as const, content: 'BFS uses a queue.', citationChunkIds: ['chunk-1'] }
    }) }
    const deps = dependencies({ provider, requestsPerWindow: 20 })
    let conversationId: string | null = null
    const requestIds = [
      '30303030-3030-4030-8030-303030303030', '31313131-3131-4131-8131-313131313131',
      '32323232-3232-4232-8232-323232323232', '33333333-3333-4333-8333-333333333330',
      '34343434-3434-4434-8434-343434343434', '35353535-3535-4535-8535-353535353535',
      '36363636-3636-4636-8636-363636363636', '37373737-3737-4737-8737-373737373737',
    ]
    for (const [index, requestId] of requestIds.entries()) {
      const result = await studentStudyAssistHandler({
        requestId, conversationId, userMessage: `${index} ${'bfs '.repeat(600)}`,
      }, request, db as unknown as Firestore, deps)
      conversationId = result.conversation.id
    }
    expect(lastProviderInput?.history.length).toBeLessThanOrEqual(12)
    expect(lastProviderInput?.history.reduce((sum: number, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(16_000)
    expect(lastProviderInput?.history.some((message) => message.content.startsWith('0 '))).toBe(false)
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

  it('marks failed deletion cleanup immediately eligible for maintenance retry', async () => {
    const db = database()
    const deps = dependencies()
    const sent = await studentStudyAssistHandler({
      requestId: '13131313-1313-4313-8313-131313131313', conversationId: null, userMessage: 'Explain BFS.',
    }, request, db as unknown as Firestore, deps)
    const recursiveDelete = db.recursiveDelete.bind(db)
    db.recursiveDelete = vi.fn(async () => { throw new Error('transient cleanup failure') })
    await expect(deleteStudentStudyAssistantConversationHandler({
      requestId: '14141414-1414-4414-8414-141414141414', conversationId: sent.conversation.id,
    }, request, db as unknown as Firestore, deps)).rejects.toMatchObject({
      code: 'unavailable', details: { reason: 'DELETION_CLEANUP_PENDING' },
    })
    const conversationPath = `studentStudyAssistantUsers/${actor.uid}/studentStudyAssistantConversations/${sent.conversation.id}`
    expect(db.store.get(conversationPath)).toMatchObject({ deletedAt: fixedNow, expiresAt: fixedNow, contentDeletedAt: null })
    db.recursiveDelete = recursiveDelete
    await expect(cleanupExpiredStudentStudyAssistantConversations(
      db as unknown as Firestore, fixedNow, 10,
    )).resolves.toBe(1)
    expect([...db.store.keys()].some((path) => path.includes('/studentStudyAssistantMessages/'))).toBe(false)
  })

  it('does not accumulate receipts or audits for fresh request IDs after deletion', async () => {
    const db = database()
    const deps = dependencies()
    const sent = await studentStudyAssistHandler({
      requestId: '15151515-1515-4515-8515-151515151515', conversationId: null, userMessage: 'Explain BFS.',
    }, request, db as unknown as Firestore, deps)
    await deleteStudentStudyAssistantConversationHandler({
      requestId: '16161616-1616-4616-8616-161616161616', conversationId: sent.conversation.id,
    }, request, db as unknown as Firestore, deps)
    const operationsBefore = [...db.store.keys()].filter((path) => path.includes('/studentStudyAssistantDeleteOperations/'))
    const auditsBefore = [...db.store.keys()].filter((path) => path.startsWith('studentStudyAssistantAuditEvents/'))
    await expect(deleteStudentStudyAssistantConversationHandler({
      requestId: '17171717-1717-4717-8717-171717171717', conversationId: sent.conversation.id,
    }, request, db as unknown as Firestore, deps)).resolves.toEqual({
      kind: 'already_deleted', conversationId: sent.conversation.id,
    })
    expect([...db.store.keys()].filter((path) => path.includes('/studentStudyAssistantDeleteOperations/'))).toEqual(operationsBefore)
    expect([...db.store.keys()].filter((path) => path.startsWith('studentStudyAssistantAuditEvents/'))).toEqual(auditsBefore)
  })

  it('does not recreate a conversation shell when only its tombstone remains', async () => {
    const db = database()
    const deps = dependencies()
    const conversationId = 'tombstone-only-conversation'
    db.store.set(`studentStudyAssistantDeletionTombstones/${actor.uid}/studentStudyAssistantConversations/${conversationId}`, {
      ownerId: actor.uid, conversationId, deletedAt: fixedNow,
    })
    await expect(deleteStudentStudyAssistantConversationHandler({
      requestId: '18181818-1818-4818-8818-181818181818', conversationId,
    }, request, db as unknown as Firestore, deps)).resolves.toEqual({
      kind: 'already_deleted', conversationId,
    })
    expect(db.store.has(`studentStudyAssistantUsers/${actor.uid}/studentStudyAssistantConversations/${conversationId}`)).toBe(false)
    expect([...db.store.keys()].some((path) => path.includes('/studentStudyAssistantDeleteOperations/'))).toBe(false)
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

  it('removes metadata-only audit events after their 30-day expiry', async () => {
    const db = database()
    db.store.set('studentStudyAssistantAuditEvents/expired', {
      featureId: 'S2-D1-F03', event: 'MESSAGE_COMPLETED', expiresAt: Timestamp.fromMillis(1),
    })
    db.store.set('studentStudyAssistantAuditEvents/current', {
      featureId: 'S2-D1-F03', event: 'MESSAGE_COMPLETED', expiresAt: Timestamp.fromMillis(fixedNow.toMillis() + 1),
    })
    await expect(cleanupExpiredStudentStudyAssistantAuditEvents(
      db as unknown as Firestore, fixedNow, 10,
    )).resolves.toBe(1)
    expect(db.store.has('studentStudyAssistantAuditEvents/expired')).toBe(false)
    expect(db.store.has('studentStudyAssistantAuditEvents/current')).toBe(true)
  })

  it('removes expired delete-idempotency receipts after 30 days', async () => {
    const db = database()
    db.store.set(`studentStudyAssistantUsers/${actor.uid}/studentStudyAssistantDeleteOperations/expired`, {
      ownerId: actor.uid, expiresAt: Timestamp.fromMillis(1),
    })
    db.store.set(`studentStudyAssistantUsers/${actor.uid}/studentStudyAssistantDeleteOperations/current`, {
      ownerId: actor.uid, expiresAt: Timestamp.fromMillis(fixedNow.toMillis() + 1),
    })
    await expect(cleanupExpiredStudentStudyAssistantDeleteOperations(
      db as unknown as Firestore, fixedNow, 10,
    )).resolves.toBe(1)
    expect(db.store.has(`studentStudyAssistantUsers/${actor.uid}/studentStudyAssistantDeleteOperations/expired`)).toBe(false)
    expect(db.store.has(`studentStudyAssistantUsers/${actor.uid}/studentStudyAssistantDeleteOperations/current`)).toBe(true)
  })
})
