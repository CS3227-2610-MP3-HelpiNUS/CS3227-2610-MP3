import { describe, expect, it, vi } from 'vitest'
import { mockServices } from '../services/mockServices'

describe('mock consultation scheduling ranges', () => {
  it('compares slot instants across Singapore month boundaries', async () => {
    vi.setSystemTime(new Date('2026-10-18T00:00:00.000Z'))
    const inside = await mockServices.callables.invoke('createAvailabilitySlot', {
      requestId: crypto.randomUUID(),
      startsAt: '2026-10-31T17:00:00.000Z',
      endsAt: '2026-10-31T17:30:00.000Z',
    })
    const outside = await mockServices.callables.invoke('createAvailabilitySlot', {
      requestId: crypto.randomUUID(),
      startsAt: '2026-11-30T17:00:00.000Z',
      endsAt: '2026-11-30T17:30:00.000Z',
    })
    const range = { startsAt: '2026-11-01T00:00:00+08:00', endsAt: '2026-12-01T00:00:00+08:00' }
    const openListener = vi.fn()
    const mentorListener = vi.fn()

    const stopOpen = mockServices.scheduling.subscribeOpenSlots(range, openListener, vi.fn())
    const stopMentor = mockServices.scheduling.subscribeMentorSlots(inside.slot.mentorId, range, mentorListener, vi.fn())
    const openIds = openListener.mock.lastCall?.[0].map((slot: { id: string }) => slot.id)
    const mentorIds = mentorListener.mock.lastCall?.[0].map((slot: { id: string }) => slot.id)

    expect(openIds).toContain(inside.slot.id)
    expect(openIds).not.toContain(outside.slot.id)
    expect(mentorIds).toContain(inside.slot.id)
    expect(mentorIds).not.toContain(outside.slot.id)
    stopOpen()
    stopMentor()
    vi.useRealTimers()
  })
})
