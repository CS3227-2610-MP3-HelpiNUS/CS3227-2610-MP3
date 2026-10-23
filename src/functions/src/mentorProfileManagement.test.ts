import { describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'

vi.mock('./auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth.js')>()),
  requireCurrentMentor: vi.fn().mockResolvedValue({ uid: 'mentor', email: 'mentor@example.test', displayName: 'Mentor' }),
}))
import { requireCurrentMentor } from './auth.js'
import { readOwnMentorProfileHandler, updateOwnMentorProfileHandler } from './mentorProfileManagement.js'

const timestamp = { seconds: 10, nanoseconds: 123 }
function database(profile: unknown, records: Record<string, unknown> = {}, failMetadata = false, revision?: unknown): Firestore {
  const snapshot = profile === null ? { exists: false, data: () => undefined } : { exists: true, updateTime: timestamp, data: () => profile }
  const stateSnapshot = revision === undefined ? { exists: false, data: () => undefined } : { exists: true, data: () => ({ revision }) }
  return {
    runTransaction: async (callback: (transaction: { get: (ref: { get: () => Promise<unknown> }) => Promise<unknown> }) => Promise<unknown>) => callback({ get: (ref) => ref.get() }),
    collection: (name: string) => ({ doc: (id: string) => ({
      id,
      get: async () => name === 'mentorProfiles' ? snapshot : { exists: id in records, data: () => records[id] },
      collection: () => ({ doc: () => ({ get: async () => stateSnapshot }) }),
    }) }),
    getAll: async (...refs: Array<{ id: string }>) => {
      if (failMetadata) throw new Error('metadata offline')
      return refs.map(({ id }) => ({ exists: id in records, data: () => records[id] }))
    },
  } as unknown as Firestore
}
const request = {} as never
const valid = { userId: 'mentor', biography: 'Hello', moduleIds: ['cs2103t', 'legacy'], active: true }

describe('own Mentor profile read', () => {
  it('returns deliberate missing, inactive and invalid variants without private fields', async () => {
    expect(await readOwnMentorProfileHandler({}, request, database(null))).toEqual({ kind: 'missing' })
    expect(await readOwnMentorProfileHandler({}, request, database({ ...valid, active: false }))).toEqual({ kind: 'inactive' })
    expect(await readOwnMentorProfileHandler({}, request, database({ ...valid, moduleIds: [' cs2103t'] }))).toEqual({ kind: 'invalid' })
    expect(await readOwnMentorProfileHandler({}, request, database(valid, {}, false, -1))).toEqual({ kind: 'invalid' })
  })

  it('labels known active and missing saved modules and degrades metadata only on read failure', async () => {
    const records = { cs2103t: { id: 'cs2103t', code: 'CS2103T', title: 'Software Engineering', active: true } }
    const ready = await readOwnMentorProfileHandler({}, request, database(valid, records))
    expect(ready).toMatchObject({ kind: 'ready', profile: { displayName: 'Mentor', biography: 'Hello', moduleIds: ['cs2103t', 'legacy'], version: { revision: 0, updateTime: '10:000000123' } }, metadata: { kind: 'ready', modules: [{ id: 'cs2103t', state: 'active' }, { id: 'legacy', state: 'missing' }] } })
    expect(ready).not.toHaveProperty('email')
    const degraded = await readOwnMentorProfileHandler({}, request, database(valid, records, true))
    expect(degraded.kind).toBe('ready')
    if (degraded.kind === 'ready') expect(degraded.metadata).toEqual({ kind: 'unavailable' })
  })

  it('reads profile and private revision from one snapshot during a concurrent save', async () => {
    const oldProfile = { ...valid, biography: 'Old', moduleIds: [] }
    const newProfile = { ...valid, biography: 'New', moduleIds: [] }
    const publicRef = { get: async () => ({ exists: true, updateTime: timestamp, data: () => oldProfile }) }
    const privateRef = { get: async () => ({ exists: true, data: () => ({ revision: 2 }) }) }
    const profileRef = { ...publicRef, collection: () => ({ doc: () => privateRef }) }
    const runTransaction = vi.fn(async (callback: (transaction: { get: (ref: unknown) => Promise<unknown> }) => Promise<unknown>) => callback({
      get: async (ref) => ref === profileRef
        ? { exists: true, updateTime: { seconds: 11, nanoseconds: 456 }, data: () => newProfile }
        : { exists: true, data: () => ({ revision: 2 }) },
    }))
    const db = {
      collection: () => ({ doc: () => profileRef }),
      runTransaction,
    } as unknown as Firestore

    const result = await readOwnMentorProfileHandler({}, request, db)
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), { readOnly: true })
    expect(result).toMatchObject({ kind: 'ready', profile: { biography: 'New', version: { revision: 2, updateTime: '11:000000456' } } })
  })
})

const currentUser = {
  id: 'mentor', email: 'mentor@example.test', displayName: 'Mentor', role: 'MENTOR', status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
}
const baseline = { revision: 0, updateTime: '10:000000123' }

function updateDatabase(options: {
  user?: Record<string, unknown>
  modules?: Record<string, unknown>
  failCommit?: boolean
  events?: string[]
} = {}) {
  const writes = { update: vi.fn(), set: vi.fn(), create: vi.fn() }
  const committed: Array<{ kind: string; value: unknown }> = []
  const profileRef = { id: 'mentor', collection: (name: string) => ({ doc: (id: string) => ({ id, name }) }) }
  const userRef = { id: 'mentor', name: 'mentors' }
  const stateRef = profileRef.collection('private').doc('profileState')
  const recordRef = profileRef.collection('saveRequests').doc('request')
  const moduleRefs = new Map<string, { id: string; name: string }>()
  const events = options.events ?? []
  const db = {
    collection: (name: string) => ({ doc: (id: string) => {
      if (name === 'mentorProfiles') return profileRef
      if (name === 'mentors') return userRef
      const existing = moduleRefs.get(id)
      if (existing) return existing
      const ref = { id, name }
      moduleRefs.set(id, ref)
      return ref
    } }),
    runTransaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) => {
      events.push('transaction')
      const pending: Array<{ kind: string; value: unknown }> = []
      const transaction = {
        get: vi.fn(async (ref: unknown) => {
          if (ref === userRef) {
            events.push('transaction Mentor read')
            return { exists: true, data: () => options.user ?? currentUser }
          }
          if (ref === profileRef) return { exists: true, updateTime: timestamp, data: () => ({ ...valid, moduleIds: [] }) }
          if (ref === stateRef || ref === recordRef) return { exists: false, data: () => undefined }
          const module = options.modules?.[(ref as { id: string }).id]
          return { exists: module !== undefined, data: () => module }
        }),
        update: vi.fn((ref: unknown, value: unknown) => { writes.update(ref, value); pending.push({ kind: 'update', value }) }),
        set: vi.fn((ref: unknown, value: unknown) => { writes.set(ref, value); pending.push({ kind: 'set', value }) }),
        create: vi.fn((ref: unknown, value: unknown) => { writes.create(ref, value); pending.push({ kind: 'create', value }) }),
      }
      const result = await callback(transaction)
      if (options.failCommit) throw new Error('transaction commit unavailable')
      committed.push(...pending)
      return result
    }),
  } as unknown as Firestore
  return { db, writes, committed, events }
}

describe('own Mentor profile save transaction boundaries', () => {
  const input = { requestId: '00000000-0000-4000-8000-000000000001', baseline, biography: 'Updated', moduleIds: ['first', 'second'] }

  it.each([
    ['role', { role: 'STUDENT' }],
    ['status', { status: 'SUSPENDED' }],
    ['email', { email: 'changed@example.test' }],
  ])('rechecks the authoritative %s after Auth preflight and issues no writes', async (_name, changed) => {
    const events: string[] = []
    vi.mocked(requireCurrentMentor).mockImplementationOnce(async () => {
      events.push('auth preflight')
      return { uid: 'mentor', email: 'mentor@example.test', displayName: 'Mentor', role: 'MENTOR', status: 'ACTIVE' }
    })
    const test = updateDatabase({ user: { ...currentUser, ...changed }, events })
    await expect(updateOwnMentorProfileHandler(input, request, test.db)).rejects.toMatchObject({ code: 'permission-denied' })
    expect(events).toEqual(['auth preflight', 'transaction', 'transaction Mentor read'])
    expect(test.writes.update).not.toHaveBeenCalled()
    expect(test.writes.set).not.toHaveBeenCalled()
    expect(test.writes.create).not.toHaveBeenCalled()
  })

  it('rejects a late inactive module without profile or accepted receipt writes', async () => {
    const test = updateDatabase({ modules: {
      first: { id: 'first', code: 'FIRST', title: 'First', active: true },
      second: { id: 'second', code: 'SECOND', title: 'Second', active: false },
    } })
    await expect(updateOwnMentorProfileHandler(input, request, test.db)).resolves.toMatchObject({ kind: 'rejected', reason: 'MODULE_INELIGIBLE' })
    expect(test.writes.update).not.toHaveBeenCalled()
    expect(test.writes.set).not.toHaveBeenCalled()
    expect(test.writes.create).toHaveBeenCalledOnce()
    expect(test.committed).toHaveLength(1)
    expect(test.committed[0]).toMatchObject({ kind: 'create', value: { outcome: { kind: 'rejected', reason: 'MODULE_INELIGIBLE' } } })
  })

  it('exposes no committed profile, revision, or accepted receipt after a pre-commit failure', async () => {
    const test = updateDatabase({ modules: {
      first: { id: 'first', code: 'FIRST', title: 'First', active: true },
      second: { id: 'second', code: 'SECOND', title: 'Second', active: true },
    }, failCommit: true })
    await expect(updateOwnMentorProfileHandler(input, request, test.db)).rejects.toThrow('transaction commit unavailable')
    expect(test.writes.update).toHaveBeenCalledOnce()
    expect(test.writes.set).toHaveBeenCalledOnce()
    expect(test.writes.create).toHaveBeenCalledOnce()
    expect(test.committed).toEqual([])
  })
})
