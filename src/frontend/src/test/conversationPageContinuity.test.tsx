import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest, F02SavedMessage } from '@helpinus/shared'
import { ConversationDetailPage } from '../pages/ConversationPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { ChatCursor, HelpiNUSServices } from '../services/contracts'
import { mockDashboard, mockServices } from '../services/mockServices'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const request: F01HelpRequest = {
  id: 'f02-page-continuity', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Live page boundary', description: 'Equal time messages', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const message = (index: number): F02SavedMessage => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  conversationId: request.id, senderId: student.id, body: `Saved ${index}`,
  createdAt: '2026-10-16T09:01:00.000Z', readAt: null,
})
const rows = Array.from({ length: 26 }, (_, index) => message(index + 1))
const initial = rows.slice(5, 25).reverse()
const older = rows.slice(0, 5).reverse()
const shifted = rows.slice(6).reverse()
const initialCursor: ChatCursor = { seconds: 1_760_000_000, nanoseconds: 0, id: message(6).id }
const shiftedCursor: ChatCursor = { ...initialCursor, id: message(7).id }

describe('F02 equal-time message page continuity (TC-020)', () => {
  it('keeps loaded rows visible but marks a shifted live-window gap partial until a bounded bridge fills it', async () => {
    let emitLive: ((messages: F02SavedMessage[], next: ChatCursor | null) => void) | undefined
    let emitBridge: ((messages: F02SavedMessage[], next: ChatCursor | null) => void) | undefined
    let failLive: ((error: unknown) => void) | undefined
    const subscribe = vi.fn<HelpiNUSServices['conversations']['subscribeMessages']>((_id, cursor, onData, onError) => {
      if (cursor === null) { emitLive = onData; failLive = onError; onData(initial, initialCursor) }
      else if (cursor.id === initialCursor.id) onData(older, null)
      else if (cursor.id === shiftedCursor.id) emitBridge = onData
      return () => {}
    })
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
        subscribeMessages: subscribe,
      },
    }
    const router = createMemoryRouter([
      { path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> },
    ], { initialEntries: [`/student/conversations/${request.id}`] })
    const view = render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
    expect(await screen.findByText('Saved 6')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load earlier messages' }))
    await waitFor(() => expect(screen.getByText('Saved 1')).toBeInTheDocument())
    const renderedIds = () => [...document.querySelectorAll('[data-message-id]')].map((element) => element.getAttribute('data-message-id'))
    expect(renderedIds()).toEqual(rows.slice(0, 25).map((row) => row.id))

    act(() => failLive?.({ code: 'unavailable' }))
    expect(screen.getByText(/Messages may be out of date/)).toBeInTheDocument()
    expect(renderedIds()).toEqual(rows.slice(0, 25).map((row) => row.id))
    act(() => emitLive?.(shifted, shiftedCursor))
    await waitFor(() => expect(emitBridge).toBeDefined())
    expect(screen.getByText('Saved 6')).toBeInTheDocument()
    expect(screen.getByText('Saved 26')).toBeInTheDocument()
    expect(screen.getByText(/Messages may be out of date/)).toBeInTheDocument()
    expect(renderedIds()).toEqual(rows.map((row) => row.id))
    expect(new Set(renderedIds()).size).toBe(26)

    act(() => emitBridge?.([message(6), ...older], null))
    await waitFor(() => expect(screen.queryByText(/Messages may be out of date/)).not.toBeInTheDocument())
    expect(renderedIds()).toEqual(rows.map((row) => row.id))
    expect(new Set(renderedIds()).size).toBe(26)
    expect(subscribe).toHaveBeenCalledWith(request.id, shiftedCursor, expect.any(Function), expect.any(Function))

    view.unmount()
    const mentorServices: HelpiNUSServices = {
      ...services,
      session: {
        ...mockServices.session,
        getCurrent: async () => ({ user: mentor }),
        subscribe(listener) { listener({ user: mentor }); return () => {} },
      },
      conversations: {
        ...services.conversations,
        subscribeMessages(_id, cursor, onData) {
          onData(cursor === null ? shifted : [message(6), ...older], cursor === null ? shiftedCursor : null)
          return () => {}
        },
      },
    }
    const mentorRouter = createMemoryRouter([
      { path: '/mentor/conversations/:requestId', element: <ConversationDetailPage role="mentor" /> },
    ], { initialEntries: [`/mentor/conversations/${request.id}`] })
    render(<ServiceProvider servicesOverride={mentorServices}><RouterProvider router={mentorRouter} /></ServiceProvider>)
    expect(await screen.findByText('Saved 26')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load earlier messages' }))
    await waitFor(() => expect(renderedIds()).toEqual(rows.map((row) => row.id)))
    expect(new Set(renderedIds()).size).toBe(26)
  })
})
