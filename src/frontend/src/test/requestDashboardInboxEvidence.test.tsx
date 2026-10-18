import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest } from '@helpinus/shared'
import { MentorRequestsPage, RequestDetailPage, StudentRequestsPage } from '../pages/HelpRequestPages'
import { StudentDashboard } from '../pages/StudentDashboard'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { mockDashboard, mockServices } from '../services/mockServices'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const createdAt = '2026-10-16T08:00:00.000Z'
const decidedAt = '2026-10-16T09:00:00.000Z'
const base: F01HelpRequest = {
  id: 'own-pending', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
  studentDisplayName: 'Persisted Student Snapshot', mentorDisplayName: 'Persisted Mentor Snapshot',
  title: 'Own pending question', description: 'Persisted private question', status: 'PENDING', createdAt, updatedAt: createdAt,
}

function servicesFor(role: 'student' | 'mentor', helpRequests: HelpiNUSServices['helpRequests']): HelpiNUSServices {
  const user = role === 'student' ? student : mentor
  return { ...mockServices,
    session: { ...mockServices.session, getCurrent: async () => ({ user }), subscribe(listener) { listener({ user }); return () => {} } },
    dashboard: { getStudentDashboard: vi.fn(async () => mockDashboard) }, helpRequests,
    conversations: { ...mockServices.conversations, subscribeDetail(_id, onData) { onData(null); return () => {} } },
  }
}

function mount(path: string, services: HelpiNUSServices) {
  const router = createMemoryRouter([
    { path: '/student/dashboard', element: <StudentDashboard /> },
    { path: '/student/requests', element: <StudentRequestsPage /> },
    { path: '/mentor/requests', element: <MentorRequestsPage /> },
    { path: '/mentor/requests/:id', element: <RequestDetailPage role="mentor" /> },
  ], { initialEntries: [path] })
  return { router, ...render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>) }
}

describe('F01 dashboard and Mentor inbox requirement evidence (TC-017/018/019)', () => {
  beforeEach(() => sessionStorage.clear())

  it('shows the persisted 2/1/1/open3 own summary and preview, then changes once after a decision', async () => {
    const pending = [base, { ...base, id: 'own-pending-2', title: 'Second pending question' }]
    const accepted = { ...base, id: 'own-accepted', title: 'Own accepted question', status: 'ACCEPTED' as const, updatedAt: decidedAt }
    const rejected = { ...base, id: 'own-rejected', title: 'Own rejected question', status: 'REJECTED' as const, updatedAt: decidedAt }
    let publishSummary: ((value: { pendingCount: number; acceptedCount: number; rejectedCount: number; openCount: number; updatedAt: string }) => void) | undefined
    let publishPage: ((value: F01HelpRequest[]) => void) | undefined
    const subscribeSummary = vi.fn<HelpiNUSServices['helpRequests']['subscribeStudentSummary']>((uid, onData) => {
      expect(uid).toBe(student.id); publishSummary = onData; return () => {}
    })
    const subscribePage = vi.fn<HelpiNUSServices['helpRequests']['subscribeStudentPage']>((uid, cursor, onData) => {
      expect(uid).toBe(student.id); expect(cursor).toBeNull(); publishPage = onData; return () => {}
    })
    const services = servicesFor('student', { ...mockServices.helpRequests, subscribeStudentSummary: subscribeSummary, subscribeStudentPage: subscribePage })
    const view = mount('/student/dashboard', services)
    await waitFor(() => expect(publishSummary).toBeDefined())
    act(() => {
      publishSummary?.({ pendingCount: 2, acceptedCount: 1, rejectedCount: 1, openCount: 3, updatedAt: decidedAt })
      publishPage?.([accepted, rejected, ...pending])
    })
    const overview = await screen.findByRole('region', { name: 'Your learning overview' })
    expect(overview).toHaveTextContent('3Open help requests')
    expect(screen.getByText('Own accepted question')).toBeInTheDocument()
    expect(screen.getByText('Own rejected question')).toBeInTheDocument()
    expect(screen.getByText('Own pending question')).toBeInTheDocument()
    expect(screen.queryByText('Mock request')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/student/requests')
    expect(screen.queryByText(/all requests loaded/iu)).not.toBeInTheDocument()
    const transitioned = { ...pending[0]!, status: 'REJECTED' as const, updatedAt: decidedAt }
    act(() => {
      publishSummary?.({ pendingCount: 1, acceptedCount: 1, rejectedCount: 2, openCount: 2, updatedAt: decidedAt })
      publishPage?.([transitioned, accepted, rejected, pending[1]!])
    })
    expect(overview).toHaveTextContent('2Open help requests')
    expect(screen.getAllByText('REJECTED')).toHaveLength(2)
    expect(subscribeSummary).toHaveBeenCalledTimes(1)
    expect(subscribePage).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('renders 20+2 addressed pending requests in ascending source order with an exact child cursor (TC-018)', async () => {
    const first = Array.from({ length: 20 }, (_, index) => ({ ...base, id: `pending-${String(index).padStart(2, '0')}`, title: `Pending ${String(index).padStart(2, '0')}` }))
    const older = Array.from({ length: 2 }, (_, index) => ({ ...base, id: `pending-${20 + index}`, title: `Pending ${20 + index}` }))
    const cursors: Array<{ id: string; createdAt: string } | null> = []
    const subscribePending = vi.fn<HelpiNUSServices['helpRequests']['subscribeMentorPendingPage']>((uid, cursor, onData) => {
      expect(uid).toBe(mentor.id); cursors.push(cursor); onData(cursor ? older : first); return () => {}
    })
    const services = servicesFor('mentor', { ...mockServices.helpRequests, subscribeMentorPendingPage: subscribePending,
      subscribeMentorDecidedPage: (_uid, _cursor, onData) => { onData([]); return () => {} } })
    mount('/mentor/requests', services)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Load more requests' }))
    expect(await screen.findByText('Pending 21')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((row) => within(row).getByRole('heading').textContent))
      .toEqual([...first, ...older].map((item) => item.title))
    expect(cursors).toEqual([null, { id: 'pending-19', createdAt }])
    expect(new Set(screen.getAllByRole('listitem').map((row) => within(row).getByRole('heading').textContent)).size).toBe(22)
    expect(screen.queryByText('Foreign question')).not.toBeInTheDocument()
    expect(screen.queryByText('Decided question')).not.toBeInTheDocument()
  })

  it('moves one addressed decision from pending into deterministic decided order and shows private-safe persisted detail (TC-019)', async () => {
    const accepted = { ...base, id: 'decided-b', title: 'Accepted decided question', status: 'ACCEPTED' as const, updatedAt: decidedAt }
    const rejected = { ...base, id: 'decided-a', title: 'Rejected decided question', status: 'REJECTED' as const, updatedAt: decidedAt }
    let pendingPublish: ((value: F01HelpRequest[]) => void) | undefined
    let decidedPublish: ((value: F01HelpRequest[]) => void) | undefined
    const services = servicesFor('mentor', { ...mockServices.helpRequests,
      subscribeMentorPendingPage: (_uid, _cursor, onData) => { pendingPublish = onData; onData([base]); return () => {} },
      subscribeMentorDecidedPage: (_uid, _cursor, onData) => { decidedPublish = onData; onData([accepted, rejected]); return () => {} },
      subscribeDetail: (id, onData) => { onData([accepted, rejected].find((item) => item.id === id) ?? null); return () => {} },
    })
    const view = mount('/mentor/requests', services)
    expect(await screen.findByText('Own pending question')).toBeInTheDocument()
    act(() => {
      pendingPublish?.([])
      decidedPublish?.([accepted, rejected, { ...base, id: 'own-pending', status: 'REJECTED', updatedAt: decidedAt }])
    })
    expect(screen.queryByText('No pending requests.')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((row) => within(row).getByRole('heading').textContent))
      .toEqual([accepted.title, rejected.title, base.title])
    expect(screen.queryByText('Foreign question')).not.toBeInTheDocument()
    view.unmount()

    for (const item of [accepted, rejected]) {
      const detail = mount(`/mentor/requests/${item.id}`, services)
      expect(await screen.findByRole('heading', { name: item.title })).toBeInTheDocument()
      expect(screen.getByText('Persisted Student Snapshot')).toBeInTheDocument()
      expect(screen.getByText('Persisted private question')).toBeInTheDocument()
      expect(screen.getByText(item.status)).toBeInTheDocument()
      expect(await screen.findByText('CS2103T')).toBeInTheDocument()
      expect(screen.getByText('Decided').nextElementSibling?.querySelector('time')).toHaveAttribute('dateTime', item.updatedAt)
      expect(screen.queryByText(student.email)).not.toBeInTheDocument()
      expect(screen.queryByText(student.id)).not.toBeInTheDocument()
      expect(screen.queryByText('Foreign question')).not.toBeInTheDocument()
      detail.unmount()
    }
  })
})
