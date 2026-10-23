import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest } from '@helpinus/shared'
import { MentorRequestsPage, RequestDetailPage, RequestHelpPage, StudentRequestsPage } from '../pages/HelpRequestPages'
import { MentorDiscoveryPage } from '../pages/MentorDiscoveryPage'
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

function mount(path: string, services: HelpiNUSServices, requestState: { mentorName: string } | null = { mentorName: mentor.displayName }) {
  const requestEntry = path.startsWith('/student/mentors/') && path.includes('/request')
    ? { pathname: path.split('?')[0], search: path.includes('?') ? `?${path.split('?')[1]}` : '', state: requestState }
    : path
  const router = createMemoryRouter([
    { path: '/student/mentors/:mentorId/request', element: <RequestHelpPage /> },
    { path: '/student/requests', element: <StudentRequestsPage /> },
    { path: '/student/requests/:id', element: <RequestDetailPage role="student" /> },
    { path: '/mentor/requests', element: <MentorRequestsPage /> },
    { path: '/mentor/requests/:id', element: <RequestDetailPage role="mentor" /> },
    { path: '/student/mentors', element: <h1>Find a Mentor</h1> },
    { path: '/student/dashboard', element: <StudentDashboard /> },
  ], { initialEntries: [requestEntry] })
  return { ...render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>), router }
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('combobox', { name: 'Module' })
  await user.selectOptions(screen.getByRole('combobox', { name: 'Module' }), 'cs2103t')
  await user.type(screen.getByRole('textbox', { name: 'Question title' }), 'Sequence diagrams')
  await user.type(screen.getByRole('textbox', { name: 'Detailed question' }), 'Line one\nLine two')
}

describe('F01 request screens', () => {
  beforeEach(() => { sessionStorage.clear() })
  it('submits selected Mentor/module, navigates only after confirmed persistence', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async () => ({ kind: 'created' as const, helpRequest: saved }))
    mount('/student/mentors/mentor-01/request?moduleId=cs2103t', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }), subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
      callables: createMockCallableClient({ createHelpRequest: create }),
    }))
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('heading', { name: 'Request details' })).toBeInTheDocument()
    expect(await screen.findByText('Your request was saved.')).toBeInTheDocument()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ mentorId: 'mentor-01', moduleId: 'cs2103t', title: 'Sequence diagrams', description: 'Line one\nLine two', operationId: expect.any(String) }))
  })

  it('withholds success until the created callable resolves and an authorized saved detail is published', async () => {
    const user = userEvent.setup()
    const events: string[] = []
    let resolveCreate: ((result: { kind: 'created'; helpRequest: F01HelpRequest }) => void) | undefined
    let publishDetail: ((value: F01HelpRequest | null) => void) | undefined
    const create = vi.fn(() => {
      events.push('create invoked')
      return new Promise<{ kind: 'created'; helpRequest: F01HelpRequest }>((resolve) => { resolveCreate = resolve })
    })
    mount('/student/mentors/mentor-01/request?moduleId=cs2103t', servicesFor('student', {
      helpRequests: {
        ...mockServices.helpRequests,
        getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }),
        subscribeDetail: (id, onData) => {
          expect(id).toBe(saved.id)
          events.push('saved detail subscribed')
          publishDetail = onData
          return () => {}
        },
      },
      callables: createMockCallableClient({ createHelpRequest: create }),
    }))
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(create).toHaveBeenCalledOnce()
    expect(events).toEqual(['create invoked'])
    expect(screen.queryByText('Your request was saved.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Checking request…' })).toBeDisabled()

    await act(async () => { resolveCreate?.({ kind: 'created', helpRequest: saved }) })
    await waitFor(() => expect(events).toEqual(['create invoked', 'saved detail subscribed']))
    expect(screen.queryByText('Your request was saved.')).not.toBeInTheDocument()
    act(() => publishDetail?.({ ...saved, studentId: 'another-student' }))
    expect(screen.getByRole('alert')).toHaveTextContent('access has changed')
    expect(screen.queryByText('Your request was saved.')).not.toBeInTheDocument()
    act(() => publishDetail?.(saved))
    expect(await screen.findByText('Your request was saved.')).toBeInTheDocument()
    expect(screen.getByText('Sequence diagrams')).toBeInTheDocument()
  })

  it('identifies invalid fields and never calls create for a blank form', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    mount('/student/mentors/mentor-01/request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }) },
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

  it('enforces normalized text boundaries before the callable and preserves multiline literal text', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async (input: { description: string }) => ({ kind: 'created' as const, helpRequest: { ...saved, description: input.description } }))
    mount('/student/mentors/mentor-01/request?moduleId=cs2103t', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }), subscribeDetail: (_id, onData) => { onData({ ...saved, description: `${'d'.repeat(1981)}\n<script>x</script>` }); return () => {} } },
      callables: createMockCallableClient({ createHelpRequest: create }),
    }))
    const title = await screen.findByRole('textbox', { name: 'Question title' })
    const description = screen.getByRole('textbox', { name: 'Detailed question' })
    fireEvent.change(title, { target: { value: `  ${'t'.repeat(121)}  ` } })
    fireEvent.change(description, { target: { value: `  ${'d'.repeat(2001)}  ` } })
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(screen.getByText('Use no more than 120 characters.')).toBeInTheDocument()
    expect(screen.getByText('Use no more than 2,000 characters.')).toBeInTheDocument()
    expect(title).toHaveAttribute('aria-describedby', 'help-title-error')
    expect(description).toHaveAttribute('aria-describedby', 'help-description-error')
    expect(create).not.toHaveBeenCalled()
    const storedDraft = Object.keys(sessionStorage).find((key) => key.startsWith('f01-draft:'))
    expect(storedDraft).toBeDefined()
    expect(JSON.parse(sessionStorage.getItem(storedDraft!)!)).toMatchObject({ title: `  ${'t'.repeat(121)}  `, description: `  ${'d'.repeat(2001)}  ` })
    fireEvent.change(title, { target: { value: `  ${'t'.repeat(120)}  ` } })
    fireEvent.change(description, { target: { value: `  ${'d'.repeat(1981)}\n<script>x</script>  ` } })
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: 't'.repeat(120), description: `${'d'.repeat(1981)}\n<script>x</script>` }))
    expect(await screen.findByText(/<script>x<\/script>/u)).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })

  it.each([
    { field: 'Question title', invalid: ' \n ', message: 'Enter a question title.', errorId: 'help-title-error' },
    { field: 'Question title', invalid: `  ${'T'.repeat(121)}  `, message: 'Use no more than 120 characters.', errorId: 'help-title-error' },
    { field: 'Detailed question', invalid: ' \n ', message: 'Enter a detailed question.', errorId: 'help-description-error' },
    { field: 'Detailed question', invalid: `  ${'D'.repeat(2001)}  `, message: 'Use no more than 2,000 characters.', errorId: 'help-description-error' },
  ])('rejects $field invalid content independently, then keeps the corrected boundary draft', async ({ field, invalid, message, errorId }) => {
    const user = userEvent.setup()
    const create = vi.fn(async () => ({ kind: 'created' as const, helpRequest: saved }))
    mount('/student/mentors/mentor-01/request?moduleId=cs2103t', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }), subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
      callables: createMockCallableClient({ createHelpRequest: create }),
    }))
    const title = await screen.findByRole('textbox', { name: 'Question title' })
    const description = screen.getByRole('textbox', { name: 'Detailed question' })
    const goodTitle = 'T'.repeat(120)
    const goodDescription = 'D'.repeat(2000)
    fireEvent.change(title, { target: { value: field === 'Question title' ? invalid : `  ${goodTitle}  ` } })
    fireEvent.change(description, { target: { value: field === 'Detailed question' ? invalid : `  ${goodDescription}  ` } })
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    const badField = field === 'Question title' ? title : description
    const goodField = field === 'Question title' ? description : title
    expect(badField).toHaveAttribute('aria-invalid', 'true')
    expect(badField).toHaveAttribute('aria-describedby', errorId)
    expect(document.getElementById(errorId)).toHaveTextContent(message)
    expect(goodField).not.toHaveAttribute('aria-invalid', 'true')
    expect(create).not.toHaveBeenCalled()
    const draftKey = Object.keys(sessionStorage).find((key) => key.startsWith('f01-draft:'))!
    expect(JSON.parse(sessionStorage.getItem(draftKey)!)).toMatchObject({ title: (title as HTMLInputElement).value, description: (description as HTMLTextAreaElement).value })
    fireEvent.change(badField, { target: { value: field === 'Question title' ? `  ${goodTitle}  ` : `  ${goodDescription}  ` } })
    expect(document.getElementById(errorId)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: goodTitle, description: goodDescription }))
  })

  it('renders valid literal markup in both title and multiline detail as text', async () => {
    const user = userEvent.setup()
    const literalTitle = '<img src=x onerror=alert(1)>'
    const literalDescription = 'First line\n<script>alert(1)</script>\nLast line'
    const persisted = { ...saved, title: literalTitle, description: literalDescription }
    const create = vi.fn(async () => ({ kind: 'created' as const, helpRequest: persisted }))
    mount('/student/mentors/mentor-01/request?moduleId=cs2103t', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }), subscribeDetail: (_id, onData) => { onData(persisted); return () => {} } },
      callables: createMockCallableClient({ createHelpRequest: create }),
    }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'Question title' }), { target: { value: `  ${literalTitle}  ` } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Detailed question' }), { target: { value: `  ${literalDescription}  ` } })
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: literalTitle, description: literalDescription }))
    expect(await screen.findByRole('heading', { name: literalTitle })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Question' }).textContent).toContain(literalDescription)
    expect(document.querySelector('img, script')).toBeNull()
  })

  it('rejects an unsupported module deep link without substituting another module or writing', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    mount('/student/mentors/mentor-01/request?moduleId=stale-module', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }) },
      callables: createMockCallableClient({ createHelpRequest: create }),
    }))
    const module = await screen.findByRole('combobox', { name: 'Module' })
    expect(module).toHaveValue('')
    expect(screen.getByRole('option', { name: /CS2103T/u })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(screen.getByText('Choose a supported module.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('uses exact route IDs and refreshes the selected Mentor name from the targeted lookup', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    const services = servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }) },
      callables: createMockCallableClient({ createHelpRequest: create }),
    })
    const first = mount('/student/mentors', services)
    await act(async () => { await first.router.navigate('/student/mentors/mentor-01/request?moduleId=cs2103t', { state: { mentorName: 'Aisha Rahman' } }) })
    expect(await screen.findByRole('combobox', { name: 'Module' })).toHaveValue('cs2103t')
    expect(screen.getByText(/Ask Aisha Rahman about one supported module/u)).toBeInTheDocument()
    first.unmount()
    const refreshed = mount('/student/mentors/mentor-01/request?moduleId=cs2103t', services, null)
    expect(await screen.findByRole('combobox', { name: 'Module' })).toHaveValue('cs2103t')
    expect(screen.getByText(/Ask Aisha Rahman about one supported module/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled()
    expect(create).not.toHaveBeenCalled()
    refreshed.unmount()
    const labelOnly = mount('/student/mentors/mentor-01/request?moduleId=CS2103T', services)
    expect(await screen.findByRole('combobox', { name: 'Module' })).toHaveValue('')
    await user.type(screen.getByRole('textbox', { name: 'Question title' }), 'A question')
    await user.type(screen.getByRole('textbox', { name: 'Detailed question' }), 'Details')
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(screen.getByText('Choose a supported module.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
    labelOnly.unmount()
  })

  it('keeps a direct link neutral until the targeted lookup resolves, then permits the verified selection', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    let resolveSelection: ((value: { userId: string; displayName: string; moduleIds: string[] }) => void) | undefined
    mount('/student/mentors/mentor-01/request?moduleId=cs2103t', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: () => new Promise((resolve) => { resolveSelection = resolve }) },
      callables: createMockCallableClient({ createHelpRequest: create }),
    }), null)
    expect(screen.getByText('Ask your selected Mentor about one supported module.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
    await waitFor(() => expect(resolveSelection).toBeTypeOf('function'))
    await act(async () => resolveSelection?.({ userId: mentor.id, displayName: 'Current Mentor', moduleIds: ['cs2103t'] }))
    await screen.findByRole('combobox', { name: 'Module' })
    expect(screen.getByText('Ask Current Mentor about one supported module.')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Question title' }), 'A question')
    await user.type(screen.getByRole('textbox', { name: 'Detailed question' }), 'Details')
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled()
    expect(create).not.toHaveBeenCalled()
  })

  it('does not trust an unavailable, failed, or wrong-ID targeted lookup despite forged route context', async () => {
    const create = vi.fn()
    for (const response of [null, new Error('network'), { userId: 'different-mentor', displayName: 'Forged Mentor', moduleIds: ['cs2103t'] }]) {
      const view = mount('/student/mentors/mentor-01/request?moduleId=cs2103t', servicesFor('student', {
        helpRequests: { ...mockServices.helpRequests, getSelection: async () => { if (response instanceof Error) throw response; return response } },
        callables: createMockCallableClient({ createHelpRequest: create }),
      }), { mentorName: 'Forged route name' })
      expect(await screen.findByRole('alert')).toHaveTextContent(response instanceof Error ? 'could not load' : 'no longer available')
      expect(screen.getByText('Ask your selected Mentor about one supported module.')).toBeInTheDocument()
      expect(screen.queryByText(/Forged route name|Forged Mentor/u)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument()
      expect(create).not.toHaveBeenCalled()
      view.unmount()
    }
  })

  it('carries the selected Mentor name from the real discovery callable into the exact request route', async () => {
    const user = userEvent.setup()
    const discover = vi.fn(async () => ({ mentors: [{ userId: mentor.id, displayName: 'Verified Aisha', biography: '', moduleIds: ['cs2103t'] }], nextCursor: null }))
    const create = vi.fn()
    const getSelection = vi.fn(async () => ({ userId: mentor.id, displayName: 'Current Aisha', moduleIds: ['cs2103t'] }))
    const services = servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection },
      callables: createMockCallableClient({ discoverMentors: discover, createHelpRequest: create }),
    })
    const router = createMemoryRouter([
      { path: '/student/mentors', element: <MentorDiscoveryPage /> },
      { path: '/student/mentors/:mentorId/request', element: <RequestHelpPage /> },
      { path: '/student/requests/:id', element: <RequestDetailPage role="student" /> },
    ], { initialEntries: ['/student/mentors'] })
    render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
    const card = (await screen.findByRole('heading', { name: 'Verified Aisha' })).closest<HTMLElement>('.mentor-card')!
    await user.click(within(card).getByRole('button', { name: 'View details' }))
    await user.click(within(card).getByRole('button', { name: 'Ask for help' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Ask for help' })).getByRole('link', { name: 'Request help' }))
    expect(await screen.findByText('Ask Current Aisha about one supported module.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/student/mentors/${mentor.id}/request`)
    expect(router.state.location.search).toBe('')
    expect(router.state.location.state).toBeNull()
    expect(getSelection).toHaveBeenCalledWith(mentor.id)
    expect(discover).toHaveBeenCalledWith({ limit: 20 })
    expect(create).not.toHaveBeenCalled()
  })

  it('ignores forged route and saved-draft names, while retaining the draft and uncertain recovery payload', async () => {
    const create = vi.fn()
    const key = `f01-draft:${encodeURIComponent(student.id)}:${encodeURIComponent(mentor.id)}:${encodeURIComponent('cs2103t')}`
    sessionStorage.setItem(key, JSON.stringify({ moduleId: 'cs2103t', title: 'Saved title', description: 'Saved details', mentorName: 'Forged saved name', uncertain: null }))
    mount(`/student/mentors/${mentor.id}/request?moduleId=cs2103t`, servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }) },
      callables: createMockCallableClient({ createHelpRequest: create }),
    }), { mentorName: 'Forged route name' })
    expect(await screen.findByRole('combobox', { name: 'Module' })).toHaveValue('cs2103t')
    expect(screen.getByRole('textbox', { name: 'Question title' })).toHaveValue('Saved title')
    expect(screen.getByRole('textbox', { name: 'Detailed question' })).toHaveValue('Saved details')
    expect(screen.getByText(`Ask ${mentor.displayName} about one supported module.`)).toBeInTheDocument()
    expect(screen.queryByText(/Forged route name|Forged saved name/u)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled()
    expect(create).not.toHaveBeenCalled()
  })

  it('shows a module lookup failure and recovers on retry without claiming an empty catalogue', async () => {
    const user = userEvent.setup()
    let reads = 0
    mount('/student/mentors/mentor-01/request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }) },
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
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }) },
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
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }) },
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

  it('gives actionable, non-sensitive guidance for stale selection and Mentor account denial', async () => {
    const user = userEvent.setup()
    for (const [error, guidance] of [
      [{ code: 'functions/failed-precondition', details: { reason: 'SELECTION_INELIGIBLE' }, message: 'private mentor@example.test' }, 'Return to Mentor discovery and choose again.'],
      [{ code: 'functions/permission-denied', message: 'private mentor@example.test' }, 'Refresh your account or choose another Mentor and module.'],
    ] as const) {
      const view = mount('/student/mentors/mentor-01/request', servicesFor('student', {
        helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }) },
        callables: createMockCallableClient({ createHelpRequest: async () => { throw error } }),
      }))
      await fillForm(user)
      await user.click(screen.getByRole('button', { name: 'Send request' }))
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(guidance)
      expect(alert).not.toHaveTextContent('mentor@example.test')
      expect(screen.getByRole('textbox', { name: 'Question title' })).toHaveValue('Sequence diagrams')
      view.unmount()
      sessionStorage.clear()
    }
  })

  it('keeps the draft and links the existing request on a duplicate', async () => {
    const user = userEvent.setup()
    mount('/student/mentors/mentor-01/request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }) },
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
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }), subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
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

  it('blocks editing an uncertain attempt until reconciliation, then uses a new UUID for edited content', async () => {
    const user = userEvent.setup()
    const inputs: Array<{ operationId: string; title: string; description: string }> = []
    mount('/student/mentors/mentor-01/request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }), subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
      callables: createMockCallableClient({ createHelpRequest: async (input) => {
        inputs.push({ operationId: input.operationId, title: input.title, description: input.description })
        if (inputs.length === 1) throw new Error('timeout')
        if (inputs.length === 2) return { kind: 'duplicate', existingHelpRequestId: saved.id, currentStatus: 'PENDING' }
        return { kind: 'created', helpRequest: saved }
      } }),
    }))
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm')
    expect(screen.getByRole('textbox', { name: 'Question title' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Detailed question' })).toBeDisabled()
    expect(inputs).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Check this attempt again' }))
    expect(await screen.findByText('No new request was sent. You already have a pending request for this Mentor and module. Your draft is still here.')).toBeInTheDocument()
    expect(inputs).toHaveLength(2)
    expect(inputs[1]).toEqual(inputs[0])
    const titleField = screen.getByRole('textbox', { name: 'Question title' })
    expect(titleField).toBeEnabled()
    await user.clear(titleField)
    await user.type(titleField, 'Edited sequence diagrams')
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByText('Your request was saved.')).toBeInTheDocument()
    expect(inputs).toHaveLength(3)
    expect(inputs[2]?.operationId).not.toBe(inputs[0]?.operationId)
    expect(inputs[2]).toMatchObject({ title: 'Edited sequence diagrams', description: inputs[0]?.description })
  })

  it('retains the uncertain operation ID across refresh', async () => {
    const user = userEvent.setup()
    const inputs: string[] = []
    const services = servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }), subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
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
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }), subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
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
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => selectionAvailable ? { userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] } : null, subscribeDetail: (_id, onData) => { onData(saved); return () => {} } },
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
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => selectionAvailable ? { userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] } : null },
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
      helpRequests: { ...mockServices.helpRequests, getSelection: async (id) => ({ userId: id, displayName: id === mentor.id ? mentor.displayName : 'Another Mentor', moduleIds: ['cs2103t'] }) },
      callables: createMockCallableClient({ createHelpRequest: async (input) => { inputs.push(input.mentorId); if (inputs.length === 1) throw new Error('timeout'); return { kind: 'duplicate', existingHelpRequestId: saved.id, currentStatus: 'PENDING' } } }),
    })
    const view = mount('/student/mentors/mentor-01/request', services)
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm')
    await act(async () => { await view.router.navigate('/student/mentors/mentor-02/request', { state: { mentorName: 'Another Mentor' } }) })
    await screen.findByRole('button', { name: 'Send request' })
    expect(screen.getByRole('textbox', { name: 'Question title' })).toHaveValue('')
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(inputs).toEqual(['mentor-01', 'mentor-02'])
  })

  it('reports the current terminal status on a duplicate receipt replay', async () => {
    const user = userEvent.setup()
    mount('/student/mentors/mentor-01/request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }) },
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

  it('distinguishes confirmed empty from loading and retains ordered Student rows through page failure, retry and live cursor reset (TC-015)', async () => {
    const user = userEvent.setup()
    const zeroCallbacks: Array<(items: F01HelpRequest[]) => void> = []
    const emptyView = mount('/student/requests', servicesFor('student', { helpRequests: {
      ...mockServices.helpRequests,
      subscribeStudentPage: (_uid, _cursor, onData) => { zeroCallbacks.push(onData); return () => {} },
    } }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading requests…')
    expect(screen.queryByText('No requests yet.')).not.toBeInTheDocument()
    await waitFor(() => expect(zeroCallbacks).toHaveLength(1))
    act(() => zeroCallbacks[0]?.([]))
    expect(screen.getByText('No requests yet.')).toBeInTheDocument()
    emptyView.unmount()

    const firstPage = Array.from({ length: 20 }, (_, index) => ({ ...saved, id: `history-${index}`, title: `History ${index}` }))
    let publishFirst: ((items: F01HelpRequest[]) => void) | undefined
    const childCursors: Array<{ createdAt: string; id: string }> = []
    const childStops: Array<ReturnType<typeof vi.fn>> = []
    let attempts = 0
    const view = mount('/student/requests', servicesFor('student', { helpRequests: {
      ...mockServices.helpRequests,
      subscribeStudentPage: (_uid, cursor, onData, onError) => {
        if (!cursor) { publishFirst = onData; onData(firstPage); return () => {} }
        childCursors.push(cursor)
        const stop = vi.fn(); childStops.push(stop)
        attempts += 1
        if (attempts === 1) onError({ code: 'unavailable' })
        else onData([{ ...saved, id: 'older-history', title: 'Older history' }])
        return stop
      },
    } }))
    expect(screen.queryByText('No requests yet.')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Load more requests' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Requests are unavailable')
    expect(screen.getAllByRole('listitem')).toHaveLength(20)
    expect(screen.getByText('History 0')).toBeInTheDocument()
    expect(screen.getByText('History 19')).toBeInTheDocument()
    expect(screen.queryByText('No requests yet.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Older history')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(21)
    expect(childCursors).toEqual([{ id: 'history-19', createdAt: saved.createdAt }, { id: 'history-19', createdAt: saved.createdAt }])
    expect(childStops[0]).toHaveBeenCalledOnce()
    act(() => publishFirst?.([{ ...firstPage[0], status: 'REJECTED', updatedAt: '2026-10-17T00:00:00.000Z' }, ...firstPage.slice(1)]))
    expect(screen.queryByText('Older history')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load more requests' })).toBeInTheDocument()
    expect(childStops[1]).toHaveBeenCalledOnce()
    view.unmount()
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

  it('keeps historical requests readable when module metadata is missing or unavailable', async () => {
    const historical = { ...saved, moduleId: 'retired-module' }
    const studentView = mount('/student/requests/saved-request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { onData(historical); return () => {} } },
      modules: { ...mockServices.modules, getById: async () => null },
    }))
    expect(await screen.findByText('Module information unavailable')).toBeInTheDocument()
    expect(screen.getByText('Sequence diagrams')).toBeInTheDocument()
    expect(screen.queryByText('retired-module')).not.toBeInTheDocument()
    studentView.unmount()

    mount('/mentor/requests/saved-request', servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { onData(historical); return () => {} } },
      modules: { ...mockServices.modules, getById: async () => { throw new Error('malformed catalogue metadata') } },
    }))
    expect(await screen.findByText('Module information unavailable')).toBeInTheDocument()
    expect(screen.getByText('Sequence diagrams')).toBeInTheDocument()
    expect(screen.queryByText('retired-module')).not.toBeInTheDocument()
  })

  it('offers no close or withdraw control for any F01 request state in either role', async () => {
    for (const role of ['student', 'mentor'] as const) {
      for (const status of ['PENDING', 'ACCEPTED', 'REJECTED'] as const) {
        const view = mount(`/${role}/requests/saved-request`, servicesFor(role, {
          helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { onData({ ...saved, status }); return () => {} } },
          conversations: { ...mockServices.conversations, subscribeDetail: (_id, onData) => { onData(null); return () => {} } },
        }))
        expect(await screen.findByText(status)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /close|withdraw/iu })).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /close|withdraw/iu })).not.toBeInTheDocument()
        expect(screen.queryByText('CLOSED')).not.toBeInTheDocument()
        view.unmount()
      }
    }
  })

  it('renders verified inactive module codes and hides unresolvable IDs in Student history', async () => {
    const old = { ...saved, id: 'old-request', moduleId: 'missing-module', title: 'Older question' }
    mount('/student/requests', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, subscribeStudentPage: (_uid, _cursor, onData) => { onData([saved, old]); return () => {} } },
      modules: { ...mockServices.modules, getById: async (id) => id === saved.moduleId ? { ...(await mockServices.modules.getById(id))!, active: false } : null },
    }))
    expect(await screen.findByText('CS2103T')).toBeInTheDocument()
    expect(await screen.findByText('Module information unavailable')).toBeInTheDocument()
    expect(screen.queryByText('missing-module')).not.toBeInTheDocument()
    expect(screen.getByText('Older question')).toBeInTheDocument()
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

  it('shows the accepted state and conversation action without a duplicate success notice', async () => {
    const user = userEvent.setup()
    const accepted = { ...saved, status: 'ACCEPTED' as const }
    let publishRequest: ((value: F01HelpRequest | null) => void) | null = null
    mount('/mentor/requests/saved-request', servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { publishRequest = onData; onData(saved); return () => {} } },
      conversations: { ...mockServices.conversations, subscribeDetail: (_id, onData) => { onData({ request: accepted }); return () => {} } },
      callables: createMockCallableClient({ respondToHelpRequest: async () => ({ kind: 'decided', helpRequest: accepted, conversationId: saved.id }) }),
    }))
    await user.click(await screen.findByRole('button', { name: 'Accept' }))
    await user.click(screen.getByRole('button', { name: 'Accept request' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    act(() => publishRequest?.(accepted))
    const open = await screen.findByRole('link', { name: 'Open conversation' })
    expect(open).toHaveClass('button', 'button-primary')
    expect(screen.getByText('ACCEPTED')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Checking accepted conversation…')).not.toBeInTheDocument())
    expect(screen.queryByText('Request accepted.')).not.toBeInTheDocument()
  })

  it('does not offer a chat link for an accepted request whose conversation read fails', async () => {
    const accepted = { ...saved, status: 'ACCEPTED' as const }
    mount('/student/requests/saved-request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { onData(accepted); return () => {} } },
      conversations: { ...mockServices.conversations, subscribeDetail: (_id, _onData, onError) => { onError(new Error('unavailable')); return () => {} } },
    }))
    expect(await screen.findByText('ACCEPTED')).toBeInTheDocument()
    expect(await screen.findByText(/This conversation needs support review/u)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open conversation' })).not.toBeInTheDocument()
  })

  it('shows support without a chat link on accepted request detail for both roles when the pair is missing (F01-TC-034)', async () => {
    const accepted = { ...saved, status: 'ACCEPTED' as const }
    for (const role of ['student', 'mentor'] as const) {
      const view = mount(`/${role}/requests/saved-request`, servicesFor(role, {
        helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { onData(accepted); return () => {} } },
        conversations: { ...mockServices.conversations, subscribeDetail: (_id, onData) => { onData(null); return () => {} } },
      }))
      expect(await screen.findByText('ACCEPTED')).toBeInTheDocument()
      expect(await screen.findByText(/This conversation needs support review/u)).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Open conversation' })).not.toBeInTheDocument()
      view.unmount()
    }
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

  it('reconciles a lost acceptance reply through live request and conversation reads without a new intention', async () => {
    const user = userEvent.setup()
    const accepted = { ...saved, status: 'ACCEPTED' as const }
    const attempts: Array<{ operationId: string; helpRequestId: string; response: string }> = []
    let publishRequest: ((item: F01HelpRequest | null) => void) | null = null
    let publishConversation: ((detail: { request: F01HelpRequest } | null) => void) | null = null
    const decide = vi.fn(async (input: { operationId: string; helpRequestId: string; response: string }) => {
      attempts.push(input)
      throw new Error('callable reply lost')
    })
    mount('/mentor/requests/saved-request', servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { publishRequest = onData; onData(saved); return () => {} } },
      conversations: { ...mockServices.conversations, subscribeDetail: (_id, onData) => { publishConversation = onData; return () => {} } },
      callables: createMockCallableClient({ respondToHelpRequest: decide }),
    }))
    await user.click(await screen.findByRole('button', { name: 'Accept' }))
    await user.click(screen.getByRole('button', { name: 'Accept request' }))
    expect(await screen.findByText(/could not confirm the decision/u)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open conversation' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry same decision' }))
    await waitFor(() => expect(attempts).toHaveLength(2))
    expect(attempts[1]).toEqual(attempts[0])
    expect(attempts[0]).toEqual({ operationId: expect.any(String), helpRequestId: saved.id, response: 'ACCEPTED' })
    act(() => publishRequest?.(accepted))
    expect(screen.getByText('ACCEPTED')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open conversation' })).not.toBeInTheDocument()
    act(() => publishConversation?.({ request: accepted }))
    expect(await screen.findByRole('link', { name: 'Open conversation' })).toHaveAttribute('href', `/mentor/conversations/${saved.id}`)
    expect(decide).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Request accepted.')).not.toBeInTheDocument()
  })

  it('reconciles a committed lost reply after reload from the accepted parent and matching conversation without a second decision', async () => {
    const user = userEvent.setup()
    const accepted = { ...saved, status: 'ACCEPTED' as const }
    const attempts: Array<{ operationId: string; helpRequestId: string; response: string }> = []
    let durable = false
    let publishConversation: ((detail: { request: F01HelpRequest } | null) => void) | undefined
    const services = servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { onData(durable ? accepted : saved); return () => {} } },
      conversations: { ...mockServices.conversations, subscribeDetail: (_id, onData) => { publishConversation = onData; return () => {} } },
      callables: createMockCallableClient({ respondToHelpRequest: async (input) => {
        attempts.push(input)
        durable = true
        throw new Error('reply dropped after server commit')
      } }),
    })
    const first = mount('/mentor/requests/saved-request', services)
    await user.click(await screen.findByRole('button', { name: 'Accept' }))
    await user.click(screen.getByRole('button', { name: 'Accept request' }))
    expect(await screen.findByText(/could not confirm the decision/u)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open conversation' })).not.toBeInTheDocument()
    expect(attempts).toEqual([{ operationId: expect.any(String), helpRequestId: saved.id, response: 'ACCEPTED' }])
    first.unmount()

    mount('/mentor/requests/saved-request', services)
    expect(await screen.findByText('ACCEPTED')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open conversation' })).not.toBeInTheDocument()
    expect(attempts).toHaveLength(1)
    act(() => publishConversation?.({ request: accepted }))
    expect(await screen.findByRole('link', { name: 'Open conversation' })).toHaveAttribute('href', `/mentor/conversations/${saved.id}`)
    expect(attempts).toHaveLength(1)
    expect(screen.queryByText('Request accepted.')).not.toBeInTheDocument()
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

  it('distinguishes pending-list loading, denial, and empty; ignores a late callback after retry', async () => {
    const user = userEvent.setup()
    const pendingCallbacks: Array<(items: F01HelpRequest[]) => void> = []
    const pendingErrors: Array<(error: unknown) => void> = []
    const unsubscribers: Array<ReturnType<typeof vi.fn>> = []
    const view = mount('/mentor/requests', servicesFor('mentor', { helpRequests: {
      ...mockServices.helpRequests,
      subscribeMentorPendingPage: (_uid, _cursor, onData, onError) => {
        pendingCallbacks.push(onData)
        pendingErrors.push(onError)
        const unsubscribe = vi.fn()
        unsubscribers.push(unsubscribe)
        return unsubscribe
      },
      subscribeMentorDecidedPage: (_uid, _cursor, onData) => { onData([]); return () => {} },
    } }))
    expect(screen.getAllByText('Loading requests…')).toHaveLength(2)
    expect(screen.queryByText('No pending requests.')).not.toBeInTheDocument()
    await waitFor(() => expect(pendingCallbacks).toHaveLength(1))
    act(() => pendingErrors[0]?.({ code: 'permission-denied' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Requests are unavailable')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(pendingCallbacks).toHaveLength(2))
    expect(unsubscribers[0]).toHaveBeenCalledOnce()
    act(() => pendingCallbacks[0]?.([saved]))
    expect(screen.queryByText('Sequence diagrams')).not.toBeInTheDocument()
    act(() => pendingCallbacks[1]?.([]))
    expect(screen.getByText('No pending requests.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    view.unmount()
    expect(unsubscribers[1]).toHaveBeenCalledOnce()
  })

  it('keeps a full Mentor page visible when continuation fails and retries one child listener', async () => {
    const user = userEvent.setup()
    const firstPage = Array.from({ length: 20 }, (_, index) => ({ ...saved, id: `pending-${index}`, title: `Pending ${index}` }))
    const rootUnsubscribe = vi.fn()
    const childUnsubscribes: Array<ReturnType<typeof vi.fn>> = []
    let childSubscriptions = 0
    const view = mount('/mentor/requests', servicesFor('mentor', { helpRequests: {
      ...mockServices.helpRequests,
      subscribeMentorPendingPage: (_uid, cursor, onData, onError) => {
        if (!cursor) { onData(firstPage); return rootUnsubscribe }
        childSubscriptions += 1
        const unsubscribe = vi.fn()
        childUnsubscribes.push(unsubscribe)
        if (childSubscriptions === 1) onError(new Error('page unavailable'))
        else onData([{ ...saved, id: 'older-pending', title: 'Older pending' }])
        return unsubscribe
      },
      subscribeMentorDecidedPage: (_uid, _cursor, onData) => { onData([]); return () => {} },
    } }))
    await user.click(await screen.findByRole('button', { name: 'Load more requests' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Requests are unavailable')
    expect(screen.getByText('Pending 0')).toBeInTheDocument()
    expect(screen.getByText('Pending 19')).toBeInTheDocument()
    expect(screen.queryByText('No pending requests.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Older pending')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(21)
    expect(childSubscriptions).toBe(2)
    expect(childUnsubscribes[0]).toHaveBeenCalledOnce()
    view.unmount()
    expect(rootUnsubscribe).toHaveBeenCalledOnce()
    expect(childUnsubscribes[1]).toHaveBeenCalledOnce()
  })

  it('moves the Mentor pending list through loading, confirmed empty, partial, page failure, denial and one-listener retry (TC-020)', async () => {
    const user = userEvent.setup()
    const firstPage = Array.from({ length: 20 }, (_, index) => ({ ...saved, id: `mentor-list-${index}`, title: `Mentor list ${index}` }))
    const roots: Array<{ onData: (items: F01HelpRequest[]) => void; onError: (error: unknown) => void; stop: ReturnType<typeof vi.fn> }> = []
    const children: Array<{ cursor: { id: string; createdAt: string }; onData: (items: F01HelpRequest[]) => void; onError: (error: unknown) => void; stop: ReturnType<typeof vi.fn> }> = []
    const view = mount('/mentor/requests', servicesFor('mentor', { helpRequests: {
      ...mockServices.helpRequests,
      subscribeMentorPendingPage: (_uid, cursor, onData, onError) => {
        const stop = vi.fn()
        if (cursor) children.push({ cursor, onData, onError, stop })
        else roots.push({ onData, onError, stop })
        return stop
      },
      subscribeMentorDecidedPage: (_uid, _cursor, onData) => { onData([]); return () => {} },
    } }))
    expect(screen.getAllByText('Loading requests…')).toHaveLength(2)
    await waitFor(() => expect(roots).toHaveLength(1))
    act(() => roots[0]?.onData([]))
    expect(screen.getByText('No pending requests.')).toBeInTheDocument()
    act(() => roots[0]?.onData(firstPage))
    expect(screen.queryByText('No pending requests.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load more requests' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load more requests' }))
    expect(children).toHaveLength(1)
    expect(children[0]?.cursor).toEqual({ id: 'mentor-list-19', createdAt: saved.createdAt })
    expect(screen.getByText('Mentor list 0')).toBeInTheDocument()
    act(() => children[0]?.onError({ code: 'unavailable' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Requests are unavailable')
    expect(screen.queryByText('No pending requests.')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(children).toHaveLength(2))
    expect(children[0]?.stop).toHaveBeenCalledOnce()
    act(() => children[1]?.onData([{ ...saved, id: 'mentor-older', title: 'Mentor older' }]))
    expect(screen.getAllByRole('listitem')).toHaveLength(21)
    act(() => roots[0]?.onError({ code: 'permission-denied' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Requests are unavailable')
    expect(screen.queryByText('Mentor older')).not.toBeInTheDocument()
    expect(children[1]?.stop).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(roots).toHaveLength(2))
    expect(roots[0]?.stop).toHaveBeenCalledOnce()
    act(() => roots[0]?.onData(firstPage))
    expect(screen.queryByText('Mentor list 0')).not.toBeInTheDocument()
    act(() => roots[1]?.onData(firstPage))
    expect(screen.getAllByRole('listitem')).toHaveLength(20)
    expect(roots).toHaveLength(2)
    view.unmount()
    expect(roots[1]?.stop).toHaveBeenCalledOnce()
  })

  it('clears private request detail on a foreign result or listener denial', async () => {
    let publish: ((item: F01HelpRequest | null) => void) | null = null
    let fail: ((error: unknown) => void) | null = null
    mount('/student/requests/saved-request', servicesFor('student', { helpRequests: {
      ...mockServices.helpRequests,
      subscribeDetail: (_id, onData, onError) => { publish = onData; fail = onError; onData(saved); return () => {} },
    } }))
    expect(await screen.findByText('Sequence diagrams')).toBeInTheDocument()
    act(() => publish?.({ ...saved, studentId: 'another-student', title: 'Private foreign question' }))
    expect(screen.getByRole('alert')).toHaveTextContent('access has changed')
    expect(screen.queryByText('Sequence diagrams')).not.toBeInTheDocument()
    expect(screen.queryByText('Private foreign question')).not.toBeInTheDocument()
    act(() => fail?.({ code: 'permission-denied' }))
    expect(screen.queryByText('Line one')).not.toBeInTheDocument()
  })

  it('keeps decision controls disabled until the callable resolves and shows the actual conflict', async () => {
    const user = userEvent.setup()
    let settle: ((value: { kind: 'conflict'; actualStatus: 'REJECTED' }) => void) | null = null
    const decide = vi.fn(() => new Promise<{ kind: 'conflict'; actualStatus: 'REJECTED' }>((resolve) => { settle = resolve }))
    let publish: ((item: F01HelpRequest | null) => void) | null = null
    mount('/mentor/requests/saved-request', servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { publish = onData; onData(saved); return () => {} } },
      callables: createMockCallableClient({ respondToHelpRequest: decide }),
    }))
    await user.click(await screen.findByRole('button', { name: 'Accept' }))
    await user.click(screen.getByRole('button', { name: 'Accept request' }))
    expect(decide).toHaveBeenCalledOnce()
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ helpRequestId: saved.id, response: 'ACCEPTED', operationId: expect.any(String) }))
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.queryByText('Request accepted.')).not.toBeInTheDocument()
    await act(async () => { settle?.({ kind: 'conflict', actualStatus: 'REJECTED' }) })
    act(() => publish?.({ ...saved, status: 'REJECTED' }))
    expect(screen.getByText('REJECTED')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('already rejected')
    expect(screen.queryByRole('link', { name: 'Open conversation' })).not.toBeInTheDocument()
  })

  it('stops an uncertain acceptance when the live request shows the opposite terminal decision', async () => {
    const user = userEvent.setup()
    let publish: ((item: F01HelpRequest | null) => void) | null = null
    const decide = vi.fn(async () => { throw new Error('transport timeout') })
    mount('/mentor/requests/saved-request', servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { publish = onData; onData(saved); return () => {} } },
      callables: createMockCallableClient({ respondToHelpRequest: decide }),
    }))
    await user.click(await screen.findByRole('button', { name: 'Accept' }))
    await user.click(screen.getByRole('button', { name: 'Accept request' }))
    expect(await screen.findByText(/could not confirm the decision/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
    act(() => publish?.({ ...saved, status: 'REJECTED', updatedAt: '2026-10-16T09:00:00.000Z' }))
    expect(screen.getByText('REJECTED')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry same decision' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open conversation' })).not.toBeInTheDocument()
    expect(decide).toHaveBeenCalledOnce()
  })
})
