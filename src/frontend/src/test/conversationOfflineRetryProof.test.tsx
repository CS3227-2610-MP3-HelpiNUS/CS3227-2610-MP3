import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest, F02SavedMessage, SendMessageInput } from '@helpinus/shared'
import { ConversationDetailPage } from '../pages/ConversationPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { createMockCallableClient, mockDashboard, mockServices } from '../services/mockServices'
import { loadChatRetries } from '../services/chatRetryStore'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const request: F01HelpRequest = {
  id: 'f02-offline-retry-parent', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Saved request', description: 'Current parent', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const saved = (input: SendMessageInput): F02SavedMessage => ({
  id: input.messageId, conversationId: input.requestId, senderId: student.id,
  body: input.body, createdAt: '2026-10-16T09:01:00.000Z', readAt: null,
})

function mount(
  getMessageFromServer: HelpiNUSServices['conversations']['getMessageFromServer'],
  sendMessage: (input: SendMessageInput) => Promise<{ message: F02SavedMessage }>,
) {
  const services: HelpiNUSServices = {
    ...mockServices,
    session: {
      ...mockServices.session,
      getCurrent: async () => ({ user: student }),
      subscribe(listener) { listener({ user: student }); return () => {} },
    },
    conversations: {
      ...mockServices.conversations,
      subscribeDetail(_id, onData) { onData({ request }); return () => {} },
      subscribeMessages(_id, _cursor, onData) { onData([], null); return () => {} },
      getMessageFromServer,
    },
    callables: createMockCallableClient({ sendMessage }),
  }
  const router = createMemoryRouter([{ path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> }], { initialEntries: [`/student/conversations/${request.id}`] })
  return render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
}

describe('F02 offline same-ID retry record (TC-032)', () => {
  beforeEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

  it('keeps the original retry record through a precommit lost reply and offline restore, then sends once after fresh server absence', async () => {
    const order: string[] = []
    let connected = true
    let persisted: F02SavedMessage | null = null
    const server = vi.fn(async () => {
      order.push(connected ? 'server-online' : 'server-offline')
      if (!connected) throw { code: 'unavailable' }
      return persisted
    })
    let firstAttempt = true
    const send = vi.fn(async (input: SendMessageInput): Promise<{ message: F02SavedMessage }> => {
      order.push('send')
      if (firstAttempt) { firstAttempt = false; throw { code: 'unavailable' } }
      persisted = saved(input)
      return { message: persisted }
    })
    const firstView = mount(server, send)
    expect(await screen.findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'One preserved intention' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText('? Save uncertain')).toBeInTheDocument()
    const input = send.mock.calls[0]![0]
    expect(input).toMatchObject({ requestId: request.id, body: 'One preserved intention' })
    expect(persisted).toBeNull()
    expect(order).toEqual(['server-online', 'send'])
    const retry = loadChatRetries(student.id, request.id)
    expect(retry).toMatchObject([{ messageId: input.messageId, normalizedBody: input.body, state: 'uncertain' }])
    firstView.unmount()

    connected = false
    const offlineView = mount(server, send)
    expect(await screen.findByText('? Save uncertain')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(send).toHaveBeenCalledTimes(1)
    expect(loadChatRetries(student.id, request.id)).toEqual(retry)
    expect(order).toEqual(['server-online', 'send', 'server-offline'])
    offlineView.unmount()

    connected = true
    mount(server, send)
    expect(await screen.findByText('✓✓ Sent')).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(1)
    expect(screen.queryByText('? Save uncertain')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1]![0]).toEqual(input)
    expect(order).toEqual(['server-online', 'send', 'server-offline', 'server-online', 'send'])
    await waitFor(() => expect(loadChatRetries(student.id, request.id)).toEqual([]))
  })
})
