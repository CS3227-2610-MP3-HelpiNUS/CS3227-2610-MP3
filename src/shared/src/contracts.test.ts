import { describe, expect, it } from 'vitest'

import {
  availabilitySlotSchema,
  createHelpRequestInputSchema,
  respondToHelpRequestInputSchema,
  discoverMentorsInputSchema,
  discoverMentorsOutputSchema,
  readOwnMentorProfileInputSchema,
  readOwnMentorProfileOutputSchema,
  searchMentorModulesInputSchema,
  searchMentorModulesOutputSchema,
  updateOwnMentorProfileInputSchema,
  updateOwnMentorProfileOutputSchema,
  messageSchema,
  userSchema,
} from './index.js'

describe('shared contracts', () => {
  it('enforces strict Mentor profile read, search, and update wire shapes', () => {
    expect(readOwnMentorProfileInputSchema.safeParse({ uid: 'other' }).success).toBe(false)
    expect(readOwnMentorProfileOutputSchema.safeParse({ kind: 'ready', profile: { displayName: 'Mentor', biography: '', moduleIds: [], version: { revision: 0, updateTime: '1:000000000' }, email: 'private@example.test' }, metadata: { kind: 'ready', modules: [] } }).success).toBe(false)
    expect(searchMentorModulesInputSchema.safeParse({ query: '' }).success).toBe(false)
    expect(searchMentorModulesOutputSchema.safeParse({ modules: Array.from({ length: 21 }, (_, i) => ({ id: `m${i}`, code: 'CS1000', title: 'Test' })), nextCursor: null }).success).toBe(false)
    const valid = { requestId: 'b70f16a0-5010-4a53-95d7-718e396090a5', baseline: { revision: 0, updateTime: '1:000000000' }, biography: 'Line one\nLine two', moduleIds: ['cs2103t'] }
    expect(updateOwnMentorProfileInputSchema.parse(valid).biography).toBe('Line one\nLine two')
    for (const change of [{ uid: 'other' }, { active: true }, { moduleIds: [' cs2103t'] }, { moduleIds: ['cs2103t', 'cs2103t'] }, { moduleIds: Array.from({ length: 31 }, (_, i) => `m${i}`) }, { baseline: { revision: 0.1, updateTime: '1:0' } }]) {
      expect(updateOwnMentorProfileInputSchema.safeParse({ ...valid, ...change }).success).toBe(false)
    }
    expect(updateOwnMentorProfileOutputSchema.safeParse({ kind: 'accepted', stored: { biography: '', moduleIds: [], revision: 1, uid: 'other' } }).success).toBe(false)
  })

  it('accepts every read variant and enforces the metadata union', () => {
    for (const kind of ['missing', 'inactive', 'invalid'] as const) {
      expect(readOwnMentorProfileOutputSchema.parse({ kind })).toEqual({ kind })
      expect(readOwnMentorProfileOutputSchema.safeParse({ kind, profile: {} }).success).toBe(false)
    }
    const profile = { displayName: 'Mentor', biography: 'b'.repeat(1000), moduleIds: ['cs2103t'], version: { revision: Number.MAX_SAFE_INTEGER, updateTime: '123:000000001' } }
    const saved = { id: 'cs2103t', state: 'active', code: 'CS2103T', title: 'Software Engineering' }
    const ready = { kind: 'ready', profile, metadata: { kind: 'ready', modules: [saved, { id: 'old', state: 'missing' }] } }
    expect(readOwnMentorProfileOutputSchema.safeParse(ready).success).toBe(true)
    expect(readOwnMentorProfileOutputSchema.safeParse({ ...ready, metadata: { kind: 'unavailable' } }).success).toBe(true)
    for (const metadata of [
      { kind: 'unavailable', modules: [] },
      { kind: 'ready', modules: [{ id: 'old', state: 'missing', code: 'OLD' }] },
      { kind: 'ready', modules: [{ id: 'cs2103t', state: 'active', code: 'CS2103T' }] },
    ]) expect(readOwnMentorProfileOutputSchema.safeParse({ ...ready, metadata }).success).toBe(false)
    expect(readOwnMentorProfileOutputSchema.safeParse({ ...ready, profile: { ...profile, biography: 'b'.repeat(1001) } }).success).toBe(false)
    expect(readOwnMentorProfileOutputSchema.safeParse({ ...ready, profile: { ...profile, version: { revision: Number.MAX_SAFE_INTEGER + 1, updateTime: '123:000000001' } } }).success).toBe(false)
  })

  it('accepts exact search bounds and rejects malformed pages or privileged fields', () => {
    expect(searchMentorModulesInputSchema.parse({ query: 'CS' })).toEqual({ query: 'CS' })
    expect(searchMentorModulesInputSchema.safeParse({ query: 'x'.repeat(160), cursor: 'c'.repeat(512) }).success).toBe(true)
    for (const input of [{ query: '' }, { query: 'x'.repeat(161) }, { query: 'cs', uid: 'mentor' }, { query: 'cs', cursor: '' }, { query: 'cs', cursor: 'x'.repeat(513) }]) {
      expect(searchMentorModulesInputSchema.safeParse(input).success).toBe(false)
    }
    const module = { id: 'cs2103t', code: 'CS2103T', title: 'Software Engineering' }
    expect(searchMentorModulesOutputSchema.safeParse({ modules: [], nextCursor: null }).success).toBe(true)
    expect(searchMentorModulesOutputSchema.safeParse({ modules: Array.from({ length: 20 }, (_, index) => ({ ...module, id: `m${index}` })), nextCursor: 'cursor' }).success).toBe(true)
    for (const output of [
      { modules: [module], nextCursor: undefined },
      { modules: [{ ...module, active: true }], nextCursor: null },
      { modules: [{ ...module, id: ' bad ' }], nextCursor: null },
      { modules: [module], nextCursor: 'x'.repeat(513) },
      { modules: [], nextCursor: null, email: 'private@example.test' },
    ]) expect(searchMentorModulesOutputSchema.safeParse(output).success).toBe(false)
  })

  it('enforces update identity, revision, biography, module, and receipt boundaries', () => {
    const baseline = { revision: 0, updateTime: '1:000000000' }
    const input = { requestId: 'b70f16a0-5010-4a53-95d7-718e396090a5', baseline, biography: 'b'.repeat(1000), moduleIds: Array.from({ length: 30 }, (_, index) => `m${index}`) }
    expect(updateOwnMentorProfileInputSchema.safeParse(input).success).toBe(true)
    for (const change of [
      { requestId: 'not-a-uuid' }, { baseline: { ...baseline, revision: -1 } },
      { baseline: { ...baseline, revision: 0.5 } }, { baseline: { ...baseline, updateTime: '1:0' } },
      { biography: 'b'.repeat(1001) }, { moduleIds: [...input.moduleIds, 'm30'] },
      { moduleIds: ['m1', 'm1'] }, { moduleIds: [' bad '] }, { role: 'ADMIN' },
    ]) expect(updateOwnMentorProfileInputSchema.safeParse({ ...input, ...change }).success).toBe(false)
    const accepted = { kind: 'accepted', stored: { biography: 'Saved', moduleIds: ['m1'], revision: 1 } }
    const rejected = { kind: 'rejected', reason: 'CONFLICT', fieldErrors: { biography: ['Changed'] } }
    expect(updateOwnMentorProfileOutputSchema.safeParse(accepted).success).toBe(true)
    expect(updateOwnMentorProfileOutputSchema.safeParse(rejected).success).toBe(true)
    expect(updateOwnMentorProfileOutputSchema.safeParse({ kind: 'rejected', reason: 'MODULE_INELIGIBLE' }).success).toBe(true)
    for (const output of [
      { ...accepted, stored: { ...accepted.stored, revision: 0 } },
      { ...accepted, stored: { ...accepted.stored, uid: 'other' } },
      { ...rejected, reason: 'UNKNOWN' },
      { ...rejected, stored: accepted.stored },
    ]) expect(updateOwnMentorProfileOutputSchema.safeParse(output).success).toBe(false)
  })
  it('accepts a trusted student profile', () => {
    expect(
      userSchema.parse({
        id: 'student-1',
        displayName: 'Student One',
        email: 'student@example.test',
        role: 'STUDENT',
        status: 'ACTIVE',
        createdAt: '2026-10-13T10:00:00.000+08:00',
      }),
    ).toMatchObject({ role: 'STUDENT', status: 'ACTIVE' })
  })

  it('rejects an inverted availability window', () => {
    expect(() =>
      availabilitySlotSchema.parse({
        id: 'slot-1',
        mentorId: 'mentor-1',
        startsAt: '2026-10-13T11:00:00.000+08:00',
        endsAt: '2026-10-13T10:00:00.000+08:00',
        withdrawn: false,
        createdAt: '2026-10-13T09:00:00.000+08:00',
      }),
    ).toThrow('endsAt must be after startsAt')
  })

  it('requires idempotency keys for state-changing callables', () => {
    expect(
      createHelpRequestInputSchema.safeParse({
        moduleId: 'CS3227',
        title: 'Need help',
        description: 'Please explain the topic.',
      }).success,
    ).toBe(false)
  })

  it('uses explicit F01 operation and persistent IDs with strict normalized bounds', () => {
    const operationId = 'b70f16a0-5010-4a53-95d7-718e396090a5'
    const create = { operationId, mentorId: 'mentor-1', moduleId: 'cs2103t', title: '  Question  ', description: '  Line one\nLine two  ' }
    expect(createHelpRequestInputSchema.parse(create)).toMatchObject({ title: 'Question', description: 'Line one\nLine two' })
    for (const invalid of [
      { ...create, operationId: 'not-a-uuid' },
      { ...create, title: ' '.repeat(3) },
      { ...create, title: 'X'.repeat(121) },
      { ...create, description: 'X'.repeat(2001) },
      { ...create, studentId: 'forged' },
      { ...create, requestId: operationId },
      { ...create, mentorId: null },
    ]) expect(createHelpRequestInputSchema.safeParse(invalid).success).toBe(false)
    const decision = { operationId, helpRequestId: 'request-1', response: 'REJECTED' }
    expect(respondToHelpRequestInputSchema.safeParse(decision).success).toBe(true)
    expect(respondToHelpRequestInputSchema.safeParse({ ...decision, requestId: operationId }).success).toBe(false)
    expect(respondToHelpRequestInputSchema.safeParse({ ...decision, helpRequestId: operationId, operationId: 'bad' }).success).toBe(false)
  })

  it('defaults Mentor discovery pagination and rejects private account fields', () => {
    expect(discoverMentorsInputSchema.parse({})).toEqual({ limit: 20 })
    expect(discoverMentorsOutputSchema.safeParse({
      mentors: [{
        userId: 'mentor-1',
        displayName: 'Mentor One',
        biography: '',
        moduleIds: ['CS3227'],
        email: 'private@example.test',
      }],
      nextCursor: null,
    }).success).toBe(false)
  })

  it('rejects a message with only whitespace', () => {
    expect(messageSchema.safeParse({
      id: 'message-1', conversationId: 'conversation-1', senderId: 'student-1', body: ' \t\n ',
      createdAt: '2026-10-13T10:00:00.000Z',
    }).success).toBe(false)
  })
})
