import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest, F02SavedMessage } from '@helpinus/shared'
import { ConversationDetailPage } from '../pages/ConversationPages'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { ServiceProvider } from '../services/ServiceProvider'
import type { ChatDetail, HelpiNUSServices, Session } from '../services/contracts'
import { mockDashboard, mockServices } from '../services/mockServices'
import { loadChatRetries, saveChatRetry, type ChatRetry } from '../services/chatRetryStore'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0]!.user
const request: F01HelpRequest = {
  id: 'f02-eligibility-restore', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Eligibility history', description: 'Private accepted question', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const message: F02SavedMessage = {
  id: crypto.randomUUID(), conversationId: request.id, senderId: student.id,
  body: 'Persisted private history', createdAt: '2026-10-16T09:01:00.000Z', readAt: null,
}
const pending: ChatRetry = {
  version: 1, uid: student.id, requestId: request.id, messageId: crypto.randomUUID(),
  normalizedBody: 'Pending private intention', localSequence: 1, state: 'uncertain',
}

function fixture() {
  let current: Session = { user: student }
  let notify: ((session: Session) => void) | undefined
  let parent: F01HelpRequest | null = request
  const detailData: Array<(detail: ChatDetail | null) => void> = []
  const messageData: Array<(items: F02SavedMessage[], next: null) => void> = []
  const messageErrors: Array<(error: unknown) => void> = []
  const detailUnsub = vi.fn()
  const messageUnsub = vi.fn()
  let releaseServer: ((value: F02SavedMessage | null) => void) | undefined
  const send = vi.fn(async () => ({ message }))
  const services: HelpiNUSServices = {
    ...mockServices,
    session: {
      ...mockServices.session,
      getCurrent: async () => current,
      subscribe(onData) { notify = onData; onData(current); return () => {} },
    },
    conversations: {
      ...mockServices.conversations,
      subscribeDetail(_id, onData) {
        detailData.push(onData)
        onData(parent ? { request: parent } : null)
        return detailUnsub
      },
      subscribeMessages(_id, _cursor, onData, onError) {
        messageData.push(onData)
        messageErrors.push(onError)
        onData([message], null)
        return messageUnsub
      },
      getMessageFromServer: async () => new Promise<F02SavedMessage | null>((resolve) => { releaseServer = resolve }),
    },
    callables: { ...mockServices.callables, invoke: async (name, input) => {
      if (name === 'sendMessage') return send() as never
      return mockServices.callables.invoke(name, input)
    } },
  }
  const router = createMemoryRouter([
    { element: <ProtectedRoute role="STUDENT" />, children: [
      { path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> },
    ] },
    { path: '/account-access', element: <h1>Account access boundary</h1> },
    { path: '/login', element: <h1>Login boundary</h1> },
    { path: '/student/dashboard', element: <h1>Student dashboard</h1> },
  ], { initialEntries: [`/student/conversations/${request.id}`] })
  const ui = render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
  const emit = async (next: Session) => { current = next; await act(async () => notify?.(next)) }
  return { ...ui, router, emit, setParent: (next: F01HelpRequest | null) => { parent = next },
    detailData, messageData, messageErrors, detailUnsub, messageUnsub, send, releaseServer: () => releaseServer }
}

describe('F02 detected eligibility loss and recovery (TC-038)', () => {
  beforeEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

  it('clears private UI and retry records on suspended session, discards held proof, and requires accepted membership on restore', async () => {
    saveChatRetry(pending)
    const f = fixture()
    expect(await screen.findByText(message.body)).toBeInTheDocument()
    await waitFor(() => expect(f.releaseServer()).toBeDefined())
    const oldServer = f.releaseServer()!
    const persisted = { ...message }
    await f.emit({ user: { ...student, status: 'SUSPENDED' } })
    expect(await screen.findByRole('heading', { name: 'Account access boundary' })).toBeInTheDocument()
    expect(screen.queryByText(message.body)).not.toBeInTheDocument()
    expect(screen.queryByText(pending.normalizedBody)).not.toBeInTheDocument()
    expect(sessionStorage.getItem('f02-send-owner')).toBeNull()
    expect(loadChatRetries(student.id, request.id)).toEqual([])
    expect(f.detailUnsub).toHaveBeenCalled()
    expect(f.messageUnsub).toHaveBeenCalled()
    act(() => { oldServer(null); f.detailData[0]?.({ request }); f.messageData[0]?.([message], null) })
    expect(f.send).not.toHaveBeenCalled()
    expect(screen.queryByText(message.body)).not.toBeInTheDocument()

    f.setParent(null)
    await f.emit({ user: student })
    await act(async () => { await f.router.navigate(`/student/conversations/${request.id}`) })
    expect(await screen.findByText(/This conversation needs support review/)).toBeInTheDocument()
    expect(screen.queryByText(message.body)).not.toBeInTheDocument()
    expect(f.send).not.toHaveBeenCalled()

    f.setParent(request)
    await act(async () => { await f.router.navigate('/student/dashboard') })
    await act(async () => { await f.router.navigate(`/student/conversations/${request.id}`) })
    expect(await screen.findByText(message.body)).toBeInTheDocument()
    expect(message).toEqual(persisted)
    expect(f.send).not.toHaveBeenCalled()
  })

  it('clears private state when a refreshed same-UID email loses server authorization and discards held callbacks', async () => {
    saveChatRetry(pending)
    const f = fixture()
    expect(await screen.findByText(message.body)).toBeInTheDocument()
    await waitFor(() => expect(f.releaseServer()).toBeDefined())
    const oldServer = f.releaseServer()!
    await f.emit({ user: { ...student, email: 'changed@example.test' } })
    act(() => f.messageErrors[0]?.({ code: 'permission-denied' }))
    expect(await screen.findByText(/Conversation access is unavailable/)).toBeInTheDocument()
    expect(screen.queryByText(message.body)).not.toBeInTheDocument()
    expect(screen.queryByText(pending.normalizedBody)).not.toBeInTheDocument()
    expect(loadChatRetries(student.id, request.id)).toEqual([])
    expect(f.detailUnsub).toHaveBeenCalled()
    expect(f.messageUnsub).toHaveBeenCalled()
    act(() => { oldServer(null); f.messageData[0]?.([message], null) })
    expect(f.send).not.toHaveBeenCalled()
    expect(screen.queryByText(message.body)).not.toBeInTheDocument()
  })
})
