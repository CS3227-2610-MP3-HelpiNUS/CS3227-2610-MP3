import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { F01HelpRequest } from '@helpinus/shared'
import { MentorRequestsPage, RequestDetailPage, StudentRequestsPage } from '../pages/HelpRequestPages'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { mockDashboard, mockServices } from '../services/mockServices'

const firestoreMocks = vi.hoisted(() => ({ getDoc: vi.fn() }))
vi.mock('../services/firebase', () => ({ firebase: { auth: {}, firestore: {}, functions: {} } }))
vi.mock('firebase/firestore', async (original) => ({ ...(await original<typeof import('firebase/firestore')>()),
  doc: (_db: unknown, _collection: string, id: string) => id,
  getDoc: firestoreMocks.getDoc,
}))
import { firebaseServices } from '../services/firebaseServices'

const student = mockDashboard.user
const mentor = mockDashboard.mentors[0].user
const moduleId = 'historical-module-123'
const createdAt = '2026-10-16T08:00:00.000Z'
const acceptedAt = '2026-10-16T09:00:00.000Z'
const rejectedAt = '2026-10-16T10:00:00.000Z'
const accepted: F01HelpRequest = {
  id: 'accepted-history', studentId: student.id, mentorId: mentor.id, moduleId,
  studentDisplayName: student.displayName, mentorDisplayName: mentor.displayName,
  title: 'Accepted history question', description: 'Persisted accepted question',
  status: 'ACCEPTED', createdAt, updatedAt: acceptedAt,
}
const rejected: F01HelpRequest = { ...accepted, id: 'rejected-history', title: 'Rejected history question',
  description: 'Persisted rejected question', status: 'REJECTED', updatedAt: rejectedAt }

function servicesFor(role: 'student' | 'mentor', items: F01HelpRequest[]): HelpiNUSServices {
  const user = role === 'student' ? student : mentor
  return { ...mockServices,
    session: { ...mockServices.session, getCurrent: async () => ({ user }), subscribe(listener) { listener({ user }); return () => {} } },
    modules: firebaseServices.modules,
    helpRequests: { ...mockServices.helpRequests,
      subscribeStudentPage: (_uid, _cursor, onData) => { onData(items); return () => {} },
      subscribeMentorPendingPage: (_uid, _cursor, onData) => { onData([]); return () => {} },
      subscribeMentorDecidedPage: (_uid, _cursor, onData) => { onData(items); return () => {} },
      subscribeDetail: (id, onData) => { onData(items.find((item) => item.id === id) ?? null); return () => {} },
    },
    conversations: { ...mockServices.conversations, subscribeDetail: (_id, onData) => { onData(null); return () => {} } },
  }
}

function mount(path: string, services: HelpiNUSServices) {
  const router = createMemoryRouter([
    { path: '/student/requests', element: <StudentRequestsPage /> },
    { path: '/mentor/requests', element: <MentorRequestsPage /> },
    { path: '/student/requests/:id', element: <RequestDetailPage role="student" /> },
    { path: '/mentor/requests/:id', element: <RequestDetailPage role="mentor" /> },
  ], { initialEntries: [path] })
  return render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
}

function moduleSnapshot(data: Record<string, unknown> | null) {
  firestoreMocks.getDoc.mockResolvedValue({ id: moduleId, exists: () => data !== null, data: () => data })
}

describe('F01 historical request and catalogue boundaries (TC-014/016)', () => {
  beforeEach(() => { firestoreMocks.getDoc.mockReset(); sessionStorage.clear() })

  it('renders both persisted terminal histories and details with server decision times and no invented reason', async () => {
    moduleSnapshot({ id: moduleId, code: 'CS3227', title: 'Computer Architecture', active: true })
    const list = mount('/student/requests', servicesFor('student', [rejected, accepted]))
    const rows = await screen.findAllByRole('listitem')
    expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual([rejected.title, accepted.title])
    expect(within(rows[0]!).getByText('REJECTED')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('ACCEPTED')).toBeInTheDocument()
    expect(screen.queryByText(/rejection reason/iu)).not.toBeInTheDocument()
    expect(screen.queryByText(student.email)).not.toBeInTheDocument()
    list.unmount()

    for (const item of [accepted, rejected]) {
      const detail = mount(`/student/requests/${item.id}`, servicesFor('student', [accepted, rejected]))
      expect(await screen.findByRole('heading', { name: item.title })).toBeInTheDocument()
      expect(screen.getByText(item.status)).toBeInTheDocument()
      expect(screen.getByText(item.mentorDisplayName)).toBeInTheDocument()
      expect(screen.getByText(item.description)).toBeInTheDocument()
      expect(await screen.findByText('CS3227')).toBeInTheDocument()
      expect(screen.getByText('Decided').nextElementSibling?.querySelector('time')).toHaveAttribute('dateTime', item.updatedAt)
      expect(screen.queryByText(/rejection reason/iu)).not.toBeInTheDocument()
      detail.unmount()
    }
  })

  it.each([
    ['valid active', { id: moduleId, code: 'CS3227', title: 'Computer Architecture', active: true }, 'CS3227'],
    ['valid inactive', { id: moduleId, code: 'CS3227', title: 'Computer Architecture', active: false }, 'CS3227'],
    ['missing', null, 'Module information unavailable'],
    ['mismatched stored ID', { id: 'other-module', code: 'FORGED', title: 'Wrong module', active: true }, 'Module information unavailable'],
    ['malformed code', { id: moduleId, code: '', title: 'Wrong module', active: true }, 'Module information unavailable'],
  ] as const)('uses only verified %s catalogue metadata in Student history/detail and Mentor detail', async (_label, data, expected) => {
    moduleSnapshot(data)
    const item = { ...rejected, id: `historical-${_label.replaceAll(' ', '-')}` }
    for (const [role, path] of [
      ['student', '/student/requests'], ['student', `/student/requests/${item.id}`], ['mentor', `/mentor/requests/${item.id}`],
    ] as const) {
      const view = mount(path, servicesFor(role, [item]))
      expect(await screen.findByText(expected)).toBeInTheDocument()
      expect(screen.getByText(item.title)).toBeInTheDocument()
      expect(screen.queryByText(moduleId)).not.toBeInTheDocument()
      expect(screen.queryByText('FORGED')).not.toBeInTheDocument()
      if (role === 'mentor') {
        expect(screen.getByText(item.studentDisplayName)).toBeInTheDocument()
        expect(screen.queryByText(student.email)).not.toBeInTheDocument()
        expect(screen.queryByText(student.id)).not.toBeInTheDocument()
      }
      view.unmount()
    }
    expect(firestoreMocks.getDoc).toHaveBeenCalled()
  })
})
