import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../components/AppShell'
import { LoginPage } from '../pages/AuthPages'
import { StudentDashboard } from '../pages/StudentDashboard'
import { WorkspacePage } from '../pages/WorkspacePage'
import { MentorDiscoveryPage } from '../pages/MentorDiscoveryPage'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { mockDashboard, mockServices } from '../services/mockServices'

function renderStudentAt(path: string, services: HelpiNUSServices = mockServices) {
  const router = createMemoryRouter([
    { element: <ProtectedRoute role="STUDENT" />, children: [{ element: <AppShell />, children: [
      { path: '/student/dashboard', element: <StudentDashboard /> },
      { path: '/student/mentors', element: <MentorDiscoveryPage /> },
      { path: '/student/requests', element: <WorkspacePage /> },
      { path: '/student/conversations', element: <WorkspacePage /> },
      { path: '/student/consultations', element: <WorkspacePage /> },
      { path: '/student/study-assistant', element: <WorkspacePage /> },
    ] }] },
    { path: '/login', element: <LoginPage /> },
    { element: <ProtectedRoute role="MENTOR" />, children: [{ element: <AppShell />, children: [
      { path: '/mentor/dashboard', element: <WorkspacePage /> },
    ] }] },
  ], { initialEntries: [path] })
  return render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
}

describe('Student application foundation', () => {
  it('renders a meaningful dashboard with mock domain data', async () => {
    renderStudentAt('/student/dashboard')

    expect(await screen.findByRole('heading', { name: 'Welcome back, Jamie' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Help requests' })).toBeInTheDocument()
    expect(screen.getByText('Understanding sequence diagrams')).toBeInTheDocument()
    expect(screen.getByText('Thu, 15 Oct, 3:00 pm')).toBeInTheDocument()
    expect(screen.getByText('Sample workspace data for frontend preview.')).toBeInTheDocument()
  })

  it('provides named navigation and keyboard accessible primary actions', async () => {
    renderStudentAt('/student/dashboard')
    await screen.findByRole('heading', { name: 'Welcome back, Jamie' })

    const navigations = screen.getAllByRole('navigation', { name: 'Student navigation' })
    expect(navigations).toHaveLength(2)
    for (const nav of navigations) {
      expect(within(nav).getAllByRole('link')).toHaveLength(6)
      for (const link of within(nav).getAllByRole('link')) expect(link).toHaveAccessibleName()
    }
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: /find a mentor/i })) expect(link).toBeEnabled()
  })

  it('navigates from the dashboard to mentor discovery', async () => {
    const user = userEvent.setup()
    renderStudentAt('/student/dashboard')
    await screen.findByRole('heading', { name: 'Welcome back, Jamie' })

    await user.click(screen.getAllByRole('link', { name: /find a mentor/i })[0])
    expect(await screen.findByRole('heading', { name: 'Find a mentor' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Sample Aisha' })).toBeInTheDocument()
  })

  it.each([
    ['/student/requests', 'Help requests'],
    ['/student/conversations', 'Conversations'],
    ['/student/consultations', 'Consultations'],
    ['/student/study-assistant', 'Study assistant'],
  ])('shows the %s route scaffold', async (path, title) => {
    renderStudentAt(path)
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
  })

  it('keeps a mentor route behind the Mentor role guard', async () => {
    const mentorServices: HelpiNUSServices = {
      ...mockServices,
      session: { ...mockServices.session, getCurrent: async () => ({ user: mockDashboard.mentors[0].user }), subscribe: (listener) => { listener({ user: mockDashboard.mentors[0].user }); return () => {} } },
    }
    renderStudentAt('/mentor/dashboard', mentorServices)

    expect(await screen.findByRole('heading', { name: 'Mentor dashboard' })).toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: 'Mentor navigation' })).toHaveLength(2)
  })

  it('fails closed and sends a signed-out visitor to the public sign-in route', async () => {
    const signedOut: HelpiNUSServices = {
      ...mockServices,
      session: { ...mockServices.session, getCurrent: async () => ({ user: null }), subscribe: (listener) => { listener({ user: null }); return () => {} } },
    }
    renderStudentAt('/student/dashboard', signedOut)

    expect(await screen.findByRole('heading', { name: 'Welcome to HelpiNUS' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /welcome back/i })).not.toBeInTheDocument()
  })

  it('renders a clear data recovery state after a service failure', async () => {
    const broken: HelpiNUSServices = {
      ...mockServices,
      dashboard: { getStudentDashboard: async () => { throw new Error('offline') } },
    }
    renderStudentAt('/student/dashboard', broken)

    expect(await screen.findByRole('heading', { name: 'Your dashboard isn’t available' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading dashboard' })).not.toBeInTheDocument())
  })
})
