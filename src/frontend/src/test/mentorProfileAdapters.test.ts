import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readOwnMentorProfileOutputSchema, searchMentorModulesOutputSchema, updateOwnMentorProfileOutputSchema, type ReadOwnMentorProfileOutput } from '@helpinus/shared'

const sdk = vi.hoisted(() => ({ httpsCallable: vi.fn() }))
vi.mock('../services/firebase', () => ({ firebase: { auth: {}, firestore: {}, functions: {} } }))
vi.mock('../services/firebaseConfig', () => ({ firebaseEnvironment: 'development', isEmulatorConnectionAllowed: () => false }))
vi.mock('firebase/functions', () => ({ httpsCallable: sdk.httpsCallable }))

import { firebaseServices } from '../services/firebaseServices'
import { createMockCallableClient, mockServices } from '../services/mockServices'

describe('Mentor profile callable adapters', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dispatches all F04 names through Firebase and validates output before publication', async () => {
    const ready = { kind: 'ready', profile: { displayName: 'Mentor', biography: '', moduleIds: [], version: { revision: 0, updateTime: '1:000000000' } }, metadata: { kind: 'ready', modules: [] } }
    const invoke = vi.fn().mockResolvedValueOnce({ data: ready }).mockResolvedValueOnce({ data: { modules: [], nextCursor: null } }).mockResolvedValueOnce({ data: { kind: 'accepted', stored: { biography: 'Updated', moduleIds: [], revision: 1 } } }).mockResolvedValueOnce({ data: { ...ready, email: 'private@example.test' } })
    sdk.httpsCallable.mockReturnValue(invoke)
    expect(readOwnMentorProfileOutputSchema.parse(await firebaseServices.callables.invoke('readOwnMentorProfile', {}))).toEqual(ready)
    await expect(firebaseServices.callables.invoke('searchMentorModules', { query: 'cs' })).resolves.toEqual({ modules: [], nextCursor: null })
    await expect(firebaseServices.callables.invoke('updateOwnMentorProfile', { requestId: crypto.randomUUID(), baseline: { revision: 0, updateTime: '1:000000000' }, biography: 'Updated', moduleIds: [] })).resolves.toMatchObject({ kind: 'accepted' })
    await expect(firebaseServices.callables.invoke('readOwnMentorProfile', {})).rejects.toThrow()
    expect(sdk.httpsCallable.mock.calls.map((call) => call[1])).toEqual(['readOwnMentorProfile', 'searchMentorModules', 'updateOwnMentorProfile', 'readOwnMentorProfile'])
  })

  it('uses strict mock output parsing and provides deterministic profile/search fixtures', async () => {
    const own = await mockServices.callables.invoke('readOwnMentorProfile', {})
    expect(readOwnMentorProfileOutputSchema.parse(own)).toEqual(own)
    const page = await mockServices.callables.invoke('searchMentorModules', { query: 'cs' })
    expect(page.modules.map(({ id }) => id)).toEqual(['cs2040s', 'cs2103t'])
    const broken = createMockCallableClient({ readOwnMentorProfile: async () => ({ kind: 'ready', email: 'private@example.test' }) as never })
    await expect(broken.invoke('readOwnMentorProfile', {})).rejects.toThrow()
  })

  it('rejects malformed Firebase outputs for each F04 callable and passes transport errors through', async () => {
    const denied = new Error('permission-denied')
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: { kind: 'ready', profile: { displayName: 'Mentor' }, metadata: { kind: 'ready', modules: [] } } })
      .mockResolvedValueOnce({ data: { modules: [{ id: 'cs', code: 'CS1000', title: 'Course', email: 'private@example.test' }], nextCursor: null } })
      .mockResolvedValueOnce({ data: { kind: 'accepted', stored: { biography: '', moduleIds: [], revision: 0 } } })
      .mockRejectedValueOnce(denied)
    sdk.httpsCallable.mockReturnValue(invoke)
    await expect(firebaseServices.callables.invoke('readOwnMentorProfile', {})).rejects.toThrow()
    await expect(firebaseServices.callables.invoke('searchMentorModules', { query: 'cs' })).rejects.toThrow()
    await expect(firebaseServices.callables.invoke('updateOwnMentorProfile', { requestId: crypto.randomUUID(), baseline: { revision: 0, updateTime: '1:000000000' }, biography: '', moduleIds: [] })).rejects.toThrow()
    await expect(firebaseServices.callables.invoke('readOwnMentorProfile', {})).rejects.toBe(denied)
    expect(sdk.httpsCallable.mock.calls.map((call) => call[1])).toEqual(['readOwnMentorProfile', 'searchMentorModules', 'updateOwnMentorProfile', 'readOwnMentorProfile'])
  })

  it('replays strict mock read, search-page, conflict, and accepted variants', async () => {
    const profile = { displayName: 'Mentor', biography: '', moduleIds: [], version: { revision: 0, updateTime: '1:000000000' } }
    const variants: ReadOwnMentorProfileOutput[] = [
      { kind: 'ready', profile, metadata: { kind: 'ready', modules: [] } },
      { kind: 'ready', profile: { ...profile, moduleIds: ['cs2103t', 'old', 'deleted'] }, metadata: { kind: 'ready', modules: [
        { id: 'cs2103t', state: 'active', code: 'CS2103T', title: 'Software Engineering' },
        { id: 'old', state: 'inactive', code: 'CS1000', title: 'Old Course' },
        { id: 'deleted', state: 'missing' },
      ] } },
      { kind: 'ready', profile, metadata: { kind: 'unavailable' } },
      { kind: 'missing' }, { kind: 'inactive' }, { kind: 'invalid' },
    ]
    for (const variant of variants) {
      const client = createMockCallableClient({ readOwnMentorProfile: async () => variant })
      const result = await client.invoke('readOwnMentorProfile', {})
      expect(readOwnMentorProfileOutputSchema.parse(result)).toEqual(variant)
    }
    const module = { id: 'cs2103t', code: 'CS2103T', title: 'Software Engineering' }
    const inputs: unknown[] = []
    const client = createMockCallableClient({
      searchMentorModules: async (input) => {
        inputs.push(input)
        return input.cursor ? { modules: [], nextCursor: null } : { modules: [module], nextCursor: 'page-2' }
      },
      updateOwnMentorProfile: async (input) => input.baseline.revision === 0
        ? { kind: 'rejected', reason: 'CONFLICT' }
        : { kind: 'accepted', stored: { biography: input.biography, moduleIds: input.moduleIds, revision: 2 } },
    })
    const first = await client.invoke('searchMentorModules', { query: 'cs' })
    const second = await client.invoke('searchMentorModules', { query: 'cs', cursor: first.nextCursor! })
    expect(searchMentorModulesOutputSchema.parse(first)).toEqual({ modules: [module], nextCursor: 'page-2' })
    expect(searchMentorModulesOutputSchema.parse(second)).toEqual({ modules: [], nextCursor: null })
    expect(inputs).toEqual([{ query: 'cs' }, { query: 'cs', cursor: 'page-2' }])
    const requestId = crypto.randomUUID()
    const base = { requestId, baseline: { revision: 0, updateTime: '1:000000000' }, biography: 'Saved', moduleIds: ['cs2103t'] }
    expect(updateOwnMentorProfileOutputSchema.parse(await client.invoke('updateOwnMentorProfile', base))).toEqual({ kind: 'rejected', reason: 'CONFLICT' })
    expect(updateOwnMentorProfileOutputSchema.parse(await client.invoke('updateOwnMentorProfile', { ...base, baseline: { ...base.baseline, revision: 1 } }))).toEqual({ kind: 'accepted', stored: { biography: 'Saved', moduleIds: ['cs2103t'], revision: 2 } })
  })

  it('keeps malformed mock responses and uncertain transport failures out of the client', async () => {
    const timeout = new Error('deadline-exceeded')
    const client = createMockCallableClient({
      searchMentorModules: async () => ({ modules: [{ id: 'bad id', code: 'CS1000', title: 'Course', active: true }], nextCursor: null }) as never,
      updateOwnMentorProfile: async () => { throw timeout },
    })
    await expect(client.invoke('searchMentorModules', { query: 'cs' })).rejects.toThrow()
    const update = { requestId: crypto.randomUUID(), baseline: { revision: 0, updateTime: '1:000000000' }, biography: '', moduleIds: [] }
    await expect(client.invoke('updateOwnMentorProfile', update)).rejects.toBe(timeout)
    await expect(client.invoke('updateOwnMentorProfile', update)).rejects.toBe(timeout)
  })
})
