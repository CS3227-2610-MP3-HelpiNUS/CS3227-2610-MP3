import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest, F02SavedMessage } from '@helpinus/shared'
import { ConversationDetailPage, ConversationListPage } from '../pages/ConversationPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { ChatCursor, HelpiNUSServices } from '../services/contracts'
import { createMockCallableClient, mockDashboard, mockServices } from '../services/mockServices'
import { loadChatRetries, saveChatRetry, type ChatRetry } from '../services/chatRetryStore'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const accepted: F01HelpRequest = { id: 'f02-request', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t', studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName, title: 'Sequence diagrams', description: 'Line one\nLine two', status: 'ACCEPTED', createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z' }
const saved: F02SavedMessage = { id: crypto.randomUUID(), conversationId: accepted.id, senderId: student.id, body: 'Saved message', createdAt: '2026-10-16T09:01:00.000Z', readAt: null }
const cursor: ChatCursor = { seconds: 1, nanoseconds: 2, id: 'older' }

function servicesFor(role: 'student' | 'mentor', overrides: Partial<HelpiNUSServices> = {}): HelpiNUSServices {
  const user = role === 'student' ? student : mentor
  return { ...mockServices, session: { ...mockServices.session, getCurrent: async () => ({ user }), subscribe(listener) { listener({ user }); return () => {} } }, ...overrides }
}
function mount(path: string, services: HelpiNUSServices) {
  const router = createMemoryRouter([
    { path: '/student/conversations', element: <ConversationListPage role="student" /> },
    { path: '/mentor/conversations', element: <ConversationListPage role="mentor" /> },
    { path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> },
    { path: '/mentor/conversations/:requestId', element: <ConversationDetailPage role="mentor" /> },
  ], { initialEntries: [path] })
  return { router, ...render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>) }
}

describe('F02 conversation screens', () => {
  beforeEach(() => sessionStorage.clear())
  it('uses a compact chat context and an accessible icon composer that grows for multiline text', async () => {
    const user = userEvent.setup()
    mount('/student/conversations/f02-request', servicesFor('student', { conversations: {
      ...mockServices.conversations,
      subscribeDetail(_id, onData) { onData({ request: accepted }); return () => {} },
      subscribeMessages(_id, _cursor, onData) { onData([], null); return () => {} },
    } }))
    expect(await screen.findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    expect(document.querySelector('.chat-context summary')).toHaveTextContent('Sequence diagrams')
    expect(screen.getByRole('link', { name: 'Back to conversations' })).toHaveAttribute('href', '/student/conversations')
    expect(screen.getByRole('link', { name: 'Back to conversations' }).closest('.chat-header')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: `Conversation with ${mentor.displayName}` })).toHaveClass('visually-hidden')
    expect(document.querySelector('.chat-page-detail .page-heading')).toBeNull()
    await user.click(screen.getByText('Request context'))
    expect(screen.getByRole('region', { name: 'Request details' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('region', { name: 'Request details' })).toHaveTextContent('Sequence diagrams')
    const field = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
    expect(screen.queryByText('Message')).not.toBeInTheDocument()
    expect(field).toHaveAttribute('rows', '1')
    const send = screen.getByRole('button', { name: 'Send message' })
    expect(send.querySelector('svg')).not.toBeNull()
    expect(send).toHaveTextContent('')
    Object.defineProperty(field, 'scrollHeight', { configurable: true, get: () => 240 })
    await user.type(field, 'Line one{Enter}Line two')
    expect(field).toHaveValue('Line one\nLine two')
    expect(field.style.height).toBe('168px')
    expect(field.style.overflowY).toBe('auto')
  })
  it('shows only validated rows and loads a bounded older owner page', async () => {
    const subscribe = vi.fn<HelpiNUSServices['conversations']['subscribeList']>((_uid, _role, page, onData) => {
      onData(page ? [{ kind: 'support_needed', requestId: 'broken', acceptedAt: '2026-10-15T09:00:00.000Z' }] : [{ kind: 'ready', request: accepted }], page ? null : cursor)
      return () => {}
    })
    mount('/student/conversations', servicesFor('student', { conversations: { ...mockServices.conversations, subscribeList: subscribe } }))
    const open = await screen.findByRole('link', { name: 'Open conversation' })
    expect(open).toHaveAttribute('href', '/student/conversations/f02-request')
    expect(open).toHaveClass('button', 'button-primary')
    expect(screen.getByText('Request')).toBeInTheDocument()
    expect(screen.getByText('Mentor')).toBeInTheDocument()
    expect(screen.getByText(mentor.displayName)).toBeInTheDocument()
    expect(screen.getByText('Module')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Conversation needs support')).toBeInTheDocument()
    expect(subscribe).toHaveBeenCalledWith(student.id, 'STUDENT', cursor, expect.any(Function), expect.any(Function))
  })
  it('keeps a back control in the Mentor chat header when detail access fails', async () => {
    mount('/mentor/conversations/f02-request', servicesFor('mentor', { conversations: {
      ...mockServices.conversations,
      subscribeDetail(_id, _onData, onError) { onError({ code: 'permission-denied' }); return () => {} },
    } }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Conversation access is unavailable')
    const back = screen.getByRole('link', { name: 'Back to conversations' })
    expect(back).toHaveAttribute('href', '/mentor/conversations')
    expect(back.closest('.chat-header')).toBeInTheDocument()
  })
  it('discards late detail callbacks after navigating to another request', async () => {
    const callbacks = new Map<string, (value: { request: F01HelpRequest } | null) => void>()
    const detail = vi.fn<HelpiNUSServices['conversations']['subscribeDetail']>((id, onData) => { callbacks.set(id, onData); return () => {} })
    const { router } = mount('/student/conversations/f02-request', servicesFor('student', { conversations: { ...mockServices.conversations, subscribeDetail: detail } }))
    await waitFor(() => expect(callbacks.has('f02-request')).toBe(true))
    await act(async () => { await router.navigate('/student/conversations/other-request') })
    act(() => callbacks.get('f02-request')?.({ request: accepted }))
    expect(screen.queryByText('Line one')).not.toBeInTheDocument()
  })
  it('renders persisted text literally and acknowledges only a visible recipient message', async () => {
    const incoming = { ...saved, senderId: mentor.id, body: '<img src=x onerror=alert(1)>\nSecond line' }
    const acknowledge = vi.fn(async () => ({ readAt: '2026-10-16T09:02:00.000Z' }))
    const callbacks: Array<(entries: IntersectionObserverEntry[]) => void> = []
    class TestObserver {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) { callbacks.push(callback) }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', TestObserver)
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    mount('/student/conversations/f02-request', servicesFor('student', {
      conversations: { ...mockServices.conversations, subscribeDetail(_id, onData) { onData({ request: accepted }); return () => {} }, subscribeMessages(_id, _cursor, onData) { onData([incoming], null); return () => {} } },
      callables: createMockCallableClient({ acknowledgeMessage: acknowledge }),
    }))
    expect(await screen.findByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument()
    expect(document.querySelector('img[src="x"]')).toBeNull()
    const bubble = document.querySelector(`[data-message-id="${incoming.id}"]`)
    expect(bubble).not.toBeNull()
    expect(acknowledge).not.toHaveBeenCalled()
    await waitFor(() => expect(callbacks.length).toBeGreaterThan(0))
    act(() => callbacks.at(-1)?.([{ isIntersecting: true, target: bubble } as IntersectionObserverEntry]))
    await waitFor(() => expect(acknowledge).toHaveBeenCalledWith({ requestId: accepted.id, messageId: incoming.id }))
    hasFocus.mockRestore(); vi.unstubAllGlobals()
  })
  it('retains a bounded live page for a message evicted by a newer arrival', async () => {
    const initial = Array.from({ length: 20 }, (_, index): F02SavedMessage => ({
      ...saved, id: crypto.randomUUID(), createdAt: new Date(Date.parse(saved.createdAt) - index * 1000).toISOString(),
    }))
    const shiftedCursor: ChatCursor = { seconds: 3, nanoseconds: 4, id: initial[18]!.id }
    let emitLive: ((messages: F02SavedMessage[], next: ChatCursor | null) => void) | null = null
    const subscribe = vi.fn<HelpiNUSServices['conversations']['subscribeMessages']>((_id, page, onData) => {
      if (page === null) { emitLive = onData; onData(initial, cursor) }
      else onData([initial[19]!], null)
      return () => {}
    })
    mount('/student/conversations/f02-request', servicesFor('student', { conversations: {
      ...mockServices.conversations,
      subscribeDetail(_id, onData) { onData({ request: accepted }); return () => {} },
      subscribeMessages: subscribe,
    } }))
    await waitFor(() => expect(emitLive).not.toBeNull())
    act(() => { emitLive?.([{ ...saved, id: crypto.randomUUID(), createdAt: '2026-10-16T09:02:00.000Z' }, ...initial.slice(0, 19)], shiftedCursor) })
    await waitFor(() => expect(subscribe).toHaveBeenCalledWith(accepted.id, shiftedCursor, expect.any(Function), expect.any(Function)))
    expect(screen.getAllByText(initial[19]!.body)).toHaveLength(21)
  })
  it('reconciles a restored send by server ID before reusing its original ID', async () => {
    const pending: ChatRetry = { version: 1, uid: student.id, requestId: accepted.id, messageId: crypto.randomUUID(), normalizedBody: 'Recover this', localSequence: 1, state: 'uncertain' }
    saveChatRetry(pending)
    const serverRead = vi.fn(async () => null)
    const send = vi.fn(async () => ({ message: { ...saved, id: pending.messageId, body: pending.normalizedBody } }))
    mount('/student/conversations/f02-request', servicesFor('student', {
      conversations: { ...mockServices.conversations, subscribeDetail(_id, onData) { onData({ request: accepted }); return () => {} }, subscribeMessages(_id, _cursor, onData) { onData([], null); return () => {} }, getMessageFromServer: serverRead },
      callables: createMockCallableClient({ sendMessage: send }),
    }))
    await waitFor(() => expect(send).toHaveBeenCalledWith({ requestId: accepted.id, messageId: pending.messageId, body: pending.normalizedBody }))
    expect(serverRead).toHaveBeenCalledWith(accepted.id, pending.messageId)
    expect(await screen.findByText('Recover this')).toBeInTheDocument()
    await waitFor(() => expect(loadChatRetries(student.id, accepted.id)).toEqual([]))
  })
  it('clears private retry records when a message listener loses permission', async () => {
    const pending: ChatRetry = { version: 1, uid: student.id, requestId: accepted.id, messageId: crypto.randomUUID(), normalizedBody: 'Private pending', localSequence: 1, state: 'uncertain' }
    let failMessages: ((error: unknown) => void) | null = null
    mount('/student/conversations/f02-request', servicesFor('student', { conversations: {
      ...mockServices.conversations,
      subscribeDetail(_id, onData) { onData({ request: accepted }); return () => {} },
      subscribeMessages(_id, _cursor, onData, onError) { failMessages = onError; onData([], null); return () => {} },
    } }))
    await waitFor(() => expect(failMessages).not.toBeNull())
    saveChatRetry(pending)
    act(() => failMessages?.({ code: 'permission-denied' }))
    expect(await screen.findByText(/Conversation access is unavailable/)).toBeInTheDocument()
    expect(loadChatRetries(student.id, accepted.id)).toEqual([])
    expect(screen.queryByText('Private pending')).not.toBeInTheDocument()
  })
})
