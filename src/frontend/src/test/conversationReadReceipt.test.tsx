import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AcknowledgeMessageInput, F01HelpRequest, F02SavedMessage } from '@helpinus/shared'
import { ConversationDetailPage } from '../pages/ConversationPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { ChatCursor, HelpiNUSServices } from '../services/contracts'
import { createMockCallableClient, mockDashboard, mockServices } from '../services/mockServices'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const accepted: F01HelpRequest = {
  id: 'f02-receipt-request', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Receipt question', description: 'Please explain this.', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const sent: F02SavedMessage = {
  id: crypto.randomUUID(), conversationId: accepted.id, senderId: student.id,
  body: 'Saved sender message', createdAt: '2026-10-16T09:01:00.000Z', readAt: null,
}
const readAt = '2026-10-16T09:02:00.000Z'

function mount(role: 'student' | 'mentor', subscribeMessages: HelpiNUSServices['conversations']['subscribeMessages'], acknowledgeMessage: (input: AcknowledgeMessageInput) => Promise<{ readAt: string }>) {
  const user = role === 'student' ? student : mentor
  const services: HelpiNUSServices = {
    ...mockServices,
    session: {
      ...mockServices.session,
      getCurrent: async () => ({ user }),
      subscribe(listener) { listener({ user }); return () => {} },
    },
    conversations: {
      ...mockServices.conversations,
      subscribeDetail(_id, onData) { onData({ request: accepted }); return () => {} },
      subscribeMessages,
    },
    callables: createMockCallableClient({ acknowledgeMessage }),
  }
  const router = createMemoryRouter([{ path: `/${role}/conversations/:requestId`, element: <ConversationDetailPage role={role} /> }], { initialEntries: [`/${role}/conversations/${accepted.id}`] })
  return render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
}

describe('F02 persisted sender read status (TC-030)', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('shows Sent until a persisted listener event, then Read; recipient has no ticks and re-entry retains Read', async () => {
    const callbacks: Array<(entries: IntersectionObserverEntry[]) => void> = []
    class TestObserver {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) { callbacks.push(callback) }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', TestObserver)
    const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    let emitStudent: ((messages: F02SavedMessage[], next: ChatCursor | null) => void) | null = null
    let emitMentor: ((messages: F02SavedMessage[], next: ChatCursor | null) => void) | null = null
    const acknowledge = vi.fn(async () => ({ readAt }))
    try {
      const sender = mount('student', (_id, _cursor, onData) => { emitStudent = onData; onData([sent], null); return () => {} }, acknowledge)
      const recipient = mount('mentor', (_id, _cursor, onData) => { emitMentor = onData; onData([sent], null); return () => {} }, acknowledge)
      const senderBubble = await within(sender.container).findByRole('group', { name: 'Your message' })
      const recipientBubble = await within(recipient.container).findByRole('group', { name: `Message from ${student.displayName}` })
      expect(senderBubble.querySelector('.chat-status')).toHaveTextContent('✓✓ Sent')
      expect(recipientBubble.querySelector('.chat-status')).toBeNull()
      expect(acknowledge).not.toHaveBeenCalled()
      await waitFor(() => expect(callbacks.length).toBeGreaterThan(0))
      act(() => callbacks.forEach((callback) => callback([{ isIntersecting: true, target: recipientBubble } as unknown as IntersectionObserverEntry])))
      await waitFor(() => expect(acknowledge).toHaveBeenCalledWith({ requestId: accepted.id, messageId: sent.id }))
      expect(acknowledge).toHaveBeenCalledTimes(1)
      expect(senderBubble.querySelector('.chat-status')).toHaveTextContent('✓✓ Sent')
      act(() => { emitStudent?.([{ ...sent, readAt }], null); emitMentor?.([{ ...sent, readAt }], null) })
      await waitFor(() => expect(senderBubble.querySelector('.chat-status')).toHaveTextContent('✓✓ Read'))
      expect(recipientBubble.querySelector('.chat-status')).toBeNull()
      sender.unmount()
      const reentered = mount('student', (_id, _cursor, onData) => { onData([{ ...sent, readAt }], null); return () => {} }, acknowledge)
      const reenteredBubble = await within(reentered.container).findByRole('group', { name: 'Your message' })
      expect(reenteredBubble.querySelector('.chat-status')).toHaveTextContent('✓✓ Read')
      expect(acknowledge).toHaveBeenCalledTimes(1)
    } finally { focus.mockRestore() }
  })

  it('updates an older loaded sender row through its page listener and retains Read after re-entry', async () => {
    const older = { ...sent, id: crypto.randomUUID(), body: 'Older sender message', createdAt: '2026-10-16T08:01:00.000Z' }
    const recent = Array.from({ length: 20 }, (_, index): F02SavedMessage => ({
      ...sent, id: crypto.randomUUID(), body: `Recent ${index}`, createdAt: new Date(Date.parse(sent.createdAt) + index * 1000).toISOString(),
    }))
    const cursor: ChatCursor = { seconds: 1, nanoseconds: 0, id: recent[0]!.id }
    let emitOlder: ((messages: F02SavedMessage[], next: ChatCursor | null) => void) | null = null
    let olderRead = false
    const subscribe = vi.fn<HelpiNUSServices['conversations']['subscribeMessages']>((_id, page, onData) => {
      if (page === null) onData(recent, cursor)
      else { emitOlder = onData; onData([{ ...older, readAt: olderRead ? readAt : null }], null) }
      return () => {}
    })
    const acknowledge = vi.fn(async () => ({ readAt }))
    const sender = mount('student', subscribe, acknowledge)
    await userEvent.setup().click(await within(sender.container).findByRole('button', { name: 'Load earlier messages' }))
    const oldBubble = sender.container.querySelector(`[data-message-id="${older.id}"]`)
    expect(oldBubble).not.toBeNull()
    expect(oldBubble?.querySelector('.chat-status')).toHaveTextContent('✓✓ Sent')
    act(() => emitOlder?.([{ ...older, readAt }], null))
    await waitFor(() => expect(oldBubble?.querySelector('.chat-status')).toHaveTextContent('✓✓ Read'))
    expect(acknowledge).not.toHaveBeenCalled()
    sender.unmount()
    olderRead = true
    const reentered = mount('student', subscribe, acknowledge)
    await userEvent.setup().click(await within(reentered.container).findByRole('button', { name: 'Load earlier messages' }))
    const reenteredBubble = reentered.container.querySelector(`[data-message-id="${older.id}"]`)
    expect(reenteredBubble?.querySelector('.chat-status')).toHaveTextContent('✓✓ Read')
  })
})
