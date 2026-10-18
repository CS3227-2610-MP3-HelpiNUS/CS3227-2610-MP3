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
  id: 'f02-history-keyboard', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Long transcript', description: 'Historical conversation', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const chronological = Array.from({ length: 45 }, (_, index): F02SavedMessage => ({
  id: `keyboard-${String(index).padStart(2, '0')}`, conversationId: request.id, senderId: student.id,
  body: `History ${index}`, createdAt: new Date(Date.parse('2026-10-16T09:00:00.000Z') + index * 1000).toISOString(), readAt: null,
}))
const newest = [...chronological].reverse()
const firstCursor: ChatCursor = { seconds: 1, nanoseconds: 0, id: newest[19]!.id }
const secondCursor: ChatCursor = { seconds: 2, nanoseconds: 0, id: newest[39]!.id }

describe('F02 bounded history keyboard and scroll DOM (TC-018)', () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks() })

  it('keyboard-loads 20/20/5 live pages, retains scroll anchor and focuses exhausted history', async () => {
    const listeners = new Map<string, (items: F02SavedMessage[], next: ChatCursor | null) => void>()
    const subscribe = vi.fn<HelpiNUSServices['conversations']['subscribeMessages']>((_id, cursor, onData) => {
      listeners.set(cursor?.id ?? 'first', onData)
      return () => {}
    })
    const services: HelpiNUSServices = {
      ...mockServices,
      session: { ...mockServices.session, getCurrent: async () => ({ user: student }), subscribe(onData) { onData({ user: student }); return () => {} } },
      conversations: {
        ...mockServices.conversations,
        subscribeDetail(_id, onData) { onData({ request }); return () => {} },
        subscribeMessages: subscribe,
      },
    }
    const router = createMemoryRouter([{ path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> }], { initialEntries: [`/student/conversations/${request.id}`] })
    render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
    expect(await screen.findByText('Loading messages…')).toBeInTheDocument()
    await waitFor(() => expect(listeners.has('first')).toBe(true))
    act(() => listeners.get('first')?.(newest.slice(0, 20), firstCursor))
    const history = screen.getByRole('log', { name: 'Messages' })
    expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(20)
    history.scrollTop = 42
    let height = 100
    Object.defineProperty(history, 'scrollHeight', { configurable: true, get: () => height })
    const user = userEvent.setup()
    const firstButton = screen.getByRole('button', { name: 'Load earlier messages' })
    firstButton.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(listeners.has(firstCursor.id)).toBe(true))
    height = 160
    act(() => listeners.get(firstCursor.id)?.(newest.slice(20, 40), secondCursor))
    await waitFor(() => expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(40))
    expect(history.scrollTop).toBe(102)
    const secondButton = screen.getByRole('button', { name: 'Load earlier messages' })
    secondButton.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(listeners.has(secondCursor.id)).toBe(true))
    height = 190
    act(() => listeners.get(secondCursor.id)?.(newest.slice(40), null))
    await waitFor(() => expect(screen.getAllByRole('group', { name: 'Your message' })).toHaveLength(45))
    expect(history.scrollTop).toBe(132)
    expect(document.activeElement).toBe(history)
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: 'Your message' }).map((node) => node.querySelector('.chat-body')?.textContent)).toEqual(chronological.map((item) => item.body))
    expect(subscribe.mock.calls.map(([, cursor]) => cursor)).toEqual([null, firstCursor, secondCursor])
  })
})
