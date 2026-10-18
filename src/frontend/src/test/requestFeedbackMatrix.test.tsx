import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateHelpRequestInput, F01HelpRequest, RespondToHelpRequestInput } from '@helpinus/shared'
import { RequestDetailPage, RequestHelpPage } from '../pages/HelpRequestPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { createMockCallableClient, mockDashboard, mockServices } from '../services/mockServices'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const saved: F01HelpRequest = {
  id: 'own-pending-duplicate', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Earlier question', description: 'Earlier text only', status: 'PENDING',
  createdAt: '2026-10-16T08:00:00.000Z', updatedAt: '2026-10-16T08:00:00.000Z',
}

function servicesFor(role: 'student' | 'mentor', overrides: Partial<HelpiNUSServices> = {}): HelpiNUSServices {
  const user = role === 'student' ? student : mentor
  return { ...mockServices,
    session: { ...mockServices.session, getCurrent: async () => ({ user }), subscribe(listener) { listener({ user }); return () => {} } },
    ...overrides,
  }
}

function mount(path: string, services: HelpiNUSServices) {
  const router = createMemoryRouter([
    { path: '/student/mentors/:mentorId/request', element: <RequestHelpPage /> },
    { path: '/student/requests/:id', element: <RequestDetailPage role="student" /> },
    { path: '/mentor/requests/:id', element: <RequestDetailPage role="mentor" /> },
  ], { initialEntries: [path] })
  return { router, ...render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>) }
}

async function fill(user: ReturnType<typeof userEvent.setup>, title = 'Changed text not delivered') {
  await screen.findByRole('combobox', { name: 'Module' })
  await user.selectOptions(screen.getByRole('combobox', { name: 'Module' }), 'cs2103t')
  await user.type(screen.getByRole('textbox', { name: 'Question title' }), title)
  await user.type(screen.getByRole('textbox', { name: 'Detailed question' }), 'New description not delivered')
}

describe('F01 submission and decision feedback matrix (TC-042/043)', () => {
  beforeEach(() => sessionStorage.clear())

  it('says changed duplicate text was not delivered, keeps the draft and links the own pending request', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async (input: CreateHelpRequestInput) => {
      expect(input.operationId).toMatch(/^[0-9a-f-]{36}$/u)
      return { kind: 'duplicate' as const, existingHelpRequestId: saved.id, currentStatus: 'PENDING' as const }
    })
    mount('/student/mentors/mentor-01/request', servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests, getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }) },
      callables: createMockCallableClient({ createHelpRequest: create }),
    }))
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByText(/No new request was sent/)).toHaveTextContent('already have a pending request')
    expect(screen.getByRole('textbox', { name: 'Question title' })).toHaveValue('Changed text not delivered')
    expect(screen.getByRole('textbox', { name: 'Detailed question' })).toHaveValue('New description not delivered')
    expect(screen.getByRole('link', { name: 'View existing request' })).toHaveAttribute('href', `/student/requests/${saved.id}`)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0]).toMatchObject({ mentorId: mentor.id, moduleId: 'cs2103t', title: 'Changed text not delivered', description: 'New description not delivered' })
    expect(screen.queryByText('Your request was saved.')).not.toBeInTheDocument()
  })

  it('freezes an uncertain UUID/payload, gives stale-selection correction, and waits for authorized persisted success', async () => {
    const user = userEvent.setup()
    const attempts: CreateHelpRequestInput[] = []
    let resolveCreated: ((value: { kind: 'created'; helpRequest: F01HelpRequest }) => void) | undefined
    let publishDetail: ((value: F01HelpRequest | null) => void) | undefined
    const create = vi.fn((input: CreateHelpRequestInput) => {
      attempts.push(input)
      if (attempts.length === 1) return Promise.reject(new Error('timeout'))
      if (attempts.length === 2) return Promise.reject({ code: 'functions/failed-precondition', details: { reason: 'SELECTION_INELIGIBLE' } })
      return new Promise<{ kind: 'created'; helpRequest: F01HelpRequest }>((resolve) => { resolveCreated = resolve })
    })
    const services = servicesFor('student', {
      helpRequests: { ...mockServices.helpRequests,
        getSelection: async () => ({ userId: mentor.id, displayName: mentor.displayName, moduleIds: ['cs2103t'] }),
        subscribeDetail: (_id, onData) => { publishDetail = onData; return () => {} },
      },
      callables: createMockCallableClient({ createHelpRequest: create }),
    })
    const view = mount('/student/mentors/mentor-01/request', services)
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm whether your request was sent')
    expect(screen.getByRole('textbox', { name: 'Question title' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Detailed question' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Check this attempt again' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Return to Mentor discovery and choose again')
    expect(attempts[1]).toEqual(attempts[0])
    expect(screen.getByRole('textbox', { name: 'Question title' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(attempts[2]?.operationId).not.toBe(attempts[0]?.operationId)
    expect(attempts[2]).toMatchObject({ mentorId: mentor.id, moduleId: 'cs2103t', title: 'Changed text not delivered', description: 'New description not delivered' })
    expect(screen.getByRole('button', { name: 'Checking request…' })).toBeDisabled()
    expect(screen.queryByText('Your request was saved.')).not.toBeInTheDocument()
    await act(async () => resolveCreated?.({ kind: 'created', helpRequest: { ...saved, title: 'Changed text not delivered' } }))
    expect(await screen.findByRole('status')).not.toHaveTextContent('Your request was saved.')
    act(() => publishDetail?.({ ...saved, title: 'Changed text not delivered' }))
    expect(await screen.findByText('Your request was saved.')).toBeInTheDocument()
    expect(view.router.state.location.pathname).toBe(`/student/requests/${saved.id}`)
  })

  it('requires confirmation, disables actions while checking, preserves retry intent and reports opposite outcome without false acceptance', async () => {
    const user = userEvent.setup()
    const calls: RespondToHelpRequestInput[] = []
    let publish: ((value: F01HelpRequest | null) => void) | undefined
    let settle: ((value: { kind: 'conflict'; actualStatus: 'REJECTED' }) => void) | undefined
    const decide = vi.fn((input: RespondToHelpRequestInput) => {
      calls.push(input)
      if (calls.length === 1) return Promise.reject(new Error('transient outage'))
      return new Promise<{ kind: 'conflict'; actualStatus: 'REJECTED' }>((resolve) => { settle = resolve })
    })
    mount(`/mentor/requests/${saved.id}`, servicesFor('mentor', {
      helpRequests: { ...mockServices.helpRequests, subscribeDetail: (_id, onData) => { publish = onData; onData(saved); return () => {} } },
      callables: createMockCallableClient({ respondToHelpRequest: decide }),
    }))
    const trigger = await screen.findByRole('button', { name: 'Accept' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Accept this request?' })
    expect(decide).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(decide).not.toHaveBeenCalled()
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Accept request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm the decision')
    expect(calls).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Retry same decision' }))
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.queryByText('Request accepted.')).not.toBeInTheDocument()
    await act(async () => settle?.({ kind: 'conflict', actualStatus: 'REJECTED' }))
    act(() => publish?.({ ...saved, status: 'REJECTED', updatedAt: '2026-10-16T09:00:00.000Z' }))
    expect(screen.getByText('REJECTED')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('already rejected')
    expect(screen.queryByRole('link', { name: 'Open conversation' })).not.toBeInTheDocument()
    expect(screen.queryByText('Request accepted.')).not.toBeInTheDocument()
  })
})
