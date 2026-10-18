import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest, F02SavedMessage, SendMessageInput } from '@helpinus/shared'
import { ConversationDetailPage, ConversationListPage } from '../pages/ConversationPages'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices, Session, ChatDetail, ChatRow } from '../services/contracts'
import { createMockCallableClient, mockDashboard, mockServices } from '../services/mockServices'
import { loadChatRetries, saveChatRetry, type ChatRetry } from '../services/chatRetryStore'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0]!.user
const request: F01HelpRequest = {
  id: 'f02-context-switch', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Private old title', description: 'Private old detail', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const saved = (body: string): F02SavedMessage => ({
  id: crypto.randomUUID(), conversationId: request.id, senderId: student.id,
  body, createdAt: '2026-10-16T09:01:00.000Z', readAt: null,
})
const retry = (body: string): ChatRetry => ({
  version: 1, uid: student.id, requestId: request.id, messageId: crypto.randomUUID(),
  normalizedBody: body, localSequence: 1, state: 'uncertain',
})

function fixture() {
  let current: Session = { user: student }
  let listener: ((session: Session) => void) | undefined
  const oldDetail: Array<(detail: ChatDetail | null) => void> = []
  const oldMessages: Array<(messages: F02SavedMessage[], next: null) => void> = []
  const oldList: Array<(rows: ChatRow[], next: null) => void> = []
  const messageErrors: Array<(error: unknown) => void> = []
  const unsub = { detail: vi.fn(), messages: vi.fn(), list: vi.fn(), session: vi.fn() }
  let releaseServer: ((value: F02SavedMessage | null) => void) | undefined
  let releaseSend: ((value: { message: F02SavedMessage }) => void) | undefined
  const server = vi.fn(async () => new Promise<F02SavedMessage | null>((resolve) => { releaseServer = resolve }))
  const send = vi.fn(async (input: SendMessageInput) => { void input; return new Promise<{ message: F02SavedMessage }>((resolve) => { releaseSend = resolve }) })
  const services: HelpiNUSServices = {
    ...mockServices,
    session: {
      ...mockServices.session,
      getCurrent: async () => current,
      subscribe(onData) { listener = onData; onData(current); return unsub.session },
    },
    conversations: {
      ...mockServices.conversations,
      subscribeList(_uid, _role, _cursor, onData) {
        oldList.push(onData)
        onData([{ kind: 'ready', request }], null)
        return unsub.list
      },
      subscribeDetail(_id, onData) {
        oldDetail.push(onData)
        onData({ request })
        return unsub.detail
      },
      subscribeMessages(_id, _cursor, onData, onError) {
        oldMessages.push(onData)
        messageErrors.push(onError)
        onData([saved('Private old saved message')], null)
        return unsub.messages
      },
      getMessageFromServer: server,
    },
    callables: createMockCallableClient({ sendMessage: send }),
  }
  const emit = async (next: Session) => {
    current = next
    await act(async () => { listener?.(next) })
  }
  return { services, emit, oldDetail, oldMessages, oldList, messageErrors, unsub, server, send,
    releaseServer: () => releaseServer, releaseSend: () => releaseSend }
}

function mount(services: HelpiNUSServices, path: 'detail' | 'list' = 'detail') {
  const router = createMemoryRouter([
    { element: <ProtectedRoute role="STUDENT" />, children: [
      { path: '/student/conversations', element: <ConversationListPage role="student" /> },
      { path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> },
    ] },
    { path: '/login', element: <h1>Login boundary</h1> },
    { path: '/mentor/dashboard', element: <h1>Mentor boundary</h1> },
  ], { initialEntries: [path === 'detail' ? `/student/conversations/${request.id}` : '/student/conversations'] })
  const ui = render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
  return { router, ...ui }
}

describe('F02 context switch and stale callback boundary (TC-036/039)', () => {
  beforeEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

  it.each([
    ['sign-out', { user: null }],
    ['account switch', { user: mentor }],
    ['role change', { user: { ...student, role: 'MENTOR' as const } }],
    ['inactive account', { user: { ...student, status: 'SUSPENDED' as const } }],
  ])('clears private retry state and ignores old detail/message/server callbacks on %s', async (_change, next) => {
    const f = fixture()
    const item = retry('Private pending intention')
    saveChatRetry(item)
    mount(f.services)
    expect(await screen.findByText('Private old saved message')).toBeInTheDocument()
    await waitFor(() => expect(f.releaseServer()).toBeDefined())
    expect(screen.getByText('Private pending intention')).toBeInTheDocument()

    await f.emit(next as Session)
    await waitFor(() => expect(screen.queryByText('Private old saved message')).not.toBeInTheDocument())
    expect(screen.queryByText('Private pending intention')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('f02-send-owner')).toBeNull()
    expect([...Array(sessionStorage.length)].some((_, index) => sessionStorage.key(index)?.startsWith('f02-send:'))).toBe(false)
    expect(f.unsub.detail).toHaveBeenCalled()
    expect(f.unsub.messages).toHaveBeenCalled()

    act(() => {
      f.oldDetail[0]?.({ request })
      f.oldMessages[0]?.([saved('Late private message')], null)
      f.releaseServer()?.(null)
    })
    expect(screen.queryByText('Late private message')).not.toBeInTheDocument()
    expect(screen.queryByText('Private pending intention')).not.toBeInTheDocument()
    expect(f.send).not.toHaveBeenCalled()
    expect(loadChatRetries(student.id, request.id)).toEqual([])
  })

  it('discards old list callbacks after account switch and never revives a private row', async () => {
    const f = fixture()
    mount(f.services, 'list')
    expect(await screen.findByText('Private old title')).toBeInTheDocument()
    await f.emit({ user: mentor })
    await waitFor(() => expect(screen.queryByText('Private old title')).not.toBeInTheDocument())
    expect(f.unsub.list).toHaveBeenCalled()
    act(() => f.oldList[0]?.([{ kind: 'ready', request }], null))
    expect(screen.queryByText('Private old title')).not.toBeInTheDocument()
  })

  it('discards a held callable result after account switch and does not disclose the old intention', async () => {
    const f = fixture()
    mount(f.services)
    expect(await screen.findByText('Private old saved message')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Old account private send' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(f.releaseServer()).toBeDefined())
    act(() => f.releaseServer()?.(null))
    await waitFor(() => expect(f.releaseSend()).toBeDefined())
    const input = f.send.mock.calls[0]![0]

    await f.emit({ user: mentor })
    await waitFor(() => expect(screen.queryByText('Old account private send')).not.toBeInTheDocument())
    expect(sessionStorage.getItem('f02-send-owner')).toBeNull()
    act(() => f.releaseSend()?.({ message: { ...saved(input.body), id: input.messageId } }))
    expect(screen.queryByText('Old account private send')).not.toBeInTheDocument()
    expect(screen.queryByText('✓✓ Sent')).not.toBeInTheDocument()
    expect(loadChatRetries(student.id, request.id)).toEqual([])
  })

  it('unsubscribes the old list and drops its held callback after a service swap', async () => {
    const f = fixture()
    const ui = mount(f.services, 'list')
    expect(await screen.findByText('Private old title')).toBeInTheDocument()
    const replacement: HelpiNUSServices = {
      ...f.services,
      conversations: { ...f.services.conversations, subscribeList: (_uid, _role, _cursor, onData) => { onData([], null); return () => {} } },
    }
    ui.rerender(<ServiceProvider servicesOverride={replacement}><RouterProvider router={ui.router} /></ServiceProvider>)
    await waitFor(() => expect(screen.queryByText('Private old title')).not.toBeInTheDocument())
    expect(f.unsub.list).toHaveBeenCalled()
    act(() => f.oldList[0]?.([{ kind: 'ready', request }], null))
    expect(screen.queryByText('Private old title')).not.toBeInTheDocument()
  })

  it('clears retry records on service swap and ignores a held callable result from the old service', async () => {
    const f = fixture()
    const ui = mount(f.services)
    expect(await screen.findByText('Private old saved message')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Held private send' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(f.releaseServer()).toBeDefined())
    act(() => f.releaseServer()?.(null))
    await waitFor(() => expect(f.releaseSend()).toBeDefined())
    const input = f.send.mock.calls[0]![0]

    const replacement = { ...f.services, conversations: { ...f.services.conversations } }
    ui.rerender(<ServiceProvider servicesOverride={replacement}><RouterProvider router={ui.router} /></ServiceProvider>)
    await waitFor(() => expect(sessionStorage.getItem('f02-send-owner')).toBeNull())
    await waitFor(() => expect(screen.queryByText('Held private send')).not.toBeInTheDocument())
    expect(f.unsub.detail).toHaveBeenCalled()
    expect(f.unsub.messages).toHaveBeenCalled()
    act(() => f.releaseSend()?.({ message: { ...saved(input.body), id: input.messageId } }))
    expect(screen.queryByText('Held private send')).not.toBeInTheDocument()
    expect(screen.queryByText('✓✓ Sent')).not.toBeInTheDocument()
    expect(loadChatRetries(student.id, request.id)).toEqual([])
  })

  it('discards held message and server callbacks after same-account live reconnect', async () => {
    const f = fixture()
    const item = retry('Recover after reconnect')
    saveChatRetry(item)
    mount(f.services)
    expect(await screen.findByText('Private old saved message')).toBeInTheDocument()
    await waitFor(() => expect(f.releaseServer()).toBeDefined())
    const oldServer = f.releaseServer()!
    act(() => f.messageErrors[0]?.({ code: 'unavailable' }))
    expect(await screen.findByText(/Messages may be out of date/)).toBeInTheDocument()
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Retry' })[0]!)
    await waitFor(() => expect(f.oldMessages).toHaveLength(2))
    await waitFor(() => expect(f.server).toHaveBeenCalledTimes(2))
    expect(f.unsub.messages).toHaveBeenCalled()
    act(() => {
      f.oldMessages[0]?.([saved('Stale reconnect body')], null)
      oldServer(null)
    })
    expect(screen.queryByText('Stale reconnect body')).not.toBeInTheDocument()
    expect(f.send).not.toHaveBeenCalled()
    expect(loadChatRetries(student.id, request.id)).toEqual([item])
  })

  it('retains an unresolved intention across same-account page refresh', async () => {
    const f = fixture()
    const item = retry('Same account recovery')
    saveChatRetry(item)
    const first = mount(f.services)
    expect(await screen.findByText('Same account recovery')).toBeInTheDocument()
    await waitFor(() => expect(f.releaseServer()).toBeDefined())
    first.unmount()
    expect(loadChatRetries(student.id, request.id)).toEqual([item])
    mount(f.services)
    expect(await screen.findByText('Same account recovery')).toBeInTheDocument()
    expect(loadChatRetries(student.id, request.id)).toEqual([item])
    expect(f.send).not.toHaveBeenCalled()
  })
})
