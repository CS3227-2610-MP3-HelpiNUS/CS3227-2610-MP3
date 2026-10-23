import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closeHelpRequestInputSchema, createHelpRequestInputSchema, respondToHelpRequestInputSchema, updateOwnMentorProfileInputSchema } from '@helpinus/shared'

const sdk = vi.hoisted(() => ({ httpsCallable: vi.fn() }))
vi.mock('../services/firebase', () => ({ firebase: { auth: {}, firestore: {}, functions: {} } }))
vi.mock('../services/firebaseConfig', () => ({ firebaseEnvironment: 'development', isEmulatorConnectionAllowed: () => false }))
vi.mock('firebase/functions', () => ({ httpsCallable: sdk.httpsCallable }))

import { firebaseServices } from '../services/firebaseServices'

describe('help request identity callable adapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forwards four distinct ID contracts without rewriting legacy consumers', async () => {
    const operationId = 'b70f16a0-5010-4a53-95d7-718e396090a5'
    const requestId = '43c741ab-2dbe-46cc-824f-1ba21f844441'
    const helpRequestId = 'server-generated-help-request'
    const create = { operationId, mentorId: 'mentor-1', moduleId: 'cs2103t', title: 'Question', description: 'Explain this topic' }
    const respond = { operationId, helpRequestId, response: 'REJECTED' as const }
    const update = { requestId, baseline: { revision: 0, updateTime: '1:000000000' }, biography: 'Updated', moduleIds: ['cs2103t'] }
    const close = { requestId, helpRequestId }
    const helpRequest = {
      id: helpRequestId, studentId: 'student-1', mentorId: 'mentor-1', moduleId: 'cs2103t',
      title: 'Question', description: 'Explain this topic', status: 'CLOSED',
      createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
    }
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: { kind: 'duplicate', existingHelpRequestId: helpRequestId, currentStatus: 'PENDING' } })
      .mockResolvedValueOnce({ data: { kind: 'conflict', actualStatus: 'ACCEPTED' } })
      .mockResolvedValueOnce({ data: { kind: 'accepted', stored: { biography: 'Updated', moduleIds: ['cs2103t'], revision: 1 } } })
      .mockResolvedValueOnce({ data: { helpRequest } })
    sdk.httpsCallable.mockReturnValue(invoke)

    await expect(firebaseServices.callables.invoke('createHelpRequest', create)).resolves.toMatchObject({ kind: 'duplicate', existingHelpRequestId: helpRequestId })
    await expect(firebaseServices.callables.invoke('respondToHelpRequest', respond)).resolves.toEqual({ kind: 'conflict', actualStatus: 'ACCEPTED' })
    await expect(firebaseServices.callables.invoke('updateOwnMentorProfile', update)).resolves.toMatchObject({ kind: 'accepted' })
    await expect(firebaseServices.callables.invoke('closeHelpRequest', close)).resolves.toEqual({ helpRequest })

    expect(createHelpRequestInputSchema.parse(create)).toEqual(create)
    expect(respondToHelpRequestInputSchema.parse(respond)).toEqual(respond)
    expect(updateOwnMentorProfileInputSchema.parse(update)).toEqual(update)
    expect(closeHelpRequestInputSchema.parse(close)).toEqual(close)
    expect(sdk.httpsCallable.mock.calls.map((call) => call[1])).toEqual([
      'createHelpRequest', 'respondToHelpRequest', 'updateOwnMentorProfile', 'closeHelpRequest',
    ])
    expect(invoke.mock.calls.map(([input]) => input)).toEqual([create, respond, update, close])
  })
})
