import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest, F02SavedMessage } from '@helpinus/shared'
import { ConversationDetailPage } from '../pages/ConversationPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { ChatCursor, HelpiNUSServices } from '../services/contracts'
import { mockDashboard, mockServices } from '../services/mockServices'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0]!.user
const request: F01HelpRequest = {
  id: 'f02-recovery-boundary', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Recovery boundary', description: 'Accepted request', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const chronology = Array.from({ length: 25 }, (_, index): F02SavedMessage => ({
  id: `recovery-${String(index).padStart(2, '0')}`, conversationId: request.id,
  senderId: student.id, body: `Persisted ${index}`,
  createdAt: new Date(Date.parse('2026-10-16T09:00:00.000Z') + index * 1000).toISOString(), readAt: null,
}))
const newest = [...chronology].reverse()
const cursor: ChatCursor = { seconds: 1, nanoseconds: 0, id: newest[19]!.id }

type Listener = {
  generation: number
  cursor: ChatCursor | null
  onData: (messages: F02SavedMessage[], next: ChatCursor | null) => void
  onError: (error: unknown) => void
  unsubscribe: ReturnType<typeof vi.fn>
}

function mount() {
  const listeners: Listener[] = []
  const detailUnsubs: Array<ReturnType<typeof vi.fn>> = []
  let detailCount = 0
  const services: HelpiNUSServices = {
    ...mockServices,
    session: {
      ...mockServices.session,
      getCurrent: async () => ({ user: student }),
      subscribe(onData) { onData({ user: student }); return () => {} },
    },
    conversations: {
      ...mockServices.conversations,
      subscribeDetail(_id, onData) {
        detailCount++
        const unsubscribe = vi.fn()
        detailUnsubs.push(unsubscribe)
        onData({ request })
        return unsubscribe
      },
      subscribeMessages(_id, pageCursor, onData, onError) {
        const unsubscribe = vi.fn()
        listeners.push({ generation: detailCount, cursor: pageCursor, onData, onError, unsubscribe })
        return unsubscribe
      },
    },
  }
  const router = createMemoryRouter([
    { path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> },
  ], { initialEntries: [`/student/conversations/${request.id}`] })
  const ui = render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
  return { ...ui, listeners, detailUnsubs, detailCount: () => detailCount }
}

describe('F02 first and later message listener recovery (TC-037)', () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks() })

  it('never shows first-listener failure as empty and revalidates the accepted parent before live recovery', async () => {
    const f = mount()
    await waitFor(() => expect(f.listeners).toHaveLength(1))
    expect(screen.getByText('Loading messages…')).toBeInTheDocument()
    act(() => f.listeners[0]!.onError({ code: 'unavailable' }))
    expect(await screen.findByText(/Messages may be out of date/)).toBeInTheDocument()
    expect(screen.queryByText('No messages yet. Start the conversation below.')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(f.detailCount()).toBe(2))
    await waitFor(() => expect(f.listeners).toHaveLength(2))
    expect(f.detailUnsubs[0]).toHaveBeenCalled()
    expect(f.listeners[0]!.unsubscribe).toHaveBeenCalled()
    act(() => f.listeners[1]!.onData(newest.slice(0, 20), cursor))
    expect(await screen.findByText('Persisted 24')).toBeInTheDocument()
    expect(screen.queryByText(/Messages may be out of date/)).not.toBeInTheDocument()
  })

  it('retains healthy first-page rows on later-page failure, then fills the gap after eligible reconnect', async () => {
    const f = mount()
    await waitFor(() => expect(f.listeners).toHaveLength(1))
    act(() => f.listeners[0]!.onData(newest.slice(0, 20), cursor))
    expect(await screen.findByText('Persisted 24')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load earlier messages' }))
    await waitFor(() => expect(f.listeners).toHaveLength(2))
    expect(f.listeners[1]!.cursor).toEqual(cursor)
    act(() => f.listeners[1]!.onError({ code: 'unavailable' }))
    expect(await screen.findByText(/Messages may be out of date/)).toBeInTheDocument()
    expect(screen.getByText('Persisted 24')).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(20)
    expect(screen.queryByText('Persisted 0')).not.toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(f.detailCount()).toBe(2))
    await waitFor(() => expect(f.listeners).toHaveLength(3))
    expect(f.detailUnsubs[0]).toHaveBeenCalled()
    expect(f.listeners[0]!.unsubscribe).toHaveBeenCalled()
    expect(f.listeners[1]!.unsubscribe).toHaveBeenCalled()
    act(() => f.listeners[2]!.onData(newest.slice(0, 20), cursor))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load earlier messages' }))
    await waitFor(() => expect(f.listeners).toHaveLength(4))
    act(() => f.listeners[3]!.onData(newest.slice(20), null))
    expect(await screen.findByText('Persisted 0')).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(25)
    expect(screen.queryByText(/Messages may be out of date/)).not.toBeInTheDocument()
    expect(screen.queryByText('No messages yet. Start the conversation below.')).not.toBeInTheDocument()
  })
})
