import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest, F02SavedMessage, SendMessageInput } from '@helpinus/shared'
import { ConversationDetailPage } from '../pages/ConversationPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { mockDashboard, mockServices, createMockCallableClient } from '../services/mockServices'
import { loadChatRetries, saveChatRetry, type ChatRetry } from '../services/chatRetryStore'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0]!.user
const parent: F01HelpRequest = {
  id: 'f02-send-order', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Send ordering', description: 'Accepted parent', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const saved = (input: SendMessageInput, millis: number, readAt: string | null = null): F02SavedMessage => ({
  id: input.messageId, conversationId: parent.id, senderId: student.id, body: input.body,
  createdAt: new Date(millis).toISOString(), readAt,
})
const baseTime = Date.parse('2026-10-16T09:01:00.000Z')

function mount(options: {
  server: HelpiNUSServices['conversations']['getMessageFromServer']
  send: (input: SendMessageInput) => Promise<{ message: F02SavedMessage }>
}) {
  let emitMessages: ((items: F02SavedMessage[], next: null) => void) | undefined
  const services: HelpiNUSServices = {
    ...mockServices,
    session: { ...mockServices.session, getCurrent: async () => ({ user: student }), subscribe(onData) { onData({ user: student }); return () => {} } },
    conversations: {
      ...mockServices.conversations,
      subscribeDetail(_id, onData) { onData({ request: parent }); return () => {} },
      subscribeMessages(_id, _cursor, onData) { emitMessages = onData; onData([], null); return () => {} },
      getMessageFromServer: options.server,
    },
    callables: createMockCallableClient({ sendMessage: options.send }),
  }
  const router = createMemoryRouter([{ path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> }], { initialEntries: [`/student/conversations/${parent.id}`] })
  const ui = render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
  return { ...ui, emit: (items: F02SavedMessage[]) => act(() => emitMessages?.(items, null)) }
}

describe('F02 authoritative saved order and retry reconciliation (TC-021/022)', () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks() })

  it('keeps three unresolved sends after saved history in local order, then collapses out-of-order callbacks by server time and ID', async () => {
    const requests: SendMessageInput[] = []
    const releases = new Map<string, (value: { message: F02SavedMessage }) => void>()
    const send = vi.fn(async (input: SendMessageInput) => {
      requests.push(input)
      return new Promise<{ message: F02SavedMessage }>((resolve) => { releases.set(input.body, resolve) })
    })
    const f = mount({ server: async () => null, send })
    expect(await screen.findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    const field = screen.getByRole('textbox', { name: 'Message' })
    for (const body of ['First intention', 'Second intention', 'Third intention']) {
      fireEvent.change(field, { target: { value: body } })
      await userEvent.setup().click(screen.getByRole('button', { name: 'Send message' }))
    }
    await waitFor(() => expect(send).toHaveBeenCalledTimes(3))
    expect(requests.map((item) => item.body)).toEqual(['First intention', 'Second intention', 'Third intention'])
    expect(screen.getAllByRole('group', { name: 'Your pending message' }).map((node) => node.querySelector('.chat-body')?.textContent)).toEqual(requests.map((item) => item.body))
    const third = saved(requests[2]!, baseTime + 1000)
    f.emit([third])
    expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(1)
    expect(screen.getAllByRole('group', { name: 'Your pending message' }).map((node) => node.querySelector('.chat-body')?.textContent)).toEqual(['First intention', 'Second intention'])
    act(() => releases.get('Third intention')?.({ message: third }))
    const first = saved(requests[0]!, baseTime + 3000)
    act(() => releases.get('First intention')?.({ message: first }))
    await waitFor(() => expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(2))
    expect(screen.getAllByRole('group', { name: 'Your pending message' })).toHaveLength(1)
    const second = saved(requests[1]!, baseTime + 2000)
    f.emit([first, second, third])
    act(() => releases.get('Second intention')?.({ message: second }))
    await waitFor(() => expect(screen.queryAllByRole('group', { name: 'Your pending message' })).toHaveLength(0))
    expect(screen.getAllByRole('group', { name: 'Your message' }).map((node) => node.querySelector('.chat-body')?.textContent)).toEqual(['Third intention', 'Second intention', 'First intention'])
    expect(document.querySelectorAll('[data-message-id]')).toHaveLength(3)
    expect(new Set(requests.map((item) => item.messageId)).size).toBe(3)
    f.emit([saved(requests[0]!, baseTime + 3000, new Date(baseTime + 4000).toISOString()), second, third])
    expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(3)
    expect(screen.getByText('✓✓ Read')).toBeInTheDocument()
  })

  it('reconciles one saved and one unresolved original ID across reload and live-page merge without duplicates', async () => {
    const confirmedInput: SendMessageInput = { requestId: parent.id, messageId: crypto.randomUUID(), body: 'Already saved intention' }
    const unresolvedInput: SendMessageInput = { requestId: parent.id, messageId: crypto.randomUUID(), body: 'Still unresolved intention' }
    const confirmed = saved(confirmedInput, baseTime)
    const items: ChatRetry[] = [confirmedInput, unresolvedInput].map((input, index) => ({
      version: 1, uid: student.id, requestId: parent.id, messageId: input.messageId,
      normalizedBody: input.body, localSequence: index + 1, state: 'uncertain',
    }))
    items.forEach(saveChatRetry)
    const server = vi.fn(async (_requestId: string, messageId: string) => {
      if (messageId === confirmedInput.messageId) return confirmed
      throw { code: 'unavailable' }
    })
    const send = vi.fn(async (input: SendMessageInput) => ({ message: saved(input, baseTime + 1000) }))
    const first = mount({ server, send })
    expect(await screen.findByText(confirmed.body)).toBeInTheDocument()
    expect(await screen.findByText(unresolvedInput.body)).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(1)
    expect(screen.getAllByRole('group', { name: 'Your pending message' })).toHaveLength(1)
    expect(send).not.toHaveBeenCalled()
    expect(loadChatRetries(student.id, parent.id)).toEqual([items[1]])
    first.unmount()

    let allowServer = false
    const reconnected = mount({
      server: async (_requestId, messageId) => messageId === confirmedInput.messageId ? confirmed : allowServer ? null : Promise.reject({ code: 'unavailable' }),
      send,
    })
    expect(await screen.findByText(unresolvedInput.body)).toBeInTheDocument()
    expect(send).not.toHaveBeenCalled()
    allowServer = true
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0]![0]).toEqual(unresolvedInput)
    const recovered = saved(unresolvedInput, baseTime + 1000)
    reconnected.emit([recovered, confirmed])
    await waitFor(() => expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(2))
    expect(screen.queryAllByRole('group', { name: 'Your pending message' })).toHaveLength(0)
    expect(document.querySelectorAll('[data-message-id]')).toHaveLength(2)
    expect(loadChatRetries(student.id, parent.id)).toEqual([])
  })
})
