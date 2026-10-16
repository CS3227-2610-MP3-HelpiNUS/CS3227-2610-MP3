import { describe, expect, it } from 'vitest'
import { messageBodySchema, sendMessageInputSchema } from './conversations.js'

describe('F02 message contract', () => {
  it('trims only outer whitespace and counts Unicode code points', () => {
    expect(messageBodySchema.parse('  Line one\nLine two 😀  ')).toBe('Line one\nLine two 😀')
    expect(messageBodySchema.parse('😀'.repeat(4000))).toBe('😀'.repeat(4000))
    expect(messageBodySchema.safeParse('😀'.repeat(4001)).success).toBe(false)
    expect(messageBodySchema.safeParse(' \t\n ').success).toBe(false)
  })
  it('requires canonical opaque message IDs and strict wire fields', () => {
    expect(sendMessageInputSchema.safeParse({ requestId: 'request', messageId: crypto.randomUUID(), body: 'Hello' }).success).toBe(true)
    expect(sendMessageInputSchema.safeParse({ requestId: 'request', messageId: 'predictable', body: 'Hello' }).success).toBe(false)
    expect(sendMessageInputSchema.safeParse({ requestId: 'request', messageId: crypto.randomUUID(), body: 'Hello', senderId: 'forged' }).success).toBe(false)
  })
})
