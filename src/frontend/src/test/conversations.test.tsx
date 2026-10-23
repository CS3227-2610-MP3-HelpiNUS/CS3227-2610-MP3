import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest, F02SavedMessage, SendMessageInput } from '@helpinus/shared'
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
  it('applies the shared outer-trim and Unicode boundary before dispatch (F02-TC-024)', async () => {
    const send = vi.fn(async (input: SendMessageInput) => ({ message: {
      id: input.messageId, conversationId: input.requestId, senderId: student.id,
      body: input.body, createdAt: saved.createdAt, readAt: null,
    } }))
    mount('/student/conversations/f02-request', servicesFor('student', {
      conversations: {
        ...mockServices.conversations,
        subscribeDetail(_id, onData) { onData({ request: accepted }); return () => {} },
        subscribeMessages(_id, _cursor, onData) { onData([], null); return () => {} },
      },
      callables: createMockCallableClient({ sendMessage: send }),
    }))
    expect(await screen.findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    const field = screen.getByRole('textbox', { name: 'Message' })
    const button = screen.getByRole('button', { name: 'Send message' })
    for (const invalid of ['', ' \t\n ', `  ${'a'.repeat(3999)}😀😀  `]) {
      fireEvent.change(field, { target: { value: invalid } })
      await userEvent.setup().click(button)
      expect(screen.getByRole('alert')).toHaveTextContent('Enter 1 to 4,000 characters. Outer spaces are removed.')
      expect(send).not.toHaveBeenCalled()
    }
    const boundary = `${'a'.repeat(3999)}😀`
    fireEvent.change(field, { target: { value: `  ${boundary}  ` } })
    await userEvent.setup().click(button)
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0]![0]).toMatchObject({ requestId: accepted.id, body: boundary })
    const multiline = 'First  line\n\n  Second line'
    fireEvent.change(field, { target: { value: `  ${multiline}  ` } })
    await userEvent.setup().click(button)
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(send.mock.calls[1]![0]).toMatchObject({ requestId: accepted.id, body: multiline })
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
  it('shows only generic support and no chat entry for an accepted request lacking its pair in both roles (F02-TC-008)', async () => {
    for (const role of ['student', 'mentor'] as const) {
      const subscribeList = vi.fn<HelpiNUSServices['conversations']['subscribeList']>((_uid, _role, _cursor, onData) => {
        onData([{ kind: 'support_needed', requestId: accepted.id, acceptedAt: accepted.updatedAt }], null)
        return () => {}
      })
      const subscribeDetail = vi.fn<HelpiNUSServices['conversations']['subscribeDetail']>((_id, onData) => {
        onData(null)
        return () => {}
      })
      const services = servicesFor(role, { conversations: { ...mockServices.conversations, subscribeList, subscribeDetail } })
      const list = mount(`/${role}/conversations`, services)
      expect(await screen.findByText('Conversation needs support')).toBeInTheDocument()
      expect(screen.getByText('This conversation needs support review. Contact HelpiNUS support.')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Open conversation' })).not.toBeInTheDocument()
      expect(screen.queryByText(accepted.title)).not.toBeInTheDocument()
      expect(subscribeList).toHaveBeenCalledWith(role === 'student' ? student.id : mentor.id, role === 'student' ? 'STUDENT' : 'MENTOR', null, expect.any(Function), expect.any(Function))
      list.unmount()

      const detail = mount(`/${role}/conversations/${accepted.id}`, services)
      expect(await screen.findByRole('alert')).toHaveTextContent('This conversation needs support review.')
      expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument()
      expect(subscribeDetail).toHaveBeenCalledWith(accepted.id, expect.any(Function), expect.any(Function))
      detail.unmount()
    }
  })
  it('keeps list error and partial states distinct, then clears private rows on denial (F02-TC-015, 036, 039)', async () => {
    let emit: ((rows: Array<{ kind: 'ready'; request: F01HelpRequest }>, next: ChatCursor | null) => void) | null = null
    let fail: ((error: unknown) => void) | null = null
    const unsubscribe = vi.fn()
    const subscribe = vi.fn<HelpiNUSServices['conversations']['subscribeList']>((_uid, _role, _page, onData, onError) => {
      emit = onData as typeof emit; fail = onError; return unsubscribe
    })
    mount('/student/conversations', servicesFor('student', { conversations: { ...mockServices.conversations, subscribeList: subscribe } }))
    expect(await screen.findByText('Loading conversations…')).toBeInTheDocument()
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1))
    act(() => fail?.({ code: 'unavailable' }))
    expect(await screen.findByText(/Conversation access is unavailable/)).toBeInTheDocument()
    expect(screen.queryByText('No accepted conversations yet.')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2))
    act(() => emit?.([{ kind: 'ready', request: accepted }], null))
    expect(await screen.findByText('Sequence diagrams')).toBeInTheDocument()
    act(() => fail?.({ code: 'unavailable' }))
    expect(await screen.findByText(/may be out of date/)).toBeInTheDocument()
    expect(screen.getByText('Sequence diagrams')).toBeInTheDocument()
    act(() => fail?.({ code: 'permission-denied' }))
    expect(await screen.findByText(/Conversation access is unavailable/)).toBeInTheDocument()
    expect(screen.queryByText('Sequence diagrams')).not.toBeInTheDocument()
    act(() => emit?.([{ kind: 'ready', request: accepted }], null))
    expect(screen.queryByText('Sequence diagrams')).not.toBeInTheDocument()
    expect(unsubscribe).toHaveBeenCalled()
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
  it('ignores a held detail callback after access denial (F02-TC-036, 039)', async () => {
    let emit: ((value: { request: F01HelpRequest } | null) => void) | null = null
    let fail: ((error: unknown) => void) | null = null
    const unsubscribe = vi.fn()
    mount('/student/conversations/f02-request', servicesFor('student', { conversations: {
      ...mockServices.conversations,
      subscribeDetail(_id, onData, onError) { emit = onData; fail = onError; onData({ request: accepted }); return unsubscribe },
      subscribeMessages(_id, _cursor, onData) { onData([], null); return () => {} },
    } }))
    expect(await screen.findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    act(() => fail?.({ code: 'permission-denied' }))
    expect(await screen.findByText(/Conversation access is unavailable/)).toBeInTheDocument()
    act(() => emit?.({ request: accepted }))
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument()
    expect(unsubscribe).toHaveBeenCalled()
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
  it('restores saved and unresolved intentions separately without duplicating either (F02-TC-022)', async () => {
    const savedRecord: ChatRetry = { version: 1, uid: student.id, requestId: accepted.id, messageId: crypto.randomUUID(), normalizedBody: 'Already saved', localSequence: 1, state: 'uncertain' }
    const unresolvedRecord: ChatRetry = { ...savedRecord, messageId: crypto.randomUUID(), normalizedBody: 'Still uncertain', localSequence: 2 }
    saveChatRetry(savedRecord); saveChatRetry(unresolvedRecord)
    const persisted = { ...saved, id: savedRecord.messageId, body: savedRecord.normalizedBody }
    const getMessageFromServer = vi.fn(async (_requestId: string, messageId: string) => messageId === savedRecord.messageId ? persisted : null)
    const send = vi.fn(async () => ({ message: { ...saved, id: unresolvedRecord.messageId, body: unresolvedRecord.normalizedBody } }))
    mount('/student/conversations/f02-request', servicesFor('student', {
      conversations: {
        ...mockServices.conversations,
        subscribeDetail(_id, onData) { onData({ request: accepted }); return () => {} },
        subscribeMessages(_id, _cursor, onData) { onData([persisted], null); return () => {} },
        getMessageFromServer,
      },
      callables: createMockCallableClient({ sendMessage: send }),
    }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send).toHaveBeenCalledWith({ requestId: accepted.id, messageId: unresolvedRecord.messageId, body: unresolvedRecord.normalizedBody })
    expect(getMessageFromServer).toHaveBeenCalledWith(accepted.id, savedRecord.messageId)
    expect(screen.getAllByText('Already saved')).toHaveLength(1)
    expect(screen.getAllByText('Still uncertain')).toHaveLength(1)
    await waitFor(() => expect(loadChatRetries(student.id, accepted.id)).toEqual([]))
  })
  it('keeps a restored send uncertain when authoritative server proof is unavailable (F02-TC-032)', async () => {
    const pending: ChatRetry = { version: 1, uid: student.id, requestId: accepted.id, messageId: crypto.randomUUID(), normalizedBody: 'Offline intention', localSequence: 1, state: 'uncertain' }
    saveChatRetry(pending)
    const serverRead = vi.fn(async () => { throw { code: 'unavailable' } })
    const send = vi.fn(async () => ({ message: saved }))
    mount('/student/conversations/f02-request', servicesFor('student', {
      conversations: {
        ...mockServices.conversations,
        subscribeDetail(_id, onData) { onData({ request: accepted }); return () => {} },
        subscribeMessages(_id, _cursor, onData) { onData([], null); return () => {} },
        getMessageFromServer: serverRead,
      },
      callables: createMockCallableClient({ sendMessage: send }),
    }))
    expect(await screen.findByText('Offline intention')).toBeInTheDocument()
    await waitFor(() => expect(serverRead).toHaveBeenCalledWith(accepted.id, pending.messageId))
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText('? Save uncertain')).toBeInTheDocument()
    expect(loadChatRetries(student.id, accepted.id)).toEqual([{ ...pending, state: 'uncertain' }])
  })
  it('clears private retry records when a message listener loses permission', async () => {
    const pending: ChatRetry = { version: 1, uid: student.id, requestId: accepted.id, messageId: crypto.randomUUID(), normalizedBody: 'Private pending', localSequence: 1, state: 'uncertain' }
    let failMessages: ((error: unknown) => void) | null = null
    let emitDetail: ((value: { request: F01HelpRequest } | null) => void) | null = null
    const unsubscribeDetail = vi.fn()
    mount('/student/conversations/f02-request', servicesFor('student', { conversations: {
      ...mockServices.conversations,
      subscribeDetail(_id, onData) { emitDetail = onData; onData({ request: accepted }); return unsubscribeDetail },
      subscribeMessages(_id, _cursor, onData, onError) { failMessages = onError; onData([], null); return () => {} },
    } }))
    await waitFor(() => expect(failMessages).not.toBeNull())
    saveChatRetry(pending)
    act(() => failMessages?.({ code: 'permission-denied' }))
    expect(await screen.findByText(/Conversation access is unavailable/)).toBeInTheDocument()
    expect(loadChatRetries(student.id, accepted.id)).toEqual([])
    expect(screen.queryByText('Private pending')).not.toBeInTheDocument()
    act(() => emitDetail?.({ request: accepted }))
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument()
    expect(unsubscribeDetail).toHaveBeenCalled()
  })
  it('does not repopulate private detail after a denied send (F02-TC-017, 039)', async () => {
    let emitDetail: ((value: { request: F01HelpRequest } | null) => void) | null = null
    const unsubscribeDetail = vi.fn()
    const send = vi.fn(async () => { throw { code: 'permission-denied' } })
    mount('/student/conversations/f02-request', servicesFor('student', {
      conversations: {
        ...mockServices.conversations,
        subscribeDetail(_id, onData) { emitDetail = onData; onData({ request: accepted }); return unsubscribeDetail },
        subscribeMessages(_id, _cursor, onData) { onData([], null); return () => {} },
        getMessageFromServer: async () => null,
      },
      callables: createMockCallableClient({ sendMessage: send }),
    }))
    expect(await screen.findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    await userEvent.setup().type(screen.getByRole('textbox', { name: 'Message' }), 'Private draft')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText(/Conversation access is unavailable/)).toBeInTheDocument()
    act(() => emitDetail?.({ request: accepted }))
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument()
    expect(unsubscribeDetail).toHaveBeenCalled()
    expect(loadChatRetries(student.id, accepted.id)).toEqual([])
  })
  it('clears private chat and stops receipt retries when acknowledgement loses permission', async () => {
    const incoming = { ...saved, id: crypto.randomUUID(), senderId: mentor.id, body: 'Private incoming' }
    const pending: ChatRetry = { version: 1, uid: student.id, requestId: accepted.id, messageId: crypto.randomUUID(), normalizedBody: 'Private pending', localSequence: 1, state: 'uncertain' }
    const callbacks: Array<(entries: IntersectionObserverEntry[]) => void> = []
    class TestObserver {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) { callbacks.push(callback) }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', TestObserver)
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const acknowledge = vi.fn(async () => { throw { code: 'permission-denied' } })
    const unsubscribeDetail = vi.fn()
    const unsubscribeMessages = vi.fn()
    try {
      mount('/student/conversations/f02-request', servicesFor('student', {
        conversations: {
          ...mockServices.conversations,
          subscribeDetail(_id, onData) { onData({ request: accepted }); return unsubscribeDetail },
          subscribeMessages(_id, _cursor, onData) { onData([incoming], null); return unsubscribeMessages },
        },
        callables: createMockCallableClient({ acknowledgeMessage: acknowledge }),
      }))
      expect(await screen.findByText('Private incoming')).toBeInTheDocument()
      saveChatRetry(pending)
      const bubble = document.querySelector(`[data-message-id="${incoming.id}"]`)
      await waitFor(() => expect(callbacks.length).toBeGreaterThan(0))
      act(() => callbacks.at(-1)?.([{ isIntersecting: true, target: bubble } as IntersectionObserverEntry]))
      expect(await screen.findByText(/Conversation access is unavailable/)).toBeInTheDocument()
      expect(screen.queryByText('Private incoming')).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument()
      expect(loadChatRetries(student.id, accepted.id)).toEqual([])
      expect(unsubscribeDetail).toHaveBeenCalled()
      await waitFor(() => expect(unsubscribeMessages).toHaveBeenCalled())
      await new Promise((resolve) => window.setTimeout(resolve, 2100))
      expect(acknowledge).toHaveBeenCalledTimes(1)
    } finally { hasFocus.mockRestore(); vi.unstubAllGlobals() }
  }, 10000)
  it('keeps an unsaved intention local when recovery storage fails (F02-TC-035)', async () => {
    const send = vi.fn(async () => ({ message: saved }))
    mount('/student/conversations/f02-request', servicesFor('student', {
      conversations: {
        ...mockServices.conversations,
        subscribeDetail(_id, onData) { onData({ request: accepted }); return () => {} },
        subscribeMessages(_id, _cursor, onData) { onData([], null); return () => {} },
      },
      callables: createMockCallableClient({ sendMessage: send }),
    }))
    expect(await screen.findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    const storage = vi.spyOn(Object.getPrototypeOf(sessionStorage) as Storage, 'setItem')
      .mockImplementation(() => { throw new Error('quota exceeded') })
    try {
      await userEvent.setup().type(screen.getByRole('textbox', { name: 'Message' }), 'Keep this local')
      await userEvent.setup().click(screen.getByRole('button', { name: 'Send message' }))
      expect(screen.getByRole('alert')).toHaveTextContent('This message cannot be saved for recovery')
      expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Keep this local')
      expect(send).not.toHaveBeenCalled()
    } finally { storage.mockRestore() }
  })
})
