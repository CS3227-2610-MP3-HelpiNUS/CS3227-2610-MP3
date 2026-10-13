import { describe, expect, it } from 'vitest'

import {
  availabilitySlotSchema,
  createHelpRequestInputSchema,
  messageSchema,
  userSchema,
} from './index.js'

describe('shared contracts', () => {
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

  it('rejects a message with only whitespace', () => {
    expect(messageSchema.safeParse({
      id: 'message-1', conversationId: 'conversation-1', senderId: 'student-1', body: ' \t\n ',
      createdAt: '2026-10-13T10:00:00.000Z',
    }).success).toBe(false)
  })
})
