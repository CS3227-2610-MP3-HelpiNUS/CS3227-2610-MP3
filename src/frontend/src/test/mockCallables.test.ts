import { describe, expect, it } from 'vitest'
import {
  createMockCallableClient,
  MockCallableUnavailableError,
} from '../services/mockServices'

describe('mock callable client', () => {
  it('returns a typed fixture without requiring a Functions implementation', async () => {
    const client = createMockCallableClient({
      createAvailabilitySlot: async ({ requestId, startsAt, endsAt }) => ({ slot: { id: `slot-${requestId}`, mentorId: 'mentor-1', mentorDisplayName: 'Mentor One', startsAt, endsAt, status: 'OPEN', appointmentId: null, createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z' } }),
    })

    await expect(client.invoke('createAvailabilitySlot', {
      requestId: '00000000-0000-4000-8000-000000000001',
      startsAt: '2026-10-20T02:00:00.000Z',
      endsAt: '2026-10-20T03:00:00.000Z',
    })).resolves.toMatchObject({ slot: { id: 'slot-00000000-0000-4000-8000-000000000001', status: 'OPEN' } })
  })

  it('fails explicitly when a callable has no fixture', async () => {
    const client = createMockCallableClient()

    await expect(client.invoke('closeHelpRequest', {
      requestId: '00000000-0000-4000-8000-000000000002',
      helpRequestId: 'request-1',
    })).rejects.toEqual(expect.objectContaining<Partial<MockCallableUnavailableError>>({
      name: 'MockCallableUnavailableError',
      callableName: 'closeHelpRequest',
    }))
  })
})
