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
const first: F01HelpRequest = {
  id: 'f02-replay-first', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'First request', description: 'First parent', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const second: F01HelpRequest = { ...first, id: 'f02-replay-second', title: 'Second request' }
const record = (overrides: Partial<ChatRetry> = {}): ChatRetry => ({
  version: 1, uid: student.id, requestId: first.id, messageId: crypto.randomUUID(),
  normalizedBody: 'Original saved intention', localSequence: 1, state: 'uncertain', ...overrides,
})
const saved = (item: ChatRetry, overrides: Partial<F02SavedMessage> = {}): F02SavedMessage => ({
  id: item.messageId, conversationId: item.requestId, senderId: student.id,
  body: item.normalizedBody, createdAt: '2026-10-16T09:01:00.000Z', readAt: null, ...overrides,
})

function mount(request: F01HelpRequest, getMessageFromServer: HelpiNUSServices['conversations']['getMessageFromServer'], sendMessage: (input: SendMessageInput) => Promise<{ message: F02SavedMessage }>) {
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

describe('F02 current-authority retry and retarget (TC-033)', () => {
  beforeEach(() => sessionStorage.clear())

  it('checks the server before automatic replay and clears private state on revoked access', async () => {
    const pending = record()
    saveChatRetry(pending)
    const server = vi.fn(async () => { throw { code: 'permission-denied' } })
    const send = vi.fn(async (input: SendMessageInput) => ({ message: saved(pending, { id: input.messageId }) }))
    mount(first, server, send)
    expect(await screen.findByText(/Conversation access is unavailable/)).toBeInTheDocument()
    expect(server).toHaveBeenCalledWith(first.id, pending.messageId)
    expect(send).not.toHaveBeenCalled()
    expect(loadChatRetries(student.id, first.id)).toEqual([])
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument()
  })

  it('rechecks before manual same-ID retry and does not redispatch after revocation', async () => {
    const calls: string[] = []
    const server = vi.fn(async (requestId: string, messageId: string) => {
      expect(requestId).toBe(first.id)
      expect(messageId).toMatch(/^[0-9a-f-]{36}$/u)
      calls.push('server')
      if (calls.filter((item) => item === 'server').length === 2) throw { code: 'permission-denied' }
      return null
    })
    const send = vi.fn(async (input: SendMessageInput): Promise<{ message: F02SavedMessage }> => {
      expect(input).toMatchObject({ requestId: first.id, body: 'Original saved intention' })
      calls.push('send')
      throw { code: 'unavailable' }
    })
    mount(first, server, send)
    expect(await screen.findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Original saved intention' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText('? Save uncertain')).toBeInTheDocument()
    const sent = send.mock.calls[0]![0]
    expect(calls).toEqual(['server', 'send'])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/Conversation access is unavailable/)).toBeInTheDocument()
    expect(server.mock.calls.map((args) => args)).toEqual([[first.id, sent.messageId], [first.id, sent.messageId]])
    expect(calls).toEqual(['server', 'send', 'server'])
    expect(send).toHaveBeenCalledTimes(1)
    expect(loadChatRetries(student.id, first.id)).toEqual([])
  })

  it.each([
    ['changed body', { body: 'Different saved body' }],
    ['changed actor', { senderId: mentor.id }],
  ])('treats a same-path %s as a definitive ID conflict without callable dispatch', async (_name, changed) => {
    const pending = record()
    saveChatRetry(pending)
    const server = vi.fn(async () => saved(pending, changed))
    const send = vi.fn(async (input: SendMessageInput) => ({ message: saved(pending, { id: input.messageId }) }))
    mount(first, server, send)
    expect(await screen.findByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Message could not be sent.')).toBeInTheDocument()
    expect(server).toHaveBeenCalledWith(first.id, pending.messageId)
    expect(send).not.toHaveBeenCalled()
    expect(loadChatRetries(student.id, first.id)).toEqual([{ ...pending, state: 'failed' }])
  })

  it('treats a mismatched callable reply as a definitive conflict without confirming it', async () => {
    const pending = record()
    saveChatRetry(pending)
    const server = vi.fn(async () => null)
    const send = vi.fn(async () => ({ message: saved(pending, { body: 'Different saved body' }) }))
    mount(first, server, send)
    expect(await screen.findByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Message could not be sent.')).toBeInTheDocument()
    expect(server).toHaveBeenCalledWith(first.id, pending.messageId)
    expect(send).toHaveBeenCalledWith({ requestId: first.id, messageId: pending.messageId, body: pending.normalizedBody })
    expect(screen.queryByText('✓✓ Sent')).not.toBeInTheDocument()
    expect(loadChatRetries(student.id, first.id)).toEqual([{ ...pending, state: 'failed' }])
  })

  it('rejects retargeting a saved ID and sends an edited new intention with a fresh ID on the current parent', async () => {
    const pending = record()
    saveChatRetry(pending)
    expect(() => saveChatRetry({ ...pending, requestId: second.id, normalizedBody: 'Edited new intention' })).toThrow('Message ID is already used for different text.')
    const calls: string[] = []
    const server = vi.fn(async () => { calls.push('server'); return null })
    const send = vi.fn(async (input: SendMessageInput) => { calls.push('send'); return { message: saved(pending, {
      id: input.messageId, conversationId: input.requestId, body: input.body,
    }) } })
    mount(second, server, send)
    expect(await screen.findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    expect(server).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Edited new intention' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    const input = send.mock.calls[0]![0]
    expect(input).toMatchObject({ requestId: second.id, body: 'Edited new intention' })
    expect(input.messageId).not.toBe(pending.messageId)
    expect(server).toHaveBeenCalledWith(second.id, input.messageId)
    expect(calls).toEqual(['server', 'send'])
    expect(loadChatRetries(student.id, first.id)).toEqual([pending])
  })
})
