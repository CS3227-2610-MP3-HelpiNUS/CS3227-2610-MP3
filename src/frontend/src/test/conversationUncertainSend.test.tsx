import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest, F02SavedMessage, SendMessageInput } from '@helpinus/shared'
import { ConversationDetailPage } from '../pages/ConversationPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { createMockCallableClient, mockDashboard, mockServices } from '../services/mockServices'
import { loadChatRetries, saveChatRetry, type ChatRetry } from '../services/chatRetryStore'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const request: F01HelpRequest = {
  id: 'f02-uncertain-parent', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Saved request', description: 'Original context', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}

function saved(input: SendMessageInput): F02SavedMessage {
  return { id: input.messageId, conversationId: input.requestId, senderId: student.id,
    body: input.body, createdAt: '2026-10-16T09:01:00.000Z', readAt: null }
}

function mount(options: {
  getMessageFromServer: HelpiNUSServices['conversations']['getMessageFromServer']
  sendMessage: (input: SendMessageInput) => Promise<{ message: F02SavedMessage }>
  onMessages?: (emit: (messages: F02SavedMessage[]) => void) => void
}) {
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
      subscribeMessages(_id, _cursor, onData) {
        onData([], null)
        options.onMessages?.((messages) => onData(messages, null))
        return () => {}
      },
      getMessageFromServer: options.getMessageFromServer,
    },
    callables: createMockCallableClient({ sendMessage: options.sendMessage }),
  }
  const router = createMemoryRouter([
    { path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> },
  ], { initialEntries: [`/student/conversations/${request.id}`] })
  return render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
}

describe('F02 uncertain send reconciliation (TC-031)', () => {
  beforeEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

  it('keeps Retry until the same-ID server proof wins a dropped-reply and listener race', async () => {
    let committed: F02SavedMessage | null = null
    let emitMessages: ((messages: F02SavedMessage[]) => void) | undefined
    let releaseRead: ((message: F02SavedMessage | null) => void) | undefined
    const server = vi.fn(async () => {
      if (!committed) return null
      return new Promise<F02SavedMessage | null>((resolve) => { releaseRead = resolve })
    })
    const send = vi.fn(async (input: SendMessageInput): Promise<{ message: F02SavedMessage }> => {
      committed = saved(input)
      throw { code: 'unavailable' }
    })
    mount({ getMessageFromServer: server, sendMessage: send, onMessages: (emit) => { emitMessages = emit } })
    expect(await screen.findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'One saved intention' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText('? Save uncertain')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    const input = send.mock.calls[0]![0]
    expect(committed).toEqual(saved(input))
    expect(loadChatRetries(student.id, request.id)).toMatchObject([{ messageId: input.messageId }])

    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(releaseRead).toBeDefined())
    expect(send).toHaveBeenCalledTimes(1)
    emitMessages?.([saved(input)])
    releaseRead?.(saved(input))
    await waitFor(() => expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(1))
    expect(screen.getByText('✓✓ Sent')).toBeInTheDocument()
    expect(screen.queryByText('? Save uncertain')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(loadChatRetries(student.id, request.id)).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
    expect(server).toHaveBeenCalledWith(request.id, input.messageId)
  })

  it('shows server-confirmed Sent despite retry-key deletion failure, then restores without a duplicate send', async () => {
    const item: ChatRetry = {
      version: 1, uid: student.id, requestId: request.id, messageId: crypto.randomUUID(),
      normalizedBody: 'Persisted once', localSequence: 1, state: 'uncertain',
    }
    saveChatRetry(item)
    const storagePrototype = Object.getPrototypeOf(sessionStorage) as Storage
    const originalRemove = storagePrototype.removeItem
    let failRemoval = true
    vi.spyOn(storagePrototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      if (failRemoval && key.endsWith(`:${item.messageId}`)) throw new Error('storage delete failed')
      return originalRemove.call(this, key)
    })
    const persisted = saved({ requestId: request.id, messageId: item.messageId, body: item.normalizedBody })
    const server = vi.fn(async () => persisted)
    const send = vi.fn(async (input: SendMessageInput) => ({ message: saved(input) }))
    const view = mount({ getMessageFromServer: server, sendMessage: send })
    expect(await screen.findByText('✓✓ Sent')).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(1)
    expect(screen.queryByText('? Save uncertain')).not.toBeInTheDocument()
    expect(loadChatRetries(student.id, request.id)).toEqual([item])
    expect(send).not.toHaveBeenCalled()
    view.unmount()

    failRemoval = false
    mount({ getMessageFromServer: server, sendMessage: send })
    expect(await screen.findByText('✓✓ Sent')).toBeInTheDocument()
    await waitFor(() => expect(loadChatRetries(student.id, request.id)).toEqual([]))
    expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(1)
    expect(server).toHaveBeenCalledWith(request.id, item.messageId)
    expect(send).not.toHaveBeenCalled()
  })
})
