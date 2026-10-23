import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
const first: F01HelpRequest = {
  id: 'f02-stale-first', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Old private context', description: 'Old question', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const second: F01HelpRequest = { ...first, id: 'f02-stale-second', title: 'Current private context', description: 'Current question' }
const saved = (input: SendMessageInput): F02SavedMessage => ({
  id: input.messageId, conversationId: input.requestId, senderId: student.id,
  body: input.body, createdAt: '2026-10-16T09:01:00.000Z', readAt: null,
})

function mount(conversations: HelpiNUSServices['conversations'], sendMessage: (input: SendMessageInput) => Promise<{ message: F02SavedMessage }>) {
  const services: HelpiNUSServices = {
    ...mockServices,
    session: {
      ...mockServices.session,
      getCurrent: async () => ({ user: student }),
      subscribe(listener) { listener({ user: student }); return () => {} },
    },
    conversations,
    callables: createMockCallableClient({ sendMessage }),
  }
  const router = createMemoryRouter([
    { path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> },
  ], { initialEntries: [`/student/conversations/${first.id}`] })
  return { router, ...render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>) }
}

describe('F02 stale-context callbacks (TC-039)', () => {
  beforeEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

  it('unsubscribes the old parent and ignores a held server proof after route change without dispatch or cross-parent retry', async () => {
    const item: ChatRetry = {
      version: 1, uid: student.id, requestId: first.id, messageId: crypto.randomUUID(),
      normalizedBody: 'Old intention', localSequence: 1, state: 'uncertain',
    }
    saveChatRetry(item)
    const callbacks = new Map<string, (value: { request: F01HelpRequest } | null) => void>()
    const unsubscriptions = new Map<string, ReturnType<typeof vi.fn>>()
    let releaseServer: ((value: F02SavedMessage | null) => void) | undefined
    const getMessageFromServer = vi.fn(async () => new Promise<F02SavedMessage | null>((resolve) => { releaseServer = resolve }))
    const send = vi.fn(async (input: SendMessageInput) => ({ message: saved(input) }))
    const conversations: HelpiNUSServices['conversations'] = {
      ...mockServices.conversations,
      subscribeDetail(id, onData) {
        callbacks.set(id, onData)
        const unsubscribe = vi.fn()
        unsubscriptions.set(id, unsubscribe)
        onData({ request: id === first.id ? first : second })
        return unsubscribe
      },
      subscribeMessages(_id, _cursor, onData) { onData([], null); return () => {} },
      getMessageFromServer,
    }
    const { router } = mount(conversations, send)
    await waitFor(() => expect(releaseServer).toBeDefined())
    expect(await screen.findAllByText('Old private context')).toHaveLength(2)
    expect(send).not.toHaveBeenCalled()
    await act(async () => { await router.navigate(`/student/conversations/${second.id}`) })
    expect(await screen.findAllByText('Current private context')).toHaveLength(2)
    expect(screen.queryAllByText('Old private context')).toHaveLength(0)
    expect(unsubscriptions.get(first.id)).toHaveBeenCalled()
    act(() => { callbacks.get(first.id)?.({ request: first }); releaseServer?.(null) })
    expect(send).not.toHaveBeenCalled()
    expect(screen.queryByText('Old intention')).not.toBeInTheDocument()
    expect(loadChatRetries(student.id, first.id)).toEqual([item])
    expect(loadChatRetries(student.id, second.id)).toEqual([])
  })

  it('drops a held callable success after navigation while preserving its source retry record', async () => {
    let releaseSend: ((value: { message: F02SavedMessage }) => void) | undefined
    const send = vi.fn(async (input: SendMessageInput) => new Promise<{ message: F02SavedMessage }>((resolve) => {
      releaseSend = (value) => { expect(value.message.id).toBe(input.messageId); resolve(value) }
    }))
    const unsubscriptions = new Map<string, ReturnType<typeof vi.fn>>()
    const conversations: HelpiNUSServices['conversations'] = {
      ...mockServices.conversations,
      subscribeDetail(id, onData) {
        const unsubscribe = vi.fn()
        unsubscriptions.set(id, unsubscribe)
        onData({ request: id === first.id ? first : second })
        return unsubscribe
      },
      subscribeMessages(_id, _cursor, onData) { onData([], null); return () => {} },
      getMessageFromServer: async () => null,
    }
    const { router } = mount(conversations, send)
    expect(await screen.findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Held old send' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(releaseSend).toBeDefined())
    const input = send.mock.calls[0]![0]
    await act(async () => { await router.navigate(`/student/conversations/${second.id}`) })
    expect(unsubscriptions.get(first.id)).toHaveBeenCalled()
    act(() => releaseSend?.({ message: saved(input) }))
    expect(screen.queryByText('Held old send')).not.toBeInTheDocument()
    expect(screen.queryByText('✓✓ Sent')).not.toBeInTheDocument()
    expect(loadChatRetries(student.id, first.id)).toMatchObject([{ messageId: input.messageId }])
    expect(loadChatRetries(student.id, second.id)).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
  })
})
