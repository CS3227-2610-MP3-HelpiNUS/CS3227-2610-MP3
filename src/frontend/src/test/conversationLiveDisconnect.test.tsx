import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest, F02SavedMessage } from '@helpinus/shared'
import { ConversationDetailPage } from '../pages/ConversationPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { mockDashboard, mockServices } from '../services/mockServices'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const request: F01HelpRequest = {
  id: 'f02-live-disconnect-parent', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Persisted conversation', description: 'Connection state', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const first: F02SavedMessage = {
  id: crypto.randomUUID(), conversationId: request.id, senderId: student.id,
  body: 'Saved before disconnect', createdAt: '2026-10-16T09:01:00.000Z', readAt: null,
}
const second: F02SavedMessage = {
  ...first, id: crypto.randomUUID(), senderId: mentor.id,
  body: 'Saved after reconnect', createdAt: '2026-10-16T09:02:00.000Z',
}

describe('F02 live disconnect feedback (TC-029)', () => {
  beforeEach(() => sessionStorage.clear())

  it('marks persisted history stale on listener disconnect and resubscribes to saved IDs on Retry', async () => {
    let fail: ((error: unknown) => void) | undefined
    const unsubscribe = vi.fn()
    let subscriptions = 0
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
        subscribeMessages(_id, _cursor, onData, onError) {
          subscriptions++
          fail = onError
          onData(subscriptions === 1 ? [first] : [second, first], null)
          return unsubscribe
        },
      },
    }
    const router = createMemoryRouter([
      { path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> },
    ], { initialEntries: [`/student/conversations/${request.id}`] })
    render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
    expect(await screen.findByText(first.body)).toBeInTheDocument()
    expect(screen.queryByText(second.body)).not.toBeInTheDocument()

    act(() => fail?.({ code: 'unavailable' }))
    expect(await screen.findByText(/Messages may be out of date/)).toBeInTheDocument()
    expect(screen.getByText(first.body)).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(1)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(subscriptions).toBe(2))
    expect(await screen.findByText(second.body)).toBeInTheDocument()
    expect(screen.getByText(first.body)).toBeInTheDocument()
    expect(screen.queryByText(/Messages may be out of date/)).not.toBeInTheDocument()
    expect(document.querySelectorAll(`[data-message-id="${first.id}"]`)).toHaveLength(1)
    expect(document.querySelectorAll(`[data-message-id="${second.id}"]`)).toHaveLength(1)
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('keeps an already authorized saved transcript visible but stale on a transient detail read failure', async () => {
    let failDetail: ((error: unknown) => void) | undefined
    const services: HelpiNUSServices = {
      ...mockServices,
      session: {
        ...mockServices.session,
        getCurrent: async () => ({ user: student }),
        subscribe(listener) { listener({ user: student }); return () => {} },
      },
      conversations: {
        ...mockServices.conversations,
        subscribeDetail(_id, onData, onError) { failDetail = onError; onData({ request }); return () => {} },
        subscribeMessages(_id, _cursor, onData) { onData([first], null); return () => {} },
      },
    }
    const router = createMemoryRouter([
      { path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> },
    ], { initialEntries: [`/student/conversations/${request.id}`] })
    render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
    expect(await screen.findByText(first.body)).toBeInTheDocument()
    act(() => failDetail?.({ code: 'unavailable' }))
    expect(await screen.findByText(/Messages may be out of date/)).toBeInTheDocument()
    expect(screen.getByText(first.body)).toBeInTheDocument()
    expect(screen.queryByText(/Conversation access is unavailable/)).not.toBeInTheDocument()
  })
})
