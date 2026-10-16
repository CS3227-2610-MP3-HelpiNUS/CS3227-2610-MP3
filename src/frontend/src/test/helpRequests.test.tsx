import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest } from '@helpinus/shared'
import { MentorRequestsPage, RequestDetailPage, RequestHelpPage, StudentRequestsPage } from '../pages/HelpRequestPages'
import { StudentDashboard } from '../pages/StudentDashboard'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { createMockCallableClient, mockDashboard, mockServices } from '../services/mockServices'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const saved: F01HelpRequest = {
  id: 'saved-request', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Sequence diagrams', description: 'Line one\nLine two', status: 'PENDING',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T08:00:00.000Z',
}

function servicesFor(role: 'student' | 'mentor', overrides: Partial<HelpiNUSServices> = {}): HelpiNUSServices {
  const user = role === 'student' ? student : mentor
  return {
    ...mockServices,
    session: { ...mockServices.session, getCurrent: async () => ({ user }), subscribe: (listener) => { listener({ user }); return () => {} } },
    ...overrides,
  }
}

function mount(path: string, services: HelpiNUSServices) {
  const router = createMemoryRouter([
    { path: '/student/mentors/:mentorId/request', element: <RequestHelpPage /> },
    { path: '/student/requests', element: <StudentRequestsPage /> },
    { path: '/student/requests/:id', element: <RequestDetailPage role="student" /> },
    { path: '/mentor/requests', element: <MentorRequestsPage /> },
    { path: '/mentor/requests/:id', element: <RequestDetailPage role="mentor" /> },
    { path: '/student/mentors', element: <h1>Find a Mentor</h1> },
    { path: '/student/dashboard', element: <StudentDashboard /> },
  ], { initialEntries: [path] })
  return { ...render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>), router }
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('combobox', { name: 'Module' })
  await user.selectOptions(screen.getByRole('combobox', { name: 'Module' }), 'cs2103t')
  await user.type(screen.getByRole('textbox', { name: 'Question title' }), 'Sequence diagrams')
  await user.type(screen.getByRole('textbox', { name: 'Detailed question' }), 'Line one\nLine two')
}

describe('F01 request screens', () => {
  beforeEach(() => sessionStorage.clear())
  it('submits selected Mentor/module, navigates only after confirmed persistence', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async () => ({ kind: 'created' as const, helpRequest: saved }))
    mount('/student/mentors/mentor-01/request?moduleId=cs2103t', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ moduleIds: ['cs2103t'] }), subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
      callables: createMockCallableClient({ createHelpRequest: create }),
    }))
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('heading', { name: 'Request details' })).toBeInTheDocument()
    expect(await screen.findByText('Your request was saved.')).toBeInTheDocument()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ mentorId: 'mentor-01', moduleId: 'cs2103t', title: 'Sequence diagrams', description: 'Line one\nLine two', operationId: expect.any(String) }))
  })

  it('identifies invalid fields and never calls create for a blank form', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    mount('/student/mentors/mentor-01/request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ moduleIds: ['cs2103t'] }) },
      callables: createMockCallableClient({ createHelpRequest: create }),
    }))
    await screen.findByRole('button', { name: 'Send request' })
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(screen.getByText('Choose a supported module.')).toBeInTheDocument()
    expect(screen.getByText('Enter a question title.')).toBeInTheDocument()
    expect(screen.getByText('Enter a detailed question.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Question title/u })).toHaveAttribute('aria-invalid', 'true')
    expect(create).not.toHaveBeenCalled()
  })

  it('shows a module lookup failure and recovers on retry without claiming an empty catalogue', async () => {
    const user = userEvent.setup()
    let reads = 0
    mount('/student/mentors/mentor-01/request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ moduleIds: ['cs2103t'] }) },
      modules: { ...mockServices.modules, getById: async (id) => { if (++reads === 1) throw new Error('network'); return mockServices.modules.getById(id) } },
    }))
    expect(await screen.findByText('We could not load this Mentor’s modules.')).toBeInTheDocument()
    expect(screen.queryByText('No active supported modules are available. Choose another Mentor.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('combobox', { name: /Module/u })).toBeInTheDocument()
    expect(reads).toBe(2)
  })

  it('clears a private draft when the session signs out', async () => {
    const user = userEvent.setup()
    let publish: ((value: { user: typeof student | null }) => void) | null = null
    mount('/student/mentors/mentor-01/request', servicesFor('student', {
      session: { ...mockServices.session, getCurrent: async () => ({ user: student }), subscribe: (listener) => { publish = listener; listener({ user: student }); return () => {} } },
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ moduleIds: ['cs2103t'] }) },
    }))
    await fillForm(user)
    await waitFor(() => expect(Object.keys(sessionStorage).some((key) => key.startsWith('f01-draft:'))).toBe(true))
    act(() => { publish?.({ user: null }) })
    expect(Object.keys(sessionStorage).some((key) => key.startsWith('f01-draft:'))).toBe(false)
    expect(sessionStorage.getItem('f01-draft-owner')).toBeNull()
  })

  it('clears another account’s stored draft on a cold session publication', async () => {
    const otherStudent = { ...student, id: 'student-b' }
    sessionStorage.setItem('f01-draft-owner', student.id)
    sessionStorage.setItem(`f01-draft:${student.id}:mentor-01`, JSON.stringify({ title: 'Private question', description: 'Private details' }))
    mount('/student/dashboard', servicesFor('student', {
      session: { ...mockServices.session, getCurrent: async () => ({ user: otherStudent }), subscribe: (listener) => { listener({ user: otherStudent }); return () => {} } },
    }))
    await waitFor(() => expect(sessionStorage.getItem('f01-draft-owner')).toBeNull())
    expect(Object.keys(sessionStorage).some((key) => key.startsWith('f01-draft:'))).toBe(false)
  })

  it('shows support guidance for an integrity failure during create and reject', async () => {
    const user = userEvent.setup()
    const integrity = { code: 'functions/failed-precondition', details: { reason: 'INTEGRITY_ERROR' } }
    const createView = mount('/student/mentors/mentor-01/request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ moduleIds: ['cs2103t'] }) },
      callables: createMockCallableClient({ createHelpRequest: async () => { throw integrity } }),
    }))
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('needs support review')
    createView.unmount()

    mount('/mentor/requests/saved-request', servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
      callables: createMockCallableClient({ respondToHelpRequest: async () => { throw integrity } }),
    }))
    await user.click(await screen.findByRole('button', { name: 'Reject' }))
    await user.click(screen.getByRole('button', { name: 'Reject request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('needs support review')
  })

  it('keeps the draft and links the existing request on a duplicate', async () => {
    const user = userEvent.setup()
    mount('/student/mentors/mentor-01/request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ moduleIds: ['cs2103t'] }) },
      callables: createMockCallableClient({ createHelpRequest: async () => ({ kind: 'duplicate', existingHelpRequestId: saved.id, currentStatus: 'PENDING' }) }),
    }))
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No new request was sent')
    expect(screen.getByRole('textbox', { name: 'Question title' })).toHaveValue('Sequence diagrams')
    expect(screen.getByRole('link', { name: 'View existing request' })).toHaveAttribute('href', `/student/requests/${saved.id}`)
  })

  it('reuses the same operation ID after an uncertain submit', async () => {
    const user = userEvent.setup()
    const inputs: string[] = []
    let attempts = 0
    mount('/student/mentors/mentor-01/request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ moduleIds: ['cs2103t'] }), subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
      callables: createMockCallableClient({ createHelpRequest: async (input) => { inputs.push(input.operationId); if (++attempts === 1) throw new Error('timeout'); return { kind: 'created', helpRequest: saved } } }),
    }))
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm')
    await user.click(screen.getByRole('button', { name: 'Check this attempt again' }))
    expect(await screen.findByRole('heading', { name: 'Request details' })).toBeInTheDocument()
    expect(inputs).toHaveLength(2)
    expect(inputs[1]).toBe(inputs[0])
  })

  it('retains the uncertain operation ID across refresh', async () => {
    const user = userEvent.setup()
    const inputs: string[] = []
    const services = servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ moduleIds: ['cs2103t'] }), subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
      callables: createMockCallableClient({ createHelpRequest: async (input) => { inputs.push(input.operationId); if (inputs.length === 1) throw new Error('timeout'); return { kind: 'created', helpRequest: saved } } }),
    })
    const first = mount('/student/mentors/mentor-01/request', services)
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm')
    first.unmount()
    mount('/student/mentors/mentor-01/request', services)
    expect(await screen.findByRole('button', { name: 'Check this attempt again' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Question title' })).toHaveValue('Sequence diagrams')
    await user.click(screen.getByRole('button', { name: 'Check this attempt again' }))
    expect(await screen.findByText('Your request was saved.')).toBeInTheDocument()
    expect(inputs).toHaveLength(2)
    expect(inputs[1]).toBe(inputs[0])
  })

  it('retains the operation ID when refreshed while the first call is still in flight', async () => {
    const user = userEvent.setup()
    const inputs: string[] = []
    const services = servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ moduleIds: ['cs2103t'] }), subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
      callables: createMockCallableClient({ createHelpRequest: async (input) => {
        inputs.push(input.operationId)
        if (inputs.length === 1) return new Promise(() => {})
        return { kind: 'created', helpRequest: saved }
      } }),
    })
    const first = mount('/student/mentors/mentor-01/request', services)
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(inputs).toHaveLength(1)
    first.unmount()
    mount('/student/mentors/mentor-01/request', services)
    await user.click(await screen.findByRole('button', { name: 'Check this attempt again' }))
    expect(await screen.findByText('Your request was saved.')).toBeInTheDocument()
    expect(inputs).toEqual([inputs[0], inputs[0]])
  })

  it('reconciles a frozen attempt after the Mentor selection becomes unavailable', async () => {
    const user = userEvent.setup()
    const inputs: string[] = []
    let selectionAvailable = true
    const services = servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => selectionAvailable ? { moduleIds: ['cs2103t'] } : null, subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
      callables: createMockCallableClient({ createHelpRequest: async (input) => { inputs.push(input.operationId); if (inputs.length === 1) throw new Error('timeout'); return { kind: 'created', helpRequest: saved } } }),
    })
    const first = mount('/student/mentors/mentor-01/request', services)
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm')
    first.unmount()
    selectionAvailable = false
    mount('/student/mentors/mentor-01/request', services)
    await user.click(await screen.findByRole('button', { name: 'Check this attempt again' }))
    expect(await screen.findByText('Your request was saved.')).toBeInTheDocument()
    expect(inputs).toEqual([inputs[0], inputs[0]])
  })

  it('shows retry failure and duplicate feedback when the original selection disappears', async () => {
    const user = userEvent.setup()
    let attempts = 0
    let selectionAvailable = true
    const services = servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => selectionAvailable ? { moduleIds: ['cs2103t'] } : null },
      callables: createMockCallableClient({ createHelpRequest: async () => {
        attempts += 1
        if (attempts < 3) throw new Error('timeout')
        return { kind: 'duplicate', existingHelpRequestId: saved.id, currentStatus: 'PENDING' }
      } }),
    })
    const first = mount('/student/mentors/mentor-01/request', services)
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm')
    first.unmount()
    selectionAvailable = false
    mount('/student/mentors/mentor-01/request', services)
    await user.click(await screen.findByRole('button', { name: 'Check this attempt again' }))
    expect(await screen.findByText(/could not confirm whether your request was sent/u)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Check this attempt again' }))
    expect(await screen.findByText(/No new request was sent/u)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View existing request' })).toHaveAttribute('href', `/student/requests/${saved.id}`)
  })

  it('does not carry an uncertain attempt to a different Mentor route', async () => {
    const user = userEvent.setup()
    const inputs: string[] = []
    const services = servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ moduleIds: ['cs2103t'] }) },
      callables: createMockCallableClient({ createHelpRequest: async (input) => { inputs.push(input.mentorId); if (inputs.length === 1) throw new Error('timeout'); return { kind: 'duplicate', existingHelpRequestId: saved.id, currentStatus: 'PENDING' } } }),
    })
    const view = mount('/student/mentors/mentor-01/request', services)
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm')
    await act(async () => { await view.router.navigate('/student/mentors/mentor-02/request') })
    await screen.findByRole('button', { name: 'Send request' })
    expect(screen.getByRole('textbox', { name: 'Question title' })).toHaveValue('')
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(inputs).toEqual(['mentor-01', 'mentor-02'])
  })

  it('reports the current terminal status on a duplicate receipt replay', async () => {
    const user = userEvent.setup()
    mount('/student/mentors/mentor-01/request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ moduleIds: ['cs2103t'] }) },
      callables: createMockCallableClient({ createHelpRequest: async () => ({ kind: 'duplicate', existingHelpRequestId: saved.id, currentStatus: 'REJECTED' }) }),
    }))
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('now rejected')
  })

  it('shows live Student history and clears the listener on unmount', async () => {
    let emit: ((items: F01HelpRequest[]) => void) | null = null
    const unsubscribe = vi.fn()
    const services = servicesFor('student', { helpRequests: { ...mockServices.helpRequests, subscribeStudentPage: (_uid, _cursor, onData) => { emit = onData; onData([saved]); return unsubscribe } } })
    const view = mount('/student/requests', services)
    expect(await screen.findByText('Sequence diagrams')).toBeInTheDocument()
    act(() => { emit?.([{ ...saved, status: 'REJECTED' }]) })
    expect(screen.getByText('REJECTED')).toBeInTheDocument()
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('invalidates a loaded continuation when the live first page changes', async () => {
    const user = userEvent.setup()
    let emitFirst: ((items: F01HelpRequest[]) => void) | null = null
    const firstPage = Array.from({ length: 20 }, (_, index) => ({ ...saved, id: `request-${index}`, title: `Question ${index}` }))
    mount('/student/requests', servicesFor('student', { helpRequests: {
      ...mockServices.helpRequests,
      subscribeStudentPage: (_uid, cursor, onData) => {
        if (cursor) onData([{ ...saved, id: 'continuation', title: 'Older question' }])
        else { emitFirst = onData; onData(firstPage) }
        return () => {}
      },
    } }))
    await user.click(await screen.findByRole('button', { name: 'Load more requests' }))
    expect(await screen.findByText('Older question')).toBeInTheDocument()
    act(() => { emitFirst?.([{ ...firstPage[0], status: 'REJECTED', updatedAt: '2026-10-16T09:00:00.000Z' }, ...firstPage.slice(1)]) })
    expect(screen.queryByText('Older question')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load more requests' })).toBeInTheDocument()
  })

  it('offers a fresh continuation when a previously full page shrinks', async () => {
    const user = userEvent.setup()
    let emitFirst: ((items: F01HelpRequest[]) => void) | null = null
    const firstPage = Array.from({ length: 20 }, (_, index) => ({ ...saved, id: `request-${index}`, title: `Question ${index}` }))
    mount('/mentor/requests', servicesFor('mentor', { helpRequests: {
      ...mockServices.helpRequests,
      subscribeMentorPendingPage: (_uid, cursor, onData) => {
        if (cursor) onData([{ ...saved, id: 'older-pending', title: 'Older pending' }])
        else { emitFirst = onData; onData(firstPage) }
        return () => {}
      },
      subscribeMentorDecidedPage: (_uid, _cursor, onData) => { onData([]); return () => {} },
    } }))
    await user.click(await screen.findByRole('button', { name: 'Load more requests' }))
    expect(await screen.findByText('Older pending')).toBeInTheDocument()
    act(() => { emitFirst?.(firstPage.slice(1)) })
    expect(screen.queryByText('Older pending')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load more requests' }))
    expect(await screen.findByText('Older pending')).toBeInTheDocument()
  })

  it('shows pending and decided Mentor lists without Student email', async () => {
    mount('/mentor/requests', servicesFor('mentor', { helpRequests: {
      ...mockServices.helpRequests,
      subscribeMentorPendingPage: (_uid, _cursor, onData) => { onData([saved]); return () => {} },
      subscribeMentorDecidedPage: (_uid, _cursor, onData) => { onData([{ ...saved, id: 'old', status: 'REJECTED' }]); return () => {} },
    } }))
    expect((await screen.findAllByText('Sequence diagrams')).length).toBe(2)
    expect(screen.getAllByText(/Jamie Tan/)).toHaveLength(2)
    expect(screen.queryByText(student.email)).not.toBeInTheDocument()
    const cards = screen.getAllByRole('listitem')
    expect(within(cards[0]!).getByRole('link', { name: 'View details for Sequence diagrams' })).toHaveAttribute('href', '/mentor/requests/saved-request')
    expect(within(cards[1]!).getByRole('link', { name: 'View details for Sequence diagrams' })).toHaveAttribute('href', '/mentor/requests/old')
  })

  it('separates request information from the full question on both role details', async () => {
    const view = mount('/student/requests/saved-request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
    }))
    expect(await screen.findByRole('heading', { name: 'Request information' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Question' })).toBeInTheDocument()
    expect(screen.getByText('Mentor')).toBeInTheDocument()
    expect(screen.getByText('Submitted')).toBeInTheDocument()
    expect(screen.getByText(/Line one/u)).toHaveTextContent('Line one\nLine two', { normalizeWhitespace: false })
    view.unmount()
    mount('/mentor/requests/saved-request', servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
    }))
    expect(await screen.findByRole('heading', { name: 'Request information' })).toBeInTheDocument()
    expect(screen.getByText('Student')).toBeInTheDocument()
    expect(screen.queryByText(student.email)).not.toBeInTheDocument()
  })

  it('opens an accessible acceptance dialog and cancels without deciding', async () => {
    const user = userEvent.setup()
    const decide = vi.fn(async () => ({ kind: 'decided' as const, helpRequest: { ...saved, status: 'ACCEPTED' as const }, conversationId: saved.id }))
    mount('/mentor/requests/saved-request', servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
      callables: createMockCallableClient({ respondToHelpRequest: decide }),
    }))
    const trigger = await screen.findByRole('button', { name: 'Accept' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Accept this request?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getAllByText(/Jamie Tan/u)).toHaveLength(2)
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Accept request' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(decide).not.toHaveBeenCalled()
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(decide).not.toHaveBeenCalled()
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Accept request' }))
    await waitFor(() => expect(decide).toHaveBeenCalledOnce())
  })

  it('keeps the same decision attempt available after closing an uncertain dialog', async () => {
    const user = userEvent.setup()
    const operationIds: string[] = []
    const decide = vi.fn(async (input: { operationId: string }) => {
      operationIds.push(input.operationId)
      if (operationIds.length === 1) throw new Error('timeout')
      return { kind: 'decided' as const, helpRequest: { ...saved, status: 'ACCEPTED' as const }, conversationId: saved.id }
    })
    mount('/mentor/requests/saved-request', servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
      callables: createMockCallableClient({ respondToHelpRequest: decide }),
    }))
    await user.click(await screen.findByRole('button', { name: 'Accept' }))
    await user.click(screen.getByRole('button', { name: 'Accept request' }))
    expect(await screen.findByText(/could not confirm the decision/u)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Accept' }))
    await user.click(screen.getByRole('button', { name: 'Retry same decision' }))
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(2))
    expect(operationIds[1]).toBe(operationIds[0])
  })

  it('requires confirmation before a Mentor rejects', async () => {
    const user = userEvent.setup()
    const decide = vi.fn(async () => ({ kind: 'decided' as const, helpRequest: { ...saved, status: 'REJECTED' as const }, conversationId: null }))
    mount('/mentor/requests/saved-request', servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
      callables: createMockCallableClient({ respondToHelpRequest: decide }),
    }))
    await screen.findByRole('button', { name: 'Reject' })
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    expect(decide).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Reject request' }))
    await waitFor(() => expect(decide).toHaveBeenCalledOnce())
    expect(screen.getByRole('alert')).toHaveTextContent('Request rejected')
  })

  it('clears a pending decision and private detail while navigating to another request', async () => {
    const user = userEvent.setup()
    let emitSecond: ((item: F01HelpRequest | null) => void) | null = null
    const view = mount('/mentor/requests/saved-request', servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (id, onData) => { if (id === saved.id) onData(saved); else emitSecond = onData; return () => {} } },
    }))
    await user.click(await screen.findByRole('button', { name: 'Reject' }))
    expect(screen.getByRole('dialog', { name: 'Reject this request?' })).toBeInTheDocument()
    await act(async () => { await view.router.navigate('/mentor/requests/second') })
    expect(screen.queryByRole('dialog', { name: 'Reject this request?' })).not.toBeInTheDocument()
    expect(screen.queryByText('Sequence diagrams')).not.toBeInTheDocument()
    act(() => { emitSecond?.({ ...saved, id: 'second', title: 'Another question' }) })
    expect(await screen.findByText('Another question')).toBeInTheDocument()
  })

  it('retries a failed dashboard request subscription and shows persisted summary', async () => {
    const user = userEvent.setup()
    let subscriptions = 0
    mount('/student/dashboard', servicesFor('student', { helpRequests: {
      ...mockServices.helpRequests,
      subscribeStudentSummary: (_uid, onData, onError) => { if (++subscriptions === 1) onError(new Error('network')); else onData({ pendingCount: 1, acceptedCount: 0, rejectedCount: 0, openCount: 1, updatedAt: saved.updatedAt }); return () => {} },
      subscribeStudentPage: (_uid, _cursor, onData) => { onData([saved]); return () => {} },
    } }))
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Sequence diagrams')).toBeInTheDocument()
    expect(subscriptions).toBe(2)
  })

  it('keeps the dashboard error visible when the other request listener updates', async () => {
    let publishSummary: ((summary: { pendingCount: number; acceptedCount: number; rejectedCount: number; openCount: number; updatedAt: string }) => void) | null = null
    let failPage: ((error: unknown) => void) | null = null
    mount('/student/dashboard', servicesFor('student', { helpRequests: {
      ...mockServices.helpRequests,
      subscribeStudentSummary: (_uid, onData) => { publishSummary = onData; onData({ pendingCount: 1, acceptedCount: 0, rejectedCount: 0, openCount: 1, updatedAt: saved.updatedAt }); return () => {} },
      subscribeStudentPage: (_uid, _cursor, onData, onError) => { failPage = onError; onData([saved]); return () => {} },
    } }))
    await screen.findByText('Sequence diagrams')
    act(() => { failPage?.(new Error('denied')) })
    expect(screen.getByRole('alert')).toHaveTextContent('Request information is unavailable')
    act(() => { publishSummary?.({ pendingCount: 2, acceptedCount: 0, rejectedCount: 0, openCount: 2, updatedAt: saved.updatedAt }) })
    expect(screen.getByRole('alert')).toHaveTextContent('Request information is unavailable')
    expect(screen.queryByText('Sequence diagrams')).not.toBeInTheDocument()
  })
})
