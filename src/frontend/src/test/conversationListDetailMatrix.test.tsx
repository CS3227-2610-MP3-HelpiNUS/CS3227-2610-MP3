import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest, F02SavedMessage } from '@helpinus/shared'
import { ConversationDetailPage, ConversationListPage } from '../pages/ConversationPages'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { ServiceProvider } from '../services/ServiceProvider'
import type { ChatCursor, ChatRow, HelpiNUSServices } from '../services/contracts'
import { mockDashboard, mockServices } from '../services/mockServices'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0]!.user
const parent: F01HelpRequest = {
  id: 'f02-list-detail-parent', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: 'Historical Student Name', mentorDisplayName: 'Historical Mentor Name',
  title: 'Historical request title', description: 'First question line\nSecond question line', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const saved: F02SavedMessage = {
  id: crypto.randomUUID(), conversationId: parent.id, senderId: student.id,
  body: 'Saved only for this parent', createdAt: '2026-10-16T09:01:00.000Z', readAt: null,
}
const supportRow: ChatRow = { kind: 'support_needed', requestId: 'broken-private-parent', acceptedAt: '2026-10-16T08:30:00.000Z' }
const olderCursor: ChatCursor = { seconds: 1, nanoseconds: 0, id: parent.id }

function mount(role: 'student' | 'mentor', path: string, conversations: HelpiNUSServices['conversations'], moduleResult: 'active' | 'inactive' | 'missing' = 'active') {
  const user = role === 'student' ? student : mentor
  const getById = vi.fn(async (id: string) => moduleResult === 'missing' ? null : {
    id, code: moduleResult === 'inactive' ? 'CS2103T (historical)' : 'CS2103T',
    title: 'Software Engineering', active: moduleResult === 'active',
  })
  const services: HelpiNUSServices = {
    ...mockServices,
    session: { ...mockServices.session, getCurrent: async () => ({ user }), subscribe(onData) { onData({ user }); return () => {} } },
    modules: { getById },
    conversations,
  }
  const router = createMemoryRouter([
    { element: <ProtectedRoute role={role === 'student' ? 'STUDENT' : 'MENTOR'} />, children: [
      { path: `/${role}/conversations`, element: <ConversationListPage role={role} /> },
      { path: `/${role}/conversations/:requestId`, element: <ConversationDetailPage role={role} /> },
    ] },
    { path: '/login', element: <h1>Login boundary</h1> },
    { path: '/student/dashboard', element: <h1>Student boundary</h1> },
    { path: '/mentor/dashboard', element: <h1>Mentor boundary</h1> },
  ], { initialEntries: [path] })
  return { router, getById, ...render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>) }
}

describe('F02 both-role list and detail boundaries (TC-011/012/016)', () => {
  beforeEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

  it.each(['student', 'mentor'] as const)('renders only validated %s rows and opens the same request-ID detail', async (role) => {
    const list = vi.fn<HelpiNUSServices['conversations']['subscribeList']>((_uid, _role, _cursor, onData) => {
      onData([{ kind: 'ready', request: parent }, supportRow], null)
      return () => {}
    })
    const detail = vi.fn<HelpiNUSServices['conversations']['subscribeDetail']>((id, onData) => {
      onData(id === parent.id ? { request: parent } : null)
      return () => {}
    })
    const messages = vi.fn<HelpiNUSServices['conversations']['subscribeMessages']>((id, _cursor, onData) => {
      onData(id === parent.id ? [saved] : [], null)
      return () => {}
    })
    const f = mount(role, `/${role}/conversations`, { ...mockServices.conversations, subscribeList: list, subscribeDetail: detail, subscribeMessages: messages })
    const entry = await screen.findByRole('link', { name: 'Open conversation' })
    expect(entry).toHaveAttribute('href', `/${role}/conversations/${parent.id}`)
    expect(screen.getByText(parent.title)).toBeInTheDocument()
    expect(screen.getByText(role === 'student' ? parent.mentorDisplayName : parent.studentDisplayName)).toBeInTheDocument()
    expect(await screen.findByText('CS2103T')).toBeInTheDocument()
    expect(screen.getByText('Conversation needs support')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Open conversation' })).toHaveLength(1)
    expect(screen.queryByText(saved.body)).not.toBeInTheDocument()
    expect(screen.queryByText(/unread/i)).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledWith(role === 'student' ? student.id : mentor.id, role === 'student' ? 'STUDENT' : 'MENTOR', null, expect.any(Function), expect.any(Function))

    await userEvent.setup().click(entry)
    expect(await screen.findByText(saved.body)).toBeInTheDocument()
    expect(detail).toHaveBeenCalledWith(parent.id, expect.any(Function), expect.any(Function))
    expect(messages).toHaveBeenCalledWith(parent.id, null, expect.any(Function), expect.any(Function))
    expect(f.router.state.location.pathname).toBe(`/${role}/conversations/${parent.id}`)
    expect(screen.getByRole('heading', { name: `Conversation with ${role === 'student' ? parent.mentorDisplayName : parent.studentDisplayName}` })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByText('Request context'))
    expect(screen.getByRole('region', { name: 'Request details' }).querySelectorAll('.chat-body')[1]?.textContent).toBe(parent.description)
    expect(f.getById).toHaveBeenCalledWith(parent.moduleId)
    f.unmount()
  })

  it.each(['PENDING', 'REJECTED'] as const)('does not expose private detail on direct %s parent route', async (status) => {
    const direct = { ...parent, status }
    const detail = vi.fn<HelpiNUSServices['conversations']['subscribeDetail']>((_id, onData) => { onData(null); return () => {} })
    const f = mount('student', `/student/conversations/${direct.id}`, { ...mockServices.conversations, subscribeDetail: detail })
    expect(await screen.findByText(/This conversation needs support review/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument()
    expect(screen.queryByText(saved.body)).not.toBeInTheDocument()
    expect(detail).toHaveBeenCalledWith(direct.id, expect.any(Function), expect.any(Function))
    f.unmount()
  })

  it.each(['missing', 'inactive'] as const)('uses module adapter output for %s metadata without inventing a label', async (moduleResult) => {
    const f = mount('mentor', `/mentor/conversations/${parent.id}`, {
      ...mockServices.conversations,
      subscribeDetail(_id, onData) { onData({ request: parent }); return () => {} },
      subscribeMessages(_id, _cursor, onData) { onData([saved], null); return () => {} },
    }, moduleResult)
    expect(await screen.findByText(saved.body)).toBeInTheDocument()
    expect(f.getById).toHaveBeenCalledWith(parent.moduleId)
    expect(await screen.findByText(moduleResult === 'missing' ? 'Module information unavailable' : 'CS2103T (historical)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: `Conversation with ${parent.studentDisplayName}` })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByText('Request context'))
    expect(screen.getByRole('region', { name: 'Request details' })).toHaveTextContent(parent.title)
    expect(screen.getByRole('region', { name: 'Request details' }).querySelectorAll('.chat-body')[1]?.textContent).toBe(parent.description)
    f.unmount()
  })
})

describe('F02 list state and retry boundary (TC-015)', () => {
  beforeEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

  it('separates loading, zero, partial, exhausted, support, transient error and denied states without multiplying subscriptions', async () => {
    const callbacks: Array<{ cursor: ChatCursor | null; onData: (rows: ChatRow[], next: ChatCursor | null) => void; onError: (error: unknown) => void; unsub: ReturnType<typeof vi.fn> }> = []
    const subscribe = vi.fn<HelpiNUSServices['conversations']['subscribeList']>((_uid, _role, cursor, onData, onError) => {
      const unsub = vi.fn()
      callbacks.push({ cursor, onData, onError, unsub })
      return unsub
    })
    const f = mount('student', '/student/conversations', { ...mockServices.conversations, subscribeList: subscribe })
    expect(await screen.findByText('Loading conversations…')).toBeInTheDocument()
    await waitFor(() => expect(callbacks).toHaveLength(1))
    act(() => callbacks[0]!.onData([], null))
    expect(await screen.findByText('No accepted conversations yet.')).toBeInTheDocument()
    act(() => callbacks[0]!.onData([{ kind: 'ready', request: parent }], olderCursor))
    expect(await screen.findByText(parent.title)).toBeInTheDocument()
    expect(screen.queryByText('No accepted conversations yet.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(callbacks).toHaveLength(2))
    expect(callbacks[1]!.cursor).toEqual(olderCursor)
    act(() => callbacks[1]!.onError({ code: 'failed-precondition' }))
    expect(await screen.findByText(/The conversation list may be out of date/)).toBeInTheDocument()
    expect(screen.getByText(parent.title)).toBeInTheDocument()
    expect(screen.queryByText('No accepted conversations yet.')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(callbacks).toHaveLength(3))
    expect(callbacks[0]!.unsub).toHaveBeenCalledTimes(1)
    expect(callbacks[1]!.unsub).toHaveBeenCalledTimes(1)
    act(() => callbacks[2]!.onData([{ kind: 'ready', request: parent }, supportRow], null))
    expect(await screen.findByText('Conversation needs support')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Open conversation' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(screen.queryByText(/may be out of date/)).not.toBeInTheDocument()
    act(() => callbacks[2]!.onError({ code: 'permission-denied' }))
    expect(await screen.findByText(/Conversation access is unavailable/)).toBeInTheDocument()
    expect(screen.queryByText(parent.title)).not.toBeInTheDocument()
    expect(callbacks[2]!.unsub).toHaveBeenCalledTimes(1)
    f.unmount()
  })
})
