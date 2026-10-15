import { describe, expect, it, vi } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'

vi.mock('./auth.js', () => ({ requireCurrentMentor: vi.fn().mockResolvedValue({ uid: 'mentor' }) }))
import { searchMentorModulesHandler } from './mentorModuleSearch.js'

type Record = { id: string; code: string; title: string; active: boolean; storedId?: string; indexedQueries?: string[] }

function fakeDb(records: Record[]) {
  const calls: unknown[][] = []
  let query = ''
  let after = ''
  let count = 21
  const source = {
    where: (...args: unknown[]) => { calls.push(['where', ...args]); query = args[2] as string; return source },
    orderBy: (...args: unknown[]) => { calls.push(['orderBy', ...args]); return source },
    startAfter: (id: string) => { calls.push(['startAfter', id]); after = id; return source },
    limit: (size: number) => { calls.push(['limit', size]); count = size; return source },
    get: async () => ({ docs: records.filter((record) => record.id > after && (record.indexedQueries?.includes(query) ?? (record.code.toLowerCase().startsWith(query) || record.title.toLowerCase().startsWith(query)))).sort((a, b) => a.id.localeCompare(b.id)).slice(0, count).map((record) => ({ id: record.id, data: () => ({ ...record, id: record.storedId ?? record.id }) })) }),
  }
  return { db: { collection: () => source } as unknown as Firestore, calls }
}

const request = {} as never
describe('Mentor module search', () => {
  it.each([0, 1, 20, 21])('returns each expected document ID once for %i matching records', async (size) => {
    const records = Array.from({ length: size }, (_, index) => ({ id: `m${String(index).padStart(2, '0')}`, code: `CS${index}`, title: `Course ${index}`, active: true }))
    const { db } = fakeDb(records.reverse())
    const ids: string[] = []
    let cursor: string | null = null
    do {
      const page = await searchMentorModulesHandler({ query: 'cs', ...(cursor ? { cursor } : {}) }, request, db)
      expect(page.modules.length).toBeLessThanOrEqual(20)
      ids.push(...page.modules.map(({ id }) => id))
      cursor = page.nextCursor
    } while (cursor)
    expect(ids).toEqual(Array.from({ length: size }, (_, index) => `m${String(index).padStart(2, '0')}`))
    expect(new Set(ids).size).toBe(size)
  })

  it('unions code and title prefixes while excluding infix and inactive indexed records', async () => {
    const { db } = fakeDb([
      { id: 'code', code: 'CS2103T', title: 'Engineering', active: true },
      { id: 'title', code: 'IT1000', title: 'CS Foundations', active: true },
      { id: 'infix', code: 'XXCS', title: 'Intro to CS', active: true },
      { id: 'inactive', code: 'CS0000', title: 'CS', active: false, indexedQueries: [] },
    ])
    const page = await searchMentorModulesHandler({ query: ' Cs ' }, request, db)
    expect(page.modules).toEqual([
      { id: 'code', code: 'CS2103T', title: 'Engineering' },
      { id: 'title', code: 'IT1000', title: 'CS Foundations' },
    ])
    expect(page.nextCursor).toBeNull()
  })

  it('returns fixed 20-record pages in document-ID order with a stable deleted-boundary cursor', async () => {
    const records = Array.from({ length: 22 }, (_, index) => ({ id: `m${String(index).padStart(2, '0')}`, code: `CS${index}`, title: `Course ${index}`, active: true }))
    const { db, calls } = fakeDb(records)
    const first = await searchMentorModulesHandler({ query: 'cs' }, request, db)
    expect(first.modules).toHaveLength(20)
    expect(first.modules.map(({ id }) => id)).toEqual(records.slice(0, 20).map(({ id }) => id))
    expect(first.nextCursor).toBeTruthy()
    records.splice(19, 1)
    const second = await searchMentorModulesHandler({ query: 'CS', cursor: first.nextCursor! }, request, db)
    expect(second.modules.map(({ id }) => id)).toEqual(['m20', 'm21'])
    expect(second.nextCursor).toBeNull()
    expect(calls).toContainEqual(['limit', 21])
    expect(calls).toContainEqual(['startAfter', 'm19'])
  })

  it('rejects mismatched or malformed cursors and inconsistent indexed records', async () => {
    const { db } = fakeDb([{ id: 'm1', code: 'CS1', title: 'One', active: true }])
    const page = await searchMentorModulesHandler({ query: 'cs' }, request, db)
    expect(page.modules).toHaveLength(1)
    const wrong = Buffer.from(JSON.stringify({ v: 1, q: 'other', lastId: 'm1' })).toString('base64url')
    await expect(searchMentorModulesHandler({ query: 'cs', cursor: wrong }, request, db)).rejects.toBeInstanceOf(HttpsError)
    await expect(searchMentorModulesHandler({ query: 'other', cursor: Buffer.from(JSON.stringify({ v: 1, q: 'cs', lastId: 'm1' })).toString('base64url') }, request, db)).rejects.toMatchObject({ code: 'invalid-argument' })
    await expect(searchMentorModulesHandler({ query: 'cs', cursor: 'not-base64-json' }, request, db)).rejects.toMatchObject({ code: 'invalid-argument' })
    await expect(searchMentorModulesHandler({ query: 'cs', cursor: 'x'.repeat(513) }, request, db)).rejects.toMatchObject({ code: 'invalid-argument' })
    await expect(searchMentorModulesHandler({ query: 'cs', cursor: Buffer.from(JSON.stringify({ v: 2, q: 'cs', lastId: 'm1' })).toString('base64url') }, request, db)).rejects.toMatchObject({ code: 'invalid-argument' })
    await expect(searchMentorModulesHandler({ query: 'cs', cursor: Buffer.from(JSON.stringify({ v: 1, q: 'cs', lastId: ' bad ' })).toString('base64url') }, request, db)).rejects.toMatchObject({ code: 'invalid-argument' })
    for (const badRecord of [
      { id: 'm1', code: 'CS1', title: 'One', active: false, indexedQueries: ['cs'] },
      { id: 'm1', code: 'IT1', title: 'One', active: true, indexedQueries: ['cs'] },
      { id: 'm1', code: 'CS1', title: 'One', active: true, storedId: 'other' },
      { id: 'm1', code: 'CS1', title: '', active: true },
    ]) {
      await expect(searchMentorModulesHandler({ query: 'cs' }, request, fakeDb([badRecord]).db)).rejects.toMatchObject({ code: 'internal' })
    }
    await expect(searchMentorModulesHandler({ query: '' }, request, db)).rejects.toMatchObject({ code: 'invalid-argument' })
  })
})
