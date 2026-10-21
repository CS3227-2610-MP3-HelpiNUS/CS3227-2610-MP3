import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { F01HelpRequest, F02SavedMessage } from '@helpinus/shared'
import { ConversationDetailPage } from '../pages/ConversationPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { ChatCursor, HelpiNUSServices } from '../services/contracts'
import { mockDashboard, mockServices } from '../services/mockServices'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const request: F01HelpRequest = {
  id: 'f02-history-pages', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'History fixture', description: 'Many saved messages', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const chronological = Array.from({ length: 45 }, (_, index): F02SavedMessage => ({
  id: `saved-${String(index).padStart(2, '0')}`, conversationId: request.id,
  senderId: index % 2 === 0 ? student.id : mentor.id, body: `Saved ${index}`,
  createdAt: new Date(Date.parse('2026-10-16T09:00:00.000Z') + index * 1000).toISOString(), readAt: null,
}))
const newest = [...chronological].reverse()
const firstCursor: ChatCursor = { seconds: 1, nanoseconds: 0, id: newest[19]!.id }
const secondCursor: ChatCursor = { seconds: 2, nanoseconds: 0, id: newest[39]!.id }

function mount(subscribeMessages: HelpiNUSServices['conversations']['subscribeMessages']) {
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
      subscribeMessages,
    },
  }
  const router = createMemoryRouter([{ path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> }], { initialEntries: [`/student/conversations/${request.id}`] })
  return render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
}

describe('F02 bounded history DOM states (TC-018)', () => {
  beforeEach(() => sessionStorage.clear())

  it('loads forty-five saved rows in 20/20/5 pages, oldest first, then removes the exhausted control', async () => {
    const pending = new Map<string, (messages: F02SavedMessage[], next: ChatCursor | null) => void>()
    const cursors: Array<ChatCursor | null> = []
    const view = mount((_id, cursor, onData) => { cursors.push(cursor); pending.set(cursor?.id ?? 'first', onData); return () => {} })
    expect(await within(view.container).findByText('Loading messages…')).toBeInTheDocument()
    await waitFor(() => expect(pending.has('first')).toBe(true))
    const firstPage = pending.get('first')
    expect(firstPage).toBeDefined()
    act(() => firstPage!(newest.slice(0, 20), firstCursor))
    await waitFor(() => expect(within(view.container).getAllByRole('group', { name: /message/i })).toHaveLength(20))
    const user = userEvent.setup()
    await user.click(within(view.container).getByRole('button', { name: 'Load earlier messages' }))
    expect(within(view.container).getByRole('button', { name: 'Loading earlier messages…' })).toBeDisabled()
    expect(within(view.container).getAllByRole('group', { name: /message/i })).toHaveLength(20)
    act(() => pending.get(firstCursor.id)?.(newest.slice(20, 40), secondCursor))
    await waitFor(() => expect(within(view.container).getAllByRole('group', { name: /message/i })).toHaveLength(40))
    await user.click(within(view.container).getByRole('button', { name: 'Load earlier messages' }))
    act(() => pending.get(secondCursor.id)?.(newest.slice(40), null))
    await waitFor(() => expect(within(view.container).getAllByRole('group', { name: /message/i })).toHaveLength(45))
    const bodies = within(view.container).getAllByRole('group', { name: /message/i }).map((row) => row.querySelector('.chat-body')?.textContent)
    expect(bodies).toEqual(chronological.map((message) => message.body))
    expect(new Set(bodies).size).toBe(45)
    expect(cursors).toEqual([null, firstCursor, secondCursor])
    expect(within(view.container).queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument()
  })

  it('distinguishes truly empty history from a failed older page while retaining the saved first page', async () => {
    const pending = new Map<string, { onData: (messages: F02SavedMessage[], next: ChatCursor | null) => void; onError: (error: unknown) => void }>()
    const view = mount((_id, cursor, onData, onError) => { pending.set(cursor?.id ?? 'first', { onData, onError }); return () => {} })
    await waitFor(() => expect(pending.has('first')).toBe(true))
    act(() => pending.get('first')?.onData([], null))
    expect(await within(view.container).findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    act(() => pending.get('first')?.onData(newest.slice(0, 20), firstCursor))
    expect(await within(view.container).findByText('Saved 44')).toBeInTheDocument()
    await userEvent.setup().click(within(view.container).getByRole('button', { name: 'Load earlier messages' }))
    act(() => pending.get(firstCursor.id)?.onError({ code: 'unavailable' }))
    expect(await within(view.container).findByText(/Messages may be out of date/)).toBeInTheDocument()
    expect(within(view.container).getAllByRole('group', { name: /message/i })).toHaveLength(20)
    expect(within(view.container).queryByText('No messages yet. Start the conversation below.')).not.toBeInTheDocument()
  })
})
