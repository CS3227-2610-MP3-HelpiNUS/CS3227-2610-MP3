import { describe, expect, it } from 'vitest'
import { messageBodySchema, sendMessageInputSchema } from './conversations.js'

describe('F02 message contract', () => {
  it('trims only outer whitespace and counts Unicode code points', () => {
    expect(messageBodySchema.parse('  Line one\nLine two 😀  ')).toBe('Line one\nLine two 😀')
    expect(messageBodySchema.parse('\n  First  line\n\nSecond line  \n')).toBe('First  line\n\nSecond line')
    expect(messageBodySchema.parse(`  ${'a'.repeat(3999)}😀  `)).toBe(`${'a'.repeat(3999)}😀`)
    expect(messageBodySchema.parse('😀'.repeat(4000))).toBe('😀'.repeat(4000))
    expect(messageBodySchema.safeParse('😀'.repeat(4001)).success).toBe(false)
    expect(messageBodySchema.safeParse(`${'a'.repeat(3999)}😀😀`).success).toBe(false)
    expect(messageBodySchema.safeParse('').success).toBe(false)
    expect(messageBodySchema.safeParse(' \t\n ').success).toBe(false)
    expect(messageBodySchema.safeParse(42).success).toBe(false)
  })
  it('requires canonical opaque message IDs and strict wire fields', () => {
    expect(sendMessageInputSchema.safeParse({ requestId: 'request', messageId: crypto.randomUUID(), body: 'Hello' }).success).toBe(true)
    expect(sendMessageInputSchema.safeParse({ requestId: 'request', messageId: 'predictable', body: 'Hello' }).success).toBe(false)
    expect(sendMessageInputSchema.safeParse({ requestId: 'request', messageId: crypto.randomUUID(), body: 42 }).success).toBe(false)
    const base = { requestId: 'request', messageId: crypto.randomUUID(), body: 'Hello' }
    for (const forged of [
      { senderId: 'forged' }, { createdAt: '2000-01-01T00:00:00.000Z' }, { readAt: null },
      { studentId: 'forged' }, { mentorId: 'forged' }, { participantIds: ['forged', 'other'] },
      { helpRequestId: 'other' }, { conversationId: 'other' }, { parentId: 'other' }, { isAdmin: true },
    ]) expect(sendMessageInputSchema.safeParse({ ...base, ...forged }).success).toBe(false)
  })
})
