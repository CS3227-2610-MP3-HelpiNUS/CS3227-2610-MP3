import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallableOutput, StudentStudyAssistInput, StudentStudyAssistOutput, StudentStudyAssistantConversation, StudentStudyAssistantMessage } from '@helpinus/shared'
import { AppShell } from '../components/AppShell'
import { LoginPage } from '../pages/AuthPages'
import { StudentStudyAssistantPage } from '../pages/StudentStudyAssistantPage'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { createMockCallableClient, mockDashboard, mockServices } from '../services/mockServices'

const student = mockDashboard.user
const timestamp = '2026-10-21T08:00:00.000Z'
const expiresAt = '2026-11-04T08:00:00.000Z'

function conversation(id = 'study-conversation-1'): StudentStudyAssistantConversation {
  return { id, title: 'Breadth-first search', preview: 'Breadth-first search uses a queue.', lastActivityAt: timestamp, expiresAt }
}

function studentMessage(id: string, content: string, offset = 0): Extract<StudentStudyAssistantMessage, { role: 'STUDENT' }> {
  return { id, role: 'STUDENT', content, createdAt: new Date(Date.parse(timestamp) + offset).toISOString() }
}

function assistantMessage(id: string, content: string, offset = 0): Extract<StudentStudyAssistantMessage, { role: 'ASSISTANT'; grounding: 'GROUNDED' }> {
  return {
    id, role: 'ASSISTANT', content, createdAt: new Date(Date.parse(timestamp) + offset).toISOString(),
    grounding: 'GROUNDED',
    citations: [{ sourceId: 'synthetic-bfs', title: 'Synthetic graph traversal notes', canonicalUrl: 'https://example.edu/approved/bfs', version: 'synthetic-v1', section: 'Breadth-first search' }],
  }
}

function grounded(input: StudentStudyAssistInput, content = 'Breadth-first search visits vertices one layer at a time.'): StudentStudyAssistOutput {
  const item = conversation(input.conversationId ?? 'study-conversation-1')
  return {
    kind: 'grounded',
    conversation: item,
    userMessage: studentMessage(`student-${input.requestId}`, input.userMessage),
    // The backend commits both messages with one transaction timestamp.
    assistantMessage: assistantMessage(`assistant-${input.requestId}`, content),
    replayed: false,
  }
}

function servicesWith(fixtures: Parameters<typeof createMockCallableClient>[0]): HelpiNUSServices {
  return {
    ...mockServices,
    session: {
      ...mockServices.session,
      getCurrent: async () => ({ user: student }),
      subscribe(listener) { listener({ user: student }); return () => {} },
    },
    callables: createMockCallableClient(fixtures),
  }
}

function mount(services: HelpiNUSServices) {
  const router = createMemoryRouter([
    { element: <ProtectedRoute role="STUDENT" />, children: [{ element: <AppShell />, children: [
      { path: '/student/study-assistant', element: <StudentStudyAssistantPage /> },
    ] }] },
    { path: '/login', element: <LoginPage /> },
  ], { initialEntries: ['/student/study-assistant'] })
  return render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
}

function emptyList(): CallableOutput<'listStudentStudyAssistantConversations'> {
  return { conversations: [], nextCursor: null }
}

describe('Student Study Assistant', () => {
  beforeEach(() => sessionStorage.clear())

  it('keeps a new conversation local until the first send and continues with the returned conversation ID', async () => {
    const sendInputs: StudentStudyAssistInput[] = []
    const services = servicesWith({
      listStudentStudyAssistantConversations: async () => emptyList(),
      studentStudyAssist: async (input) => {
        sendInputs.push(input)
        return grounded(input)
      },
    })
    const user = userEvent.setup()
    mount(services)

    expect(await screen.findByText('Local only until your first message is sent')).toBeInTheDocument()
    expect(await screen.findByText('Your saved conversations will appear here after you send your first message.')).toBeInTheDocument()
    expect(sendInputs).toHaveLength(0)

    const composer = screen.getByLabelText('Ask a question')
    await user.type(composer, 'Explain breadth-first search')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('Breadth-first search visits vertices one layer at a time.', {}, { timeout: 3000 })).toBeInTheDocument()
    const renderedMessages = within(screen.getByRole('region', { name: 'Study assistant messages' })).getAllByRole('article')
    expect(renderedMessages[0]).toHaveTextContent('Explain breadth-first search')
    expect(renderedMessages[1]).toHaveTextContent('Breadth-first search visits vertices one layer at a time.')
    expect(screen.getByRole('link', { name: 'Synthetic graph traversal notes' })).toHaveAttribute('href', 'https://example.edu/approved/bfs')
    expect(sendInputs[0]).toMatchObject({ conversationId: null, userMessage: 'Explain breadth-first search' })

    await user.type(composer, 'Why is a queue required?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(sendInputs).toHaveLength(2))
    expect(sendInputs[1]).toMatchObject({ conversationId: 'study-conversation-1', userMessage: 'Why is a queue required?' })
    expect(screen.getAllByText('Breadth-first search visits vertices one layer at a time.')).toHaveLength(2)
  })

  it('retries an uncertain send with the same request ID and original text', async () => {
    const attempts: StudentStudyAssistInput[] = []
    const services = servicesWith({
      listStudentStudyAssistantConversations: async () => emptyList(),
      studentStudyAssist: async (input) => {
        attempts.push(input)
        if (attempts.length === 1) throw Object.assign(new Error('deadline'), { code: 'functions/deadline-exceeded' })
        return grounded(input)
      },
    })
    const user = userEvent.setup()
    mount(services)

    const composer = await screen.findByLabelText('Ask a question')
    await user.type(composer, 'Explain a queue')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    const retry = await screen.findByRole('button', { name: 'Retry message' })
    await user.click(screen.getByRole('button', { name: 'New conversation' }))
    expect(retry).toHaveFocus()
    expect(screen.getByText('Resolve or discard the pending message before starting another conversation.')).toBeInTheDocument()
    await user.click(retry)

    expect(await screen.findByText('Breadth-first search visits vertices one layer at a time.', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(attempts).toHaveLength(2)
    expect(attempts[1]).toEqual(attempts[0])
  })

  it('clears recovery after a definitive rejection instead of offering an unsafe retry', async () => {
    const send = vi.fn(async () => { throw Object.assign(new Error('invalid'), { code: 'functions/invalid-argument' }) })
    const services = servicesWith({
      listStudentStudyAssistantConversations: async () => emptyList(),
      studentStudyAssist: send,
    })
    const user = userEvent.setup()
    mount(services)

    await user.type(await screen.findByLabelText('Ask a question'), 'Rejected question')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('This question could not be accepted. Review the text and send a new message.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry message' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem('student-study-assistant-send')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'New conversation' }))
    expect(screen.getByLabelText('Ask a question')).toHaveFocus()
  })

  it('distinguishes provider unavailability from an uncertain lost response', async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error('provider unavailable'), {
        code: 'functions/unavailable', details: { reason: 'PROVIDER_CONTRACT_PENDING' },
      })
    })
    const services = servicesWith({
      listStudentStudyAssistantConversations: async () => emptyList(),
      studentStudyAssist: send,
    })
    const user = userEvent.setup()
    mount(services)

    await user.type(await screen.findByLabelText('Ask a question'), 'Explain queues')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('The Study assistant provider is unavailable right now. Your message was not saved; try a new request later.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry message' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem('student-study-assistant-send')).toBeNull()
  })

  it('loads history, confirms deletion, and restores focus after deleting', async () => {
    const saved = conversation()
    const readMessages = [studentMessage('student-old', 'What is BFS?'), assistantMessage('assistant-old', 'It explores a graph by distance.', 1)]
    const remove = vi.fn(async () => ({ kind: 'deleted' as const, conversationId: saved.id }))
    const services = servicesWith({
      listStudentStudyAssistantConversations: async () => ({ conversations: [saved], nextCursor: null }),
      readStudentStudyAssistantConversation: async () => ({ conversation: saved, messages: readMessages, nextCursor: null }),
      deleteStudentStudyAssistantConversation: remove,
    })
    const user = userEvent.setup()
    mount(services)

    const history = await screen.findByRole('complementary', { name: /history/i })
    const savedConversation = await within(history).findByRole('button', { name: /breadth-first search/i })
    await user.click(savedConversation)
    expect(await screen.findByText('It explores a graph by distance.', {}, { timeout: 3000 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete conversation' }))
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel).toHaveFocus()
    await user.click(screen.getByRole('button', { name: /^Delete$/u }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'New conversation' })).toHaveFocus())
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ conversationId: saved.id }))
    expect(screen.getByText('Local only until your first message is sent')).toBeInTheDocument()
  })

  it('discards an earlier-page response after the Student opens another conversation', async () => {
    const conversationA = { ...conversation('conversation-a'), title: 'Conversation A' }
    const conversationB = { ...conversation('conversation-b'), title: 'Conversation B' }
    let resolveEarlier!: (value: CallableOutput<'readStudentStudyAssistantConversation'>) => void
    const earlier = new Promise<CallableOutput<'readStudentStudyAssistantConversation'>>((resolve) => { resolveEarlier = resolve })
    const services = servicesWith({
      listStudentStudyAssistantConversations: async () => ({ conversations: [conversationA, conversationB], nextCursor: null }),
      readStudentStudyAssistantConversation: async (input) => {
        if (input.conversationId === conversationA.id && input.cursor) return earlier
        if (input.conversationId === conversationA.id) {
          return { conversation: conversationA, messages: [studentMessage('a-current', 'Current A message')], nextCursor: 'earlier-a' }
        }
        return { conversation: conversationB, messages: [studentMessage('b-current', 'Current B message')], nextCursor: null }
      },
    })
    const user = userEvent.setup()
    mount(services)
    const history = await screen.findByRole('complementary', { name: /history/i })

    await user.click(await within(history).findByRole('button', { name: /Conversation A/ }))
    expect(await screen.findByText('Current A message')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    await user.click(within(history).getByRole('button', { name: /Conversation B/ }))
    expect(await screen.findByText('Current B message')).toBeInTheDocument()

    resolveEarlier({ conversation: conversationA, messages: [studentMessage('a-earlier', 'Stale earlier A message')], nextCursor: null })
    await waitFor(() => expect(screen.queryByText('Stale earlier A message')).not.toBeInTheDocument())
    expect(screen.getByText('Current B message')).toBeInTheDocument()
  })

  it('keeps a delayed answer with its originating conversation after the Student opens another one', async () => {
    const conversationA = { ...conversation('conversation-a'), title: 'Conversation A' }
    const conversationB = { ...conversation('conversation-b'), title: 'Conversation B' }
    let resolveSend!: (value: StudentStudyAssistOutput) => void
    const delayedSend = new Promise<StudentStudyAssistOutput>((resolve) => { resolveSend = resolve })
    let sentInput: StudentStudyAssistInput | undefined
    const services = servicesWith({
      listStudentStudyAssistantConversations: async () => ({ conversations: [conversationA, conversationB], nextCursor: null }),
      readStudentStudyAssistantConversation: async (input) => input.conversationId === conversationA.id
        ? { conversation: conversationA, messages: [studentMessage('a-current', 'Current A message')], nextCursor: null }
        : { conversation: conversationB, messages: [studentMessage('b-current', 'Current B message')], nextCursor: null },
      studentStudyAssist: async (input) => {
        sentInput = input
        return delayedSend
      },
    })
    const user = userEvent.setup()
    mount(services)
    const history = await screen.findByRole('complementary', { name: /history/i })

    await user.click(await within(history).findByRole('button', { name: /Conversation A/ }))
    await user.type(await screen.findByLabelText('Ask a question'), 'Delayed A question')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(sentInput).toMatchObject({ conversationId: conversationA.id }))

    await user.click(within(history).getByRole('button', { name: /Conversation B/ }))
    expect(await screen.findByText('Current B message')).toBeInTheDocument()
    resolveSend({
      ...grounded(sentInput!, 'Delayed A answer'),
      conversation: conversationA,
    })

    await screen.findByText('Answer saved to Conversation A.')
    expect(screen.getByRole('heading', { name: 'Conversation B' })).toBeInTheDocument()
    expect(screen.getByText('Current B message')).toBeInTheDocument()
    expect(screen.queryByText('Delayed A question')).not.toBeInTheDocument()
    expect(screen.queryByText('Delayed A answer')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ask a question')).toHaveValue('')
    expect(within(history).getByRole('button', { name: /Conversation B/ })).toHaveAttribute('aria-current', 'page')
  })

  it('renders unsupported and hostile-looking model text as safe plain text', async () => {
    const unsafe = '<img src=x onerror="window.hacked=true"> Approved sources do not cover this.'
    const services = servicesWith({
      listStudentStudyAssistantConversations: async () => emptyList(),
      studentStudyAssist: async (input) => {
        const result = grounded(input, unsafe)
        return {
          ...result,
          kind: 'insufficient_context',
          assistantMessage: { ...result.assistantMessage, grounding: 'INSUFFICIENT_CONTEXT', citations: [] },
        }
      },
    })
    const user = userEvent.setup()
    const view = mount(services)

    await user.type(await screen.findByLabelText('Ask a question'), 'What is the weather?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText(unsafe, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(view.container.querySelector('img')).toBeNull()
    expect(screen.getByText('Not enough approved context')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /synthetic graph traversal notes/i })).not.toBeInTheDocument()
  })
})

