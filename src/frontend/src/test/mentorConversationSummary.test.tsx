import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CallableOutput, F01HelpRequest } from '@helpinus/shared'
import { ConversationDetailPage } from '../pages/ConversationPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { createMockCallableClient, mockDashboard, mockServices } from '../services/mockServices'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const accepted: F01HelpRequest = {
  id: 'mentor-summary-request', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Synthetic sequence diagram', description: 'Explain alt frames.', status: 'ACCEPTED',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z',
}
const brief: CallableOutput<'mentorConsultationSummary'>['brief'] = {
  summary: '<img src=x onerror=alert(1)>', unresolvedQuestions: 'What is an alt frame?',
  teachingApproaches: 'Draw a small example.', limitations: 'Only a short conversation was available.',
}
const briefFields = [
  { key: 'summary', label: 'Conversation summary' },
  { key: 'unresolvedQuestions', label: 'Unresolved Student questions' },
  { key: 'teachingApproaches', label: 'Suggested teaching approaches' },
  { key: 'limitations', label: 'Limitations or missing context' },
] as const
const conversations: HelpiNUSServices['conversations'] = {
  ...mockServices.conversations,
  subscribeDetail(_id, onData) { onData({ request: accepted }); return () => {} },
  subscribeMessages(_id, _cursor, onData) { onData([], null); return () => {} },
}
afterEach(() => vi.restoreAllMocks())
function mount(role: 'mentor' | 'student', callables = mockServices.callables, sessionOverride?: HelpiNUSServices['session'], conversationsOverride = conversations) {
  const active = role === 'mentor' ? mentor : student
  const services: HelpiNUSServices = {
    ...mockServices, conversations: conversationsOverride, callables,
    session: sessionOverride ?? { ...mockServices.session, getCurrent: async () => ({ user: active }), subscribe(listener) { listener({ user: active }); return () => {} } },
  }
  const router = createMemoryRouter([
    { path: '/mentor/conversations', element: <p>Left conversation</p> },
    { path: '/mentor/conversations/:requestId', element: <ConversationDetailPage role="mentor" /> },
    { path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> },
  ], { initialEntries: [`/${role}/conversations/${accepted.id}`] })
  return { router, ...render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>) }
}

describe('B3 Mentor consultation draft UI', () => {
  it('keeps the action Mentor-only and invokes only on an explicit click', async () => {
    const invoke = vi.fn(async () => ({ brief, partialHistory: false }))
    const callables = createMockCallableClient({ mentorConsultationSummary: invoke })
    const invokedCalls = vi.spyOn(callables, 'invoke')
    const storageWrites = vi.spyOn(Object.getPrototypeOf(sessionStorage) as Storage, 'setItem')
    const studentView = mount('student', callables)
    expect(await screen.findByText('No messages yet. Start the conversation below.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Summarise Conversation' })).not.toBeInTheDocument()
    studentView.unmount()
    mount('mentor', callables)
    const action = await screen.findByRole('button', { name: 'Summarise Conversation' })
    expect(invoke).not.toHaveBeenCalled()
    await userEvent.setup().click(action)
    await waitFor(() => expect(invoke).toHaveBeenCalledExactlyOnceWith({ helpRequestId: accepted.id }))
    const summary = await screen.findByRole('region', { name: 'AI consultation summary' })
    expect(within(summary).getByText(brief.summary)).toBeInTheDocument()
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(within(summary).queryByRole('textbox')).not.toBeInTheDocument()
    for (const { key, label } of briefFields) {
      expect(within(summary).getByRole('heading', { name: label })).toBeInTheDocument()
      expect(within(summary).getByText(brief[key])).toBeInTheDocument()
    }
    const disclosure = screen.getByText('Consultation summary').closest('details')!
    await userEvent.setup().click(screen.getByText('Consultation summary'))
    expect(disclosure.open).toBe(false)
    await userEvent.setup().click(screen.getByText('Consultation summary'))
    expect(disclosure.open).toBe(true)
    expect(invokedCalls.mock.calls.map(([name]) => name)).toEqual(['mentorConsultationSummary'])
    const storedValues = storageWrites.mock.calls.map(([, value]) => value).join(' ')
    expect(storedValues).not.toContain(brief.summary)
  })

  it('shows loading, prevents duplicate clicks, and labels partial history', async () => {
    let resolve!: (value: CallableOutput<'mentorConsultationSummary'>) => void
    const held = new Promise<CallableOutput<'mentorConsultationSummary'>>((finish) => { resolve = finish })
    const invoke = vi.fn(() => held)
    mount('mentor', createMockCallableClient({ mentorConsultationSummary: invoke }))
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Summarise Conversation' }))
    expect(screen.getByRole('button', { name: 'Summarising…' })).toBeDisabled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Summarising…' }))
    expect(screen.getByRole('status')).toHaveTextContent('Preparing consultation draft')
    expect(invoke).toHaveBeenCalledTimes(1)
    await act(async () => resolve({ brief, partialHistory: true }))
    expect(await screen.findByText(/Partial history: earlier messages were omitted/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'AI consultation summary' })).toHaveTextContent(brief.unresolvedQuestions)
  })

  it('does not generate on message arrival and supports keyboard activation', async () => {
    let publish!: Parameters<HelpiNUSServices['conversations']['subscribeMessages']>[2]
    const liveConversations: HelpiNUSServices['conversations'] = {
      ...conversations,
      subscribeMessages(_id, _cursor, onData) { publish = onData; onData([], null); return () => {} },
    }
    const invoke = vi.fn(async () => ({ brief, partialHistory: false }))
    mount('mentor', createMockCallableClient({ mentorConsultationSummary: invoke }), undefined, liveConversations)
    const action = await screen.findByRole('button', { name: 'Summarise Conversation' })
    act(() => publish([{ id: crypto.randomUUID(), conversationId: accepted.id, senderId: student.id,
      body: 'A new synthetic message', createdAt: '2026-10-16T09:02:00.000Z', readAt: null }], null))
    expect(await screen.findByText('A new synthetic message')).toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalled()
    action.focus()
    expect(action).toHaveFocus()
    await userEvent.setup().keyboard('{Enter}')
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('region', { name: 'AI consultation summary' })).toBeInTheDocument()
  })

  it('shows distinct safe empty, support, denial, capacity, timeout, invalid, config and provider states', async () => {
    for (const [reason, visible] of [
      ['EMPTY_HISTORY', 'has no messages'], ['SUPPORT_NEEDED', 'needs support review'],
      ['ACCESS_UNAVAILABLE', 'access changed'], ['AI_CAPACITY', 'already running'],
      ['AI_TIMEOUT', 'timed out'], ['AI_RESPONSE', 'invalid draft'],
      ['AI_CONFIG', 'not configured'], ['AI_PROVIDER', 'unavailable. Try again later'],
    ]) {
      const view = mount('mentor', createMockCallableClient({ mentorConsultationSummary: async () => { throw { code: 'functions/failed-precondition', details: { reason }, message: 'SECRET_INTERNAL_VALUE' } } }))
      await userEvent.setup().click(await screen.findByRole('button', { name: 'Summarise Conversation' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(visible)
      expect(screen.queryByText('SECRET_INTERNAL_VALUE')).not.toBeInTheDocument()
      view.unmount()
    }
  })

  it('clears a pending draft on conversation change and discards the late response', async () => {
    let resolve!: (value: CallableOutput<'mentorConsultationSummary'>) => void
    const held = new Promise<CallableOutput<'mentorConsultationSummary'>>((finish) => { resolve = finish })
    const { router } = mount('mentor', createMockCallableClient({ mentorConsultationSummary: () => held }))
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Summarise Conversation' }))
    await act(async () => { await router.navigate('/mentor/conversations/another-request') })
    expect(screen.queryByRole('region', { name: 'AI consultation summary' })).not.toBeInTheDocument()
    await act(async () => resolve({ brief, partialHistory: false }))
    expect(screen.queryByRole('region', { name: 'AI consultation summary' })).not.toBeInTheDocument()
  })

  it('clears a generated summary when the signed-in Mentor account changes', async () => {
    let active = mentor
    let emit!: Parameters<HelpiNUSServices['session']['subscribe']>[0]
    const session: HelpiNUSServices['session'] = {
      ...mockServices.session,
      getCurrent: async () => ({ user: active }),
      subscribe(listener) { emit = listener; listener({ user: active }); return () => {} },
    }
    mount('mentor', createMockCallableClient({ mentorConsultationSummary: async () => ({ brief, partialHistory: false }) }), session)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Summarise Conversation' }))
    expect(await screen.findByRole('region', { name: 'AI consultation summary' })).toHaveTextContent(brief.summary)
    active = { ...mentor, id: 'another-mentor', email: 'other-mentor@example.test' }
    act(() => emit({ user: active }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'AI consultation summary' })).not.toBeInTheDocument())
  })

  it('discards a held response after navigating away and back to the same conversation', async () => {
    let resolve!: (value: CallableOutput<'mentorConsultationSummary'>) => void
    const held = new Promise<CallableOutput<'mentorConsultationSummary'>>((finish) => { resolve = finish })
    const { router } = mount('mentor', createMockCallableClient({ mentorConsultationSummary: () => held }))
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Summarise Conversation' }))
    await act(async () => { await router.navigate('/mentor/conversations') })
    expect(screen.getByText('Left conversation')).toBeInTheDocument()
    await act(async () => resolve({ brief, partialHistory: false }))
    await act(async () => { await router.navigate(`/mentor/conversations/${accepted.id}`) })
    expect(await screen.findByRole('button', { name: 'Summarise Conversation' })).toBeEnabled()
    expect(screen.queryByRole('region', { name: 'AI consultation summary' })).not.toBeInTheDocument()
  })
})
