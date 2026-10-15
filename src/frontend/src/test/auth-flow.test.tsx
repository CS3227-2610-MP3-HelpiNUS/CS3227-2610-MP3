import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountAccessPage, LoginPage, RegisterPage } from '../pages/AuthPages'
import { AppShell } from '../components/AppShell'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { ServiceProvider } from '../services/ServiceProvider'
import { useServices } from '../services/useServices'
import type { HelpiNUSServices, Session } from '../services/contracts'
import { mockServices } from '../services/mockServices'

const student = { id: 'u1', displayName: 'Jamie Tan', email: 'jamie@example.test', role: 'STUDENT' as const, status: 'ACTIVE' as const, createdAt: '2026-01-12T09:00:00.000Z' }
const mentor = { ...student, id: 'm1', role: 'MENTOR' as const }
function renderAt(path: string, services: HelpiNUSServices) {
  const router = createMemoryRouter([
    { path: '/login', element: <LoginPage /> }, { path: '/register', element: <RegisterPage /> },
    { path: '/account-access', element: <AccountAccessPage /> },
    { path: '/student/dashboard', element: <ProtectedRoute role="STUDENT" />, children: [{ index: true, element: <h1>Student dashboard</h1> }] },
    { path: '/mentor/dashboard', element: <ProtectedRoute role="MENTOR" />, children: [{ index: true, element: <h1>Mentor dashboard</h1> }] },
  ], { initialEntries: [path] })
  return render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
}
function services(session: Session = { user: null }, overrides: Partial<HelpiNUSServices['session']> = {}): HelpiNUSServices {
  return { ...mockServices, session: { ...mockServices.session, getCurrent: async () => session, subscribe: (listener) => { listener(session); return () => {} }, ...overrides } }
}

describe('authentication and role routing', () => {
  it('registers a Student without exposing role or status controls', async () => {
    const user = userEvent.setup(); const register = vi.fn().mockResolvedValue({ user: student })
    const svc = services({ user: null }, { registerStudent: register, getCurrent: async () => ({ user: student }) })
    renderAt('/register', svc)
    await user.type(screen.getByLabelText('Name'), 'Jamie Tan')
    await user.type(screen.getByLabelText('Email'), 'jamie@example.test')
    await user.type(screen.getByLabelText('Password'), 'Student-demo-123!')
    expect(screen.queryByLabelText(/role|status/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create Student account' }))
    expect(register).toHaveBeenCalledWith({ displayName: 'Jamie Tan', email: 'jamie@example.test', password: 'Student-demo-123!' })
    expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeInTheDocument()
  })

  it('offers a safe retry after identity creation when profile initialization fails', async () => {
    const user = userEvent.setup(); const retry = vi.fn().mockResolvedValue({ user: student }); let current: Session = { user: null, issue: 'PROFILE_MISSING' }
    const svc = services({ user: null }, { registerStudent: async () => { throw new Error('profile setup failed') }, getCurrent: async () => current, retryStudentProfile: async (displayName) => { current = { user: student }; return retry(displayName) } })
    renderAt('/register', svc)
    await user.type(screen.getByLabelText('Name'), 'Jamie Tan'); await user.type(screen.getByLabelText('Email'), 'jamie@example.test'); await user.type(screen.getByLabelText('Password'), 'Student-demo-123!')
    await user.click(screen.getByRole('button', { name: 'Create Student account' }))
    await user.click(await screen.findByRole('button', { name: 'Retry Student profile setup' }))
    expect(retry).toHaveBeenCalledWith('Jamie Tan')
    expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeInTheDocument()
  })

  it('lets a partially registered user resend email verification', async () => {
    const user = userEvent.setup()
    const resendVerificationEmail = vi.fn().mockResolvedValue(undefined)
    const svc = services({ user: null }, {
      registerStudent: async () => { throw Object.assign(new Error('Verification delivery failed'), { code: 'auth/network-request-failed' }) },
      getCurrent: async () => ({ user: null, issue: 'EMAIL_UNVERIFIED' }),
      resendVerificationEmail,
    })
    renderAt('/register', svc)
    await user.type(screen.getByLabelText('Name'), 'Jamie Tan')
    await user.type(screen.getByLabelText('Email'), 'jamie@example.test')
    await user.type(screen.getByLabelText('Password'), 'Student-demo-123!')
    await user.click(screen.getByRole('button', { name: 'Create Student account' }))
    await user.click(await screen.findByRole('button', { name: 'Send verification email' }))
    expect(resendVerificationEmail).toHaveBeenCalledOnce()
    expect(await screen.findByText('Verification email sent. Check your inbox.')).toBeInTheDocument()
  })

  it('recovers a missing profile from the account-access page and redirects immediately', async () => {
    const user = userEvent.setup()
    let current: Session = { user: null, issue: 'PROFILE_MISSING' }
    const retryStudentProfile = vi.fn(async (displayName?: string) => {
      expect(displayName).toBe('Jamie Tan')
      current = { user: student }
      return current
    })
    renderAt('/account-access', services(current, { getCurrent: async () => current, retryStudentProfile }))

    await user.type(screen.getByLabelText('Name'), 'Jamie Tan')
    await user.click(screen.getByRole('button', { name: 'Retry Student profile setup' }))

    expect(retryStudentProfile).toHaveBeenCalledWith('Jamie Tan')
    expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeInTheDocument()
  })

  it('offers resend and refresh actions for a restored unverified session', async () => {
    const user = userEvent.setup()
    const resendVerificationEmail = vi.fn().mockResolvedValue(undefined)
    const restored: Session = { user: null, issue: 'EMAIL_UNVERIFIED' }
    renderAt('/account-access', services(restored, {
      getCurrent: async () => ({ user: student }),
      resendVerificationEmail,
    }))

    await user.click(screen.getByRole('button', { name: 'Send verification email' }))
    expect(resendVerificationEmail).toHaveBeenCalledOnce()
    expect(await screen.findByText('Verification email sent. Check your inbox.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'I’ve verified my email' }))
    expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeInTheDocument()
  })

  it('signs in with email and password and routes based on the trusted profile role', async () => {
    const user = userEvent.setup(); const signIn = vi.fn().mockResolvedValue({ user: mentor })
    renderAt('/login', services({ user: null }, { signIn, getCurrent: async () => ({ user: mentor }) }))
    await user.type(screen.getByLabelText('Email'), 'mentor@example.test'); await user.type(screen.getByLabelText('Password'), 'Mentor-demo-123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signIn).toHaveBeenCalledWith({ email: 'mentor@example.test', password: 'Mentor-demo-123!' })
    expect(await screen.findByRole('heading', { name: 'Mentor dashboard' })).toBeInTheDocument()
  })

  it('routes a Student login to the Student workspace', async () => {
    const user = userEvent.setup()
    renderAt('/login', services({ user: null }, { signIn: vi.fn().mockResolvedValue({ user: student }), getCurrent: async () => ({ user: student }) }))
    await user.type(screen.getByLabelText('Email'), 'student@example.test')
    await user.type(screen.getByLabelText('Password'), 'Student-demo-123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeInTheDocument()
  })

  it('shows a mapped auth error without exposing raw Firebase SDK text', async () => {
    const user = userEvent.setup()
    const raw = Object.assign(new Error('Firebase: Error (auth/operation-not-allowed).'), { code: 'auth/operation-not-allowed' })
    renderAt('/login', services({ user: null }, { signIn: async () => { throw raw } }))
    await user.type(screen.getByLabelText('Email'), 'student@example.test')
    await user.type(screen.getByLabelText('Password'), 'Student-demo-123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not complete that request. Please try again.')
    expect(screen.queryByText(/Firebase:/)).not.toBeInTheDocument()
  })

  it('does not expose an unclassified service error message', async () => {
    const user = userEvent.setup()
    renderAt('/login', services({ user: null }, {
      signIn: async () => { throw new Error('Service functions is not available') },
    }))
    await user.type(screen.getByLabelText('Email'), 'student@example.test')
    await user.type(screen.getByLabelText('Password'), 'Student-demo-123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not complete that request. Please try again.')
    expect(screen.queryByText(/Service functions/)).not.toBeInTheDocument()
  })

  it('restores an existing session from the auth listener', async () => {
    let notify: (session: Session) => void = () => {}; let subscribed = false
    let current: Session = { user: null }
    const svc = services({ user: null }, { subscribe: (listener) => { notify = listener; subscribed = true; return () => {} }, getCurrent: async () => current })
    renderAt('/student/dashboard', svc)
    await waitFor(() => expect(subscribed).toBe(true))
    current = { user: student }
    notify({ user: student })
    expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeInTheDocument()
  })

  it('preserves the current Mentor page and draft after a same-user Auth callback', async () => {
    const user = userEvent.setup()
    let notify: (session: Session) => void = () => {}
    let holdRevalidation = false
    let releaseRevalidation: (() => void) | undefined
    const getCurrent = vi.fn((): Promise<Session> => holdRevalidation
      ? new Promise((resolve) => { releaseRevalidation = () => resolve({ user: mentor }) })
      : Promise.resolve({ user: mentor }))
    const svc = services({ user: mentor }, {
      getCurrent,
      subscribe: (listener) => { notify = listener; listener({ user: mentor }); return () => {} },
    })
    const router = createMemoryRouter([
      { element: <ProtectedRoute role="MENTOR" />, children: [{ path: '/mentor/dashboard', element: <input aria-label="Draft marker" /> }] },
    ], { initialEntries: ['/mentor/dashboard'] })
    render(<ServiceProvider servicesOverride={svc}><RouterProvider router={router} /></ServiceProvider>)

    const draft = await screen.findByRole('textbox', { name: 'Draft marker' })
    await user.type(draft, 'Keep this draft')
    const readsBeforeCallback = getCurrent.mock.calls.length
    holdRevalidation = true
    act(() => { notify({ user: mentor }) })

    await waitFor(() => expect(getCurrent.mock.calls.length).toBeGreaterThan(readsBeforeCallback))
    expect(screen.getByRole('textbox', { name: 'Draft marker' })).toBe(draft)
    expect(draft).toHaveValue('Keep this draft')
    await act(async () => { releaseRevalidation?.() })
    expect(screen.getByRole('textbox', { name: 'Draft marker' })).toBe(draft)
  })

  it('keeps the latest session across concurrent refreshes, stale callbacks, and a service switch', async () => {
    let notifyOld: (session: Session) => void = () => {}
    let currentOld: Session = { user: mentor }
    let deferOld = false
    const pending: Array<(value: Session) => void> = []
    const oldServices = services({ user: mentor }, {
      getCurrent: () => deferOld ? new Promise((resolve) => { pending.push(resolve) }) : Promise.resolve(currentOld),
      subscribe: (listener) => { notifyOld = listener; listener({ user: mentor }); return () => {} },
    })
    let refresh: () => Promise<void> = async () => {}
    function Probe() {
      const state = useServices()
      refresh = state.refreshSession
      return <div data-testid="current-session">{state.loading ? 'loading' : state.session?.user?.id ?? 'none'}:{state.session?.user?.status ?? 'none'}</div>
    }
    const rendered = render(<ServiceProvider servicesOverride={oldServices}><Probe /></ServiceProvider>)
    await waitFor(() => expect(screen.getByTestId('current-session')).toHaveTextContent('m1:ACTIVE'))

    deferOld = true
    act(() => { void refresh(); void refresh() })
    expect(pending).toHaveLength(2)
    const suspended: Session = { user: { ...mentor, status: 'SUSPENDED' } }
    await act(async () => { pending[1]!(suspended) })
    expect(screen.getByTestId('current-session')).toHaveTextContent('m1:SUSPENDED')
    await act(async () => { pending[0]!({ user: mentor }) })
    expect(screen.getByTestId('current-session')).toHaveTextContent('m1:SUSPENDED')

    deferOld = false
    currentOld = suspended
    act(() => { notifyOld({ user: mentor }) })
    await waitFor(() => expect(screen.getByTestId('current-session')).toHaveTextContent('m1:SUSPENDED'))

    deferOld = true
    act(() => { void refresh() })
    expect(pending).toHaveLength(3)
    const newServices = services({ user: student })
    rendered.rerender(<ServiceProvider servicesOverride={newServices}><Probe /></ServiceProvider>)
    await waitFor(() => expect(screen.getByTestId('current-session')).toHaveTextContent('u1:ACTIVE'))
    await act(async () => { pending[2]!({ user: mentor }); notifyOld({ user: mentor }) })
    expect(screen.getByTestId('current-session')).toHaveTextContent('u1:ACTIVE')
  })

  it('signs out and returns the user to the public login screen', async () => {
    const user = userEvent.setup(); let current: Session = { user: student }
    const signOut = vi.fn(async () => { current = { user: null } })
    const svc = services({ user: student }, { signOut, getCurrent: async () => current, subscribe: (listener) => { listener({ user: student }); return () => {} } })
    const router = createMemoryRouter([
      { element: <ProtectedRoute role="STUDENT" />, children: [{ element: <AppShell />, children: [{ path: '/student/dashboard', element: <h1>Student dashboard</h1> }] }] },
      { path: '/login', element: <LoginPage /> },
    ], { initialEntries: ['/student/dashboard'] })
    render(<ServiceProvider servicesOverride={svc}><RouterProvider router={router} /></ServiceProvider>)
    await user.click((await screen.findAllByRole('button', { name: 'Sign out' }))[1])
    expect(signOut).toHaveBeenCalledOnce()
    expect(await screen.findByRole('heading', { name: 'Welcome to HelpiNUS' })).toBeInTheDocument()
  })

  it('routes both desktop and mobile brand links to the active role workspace', async () => {
    const router = createMemoryRouter([
      { element: <ProtectedRoute role="MENTOR" />, children: [{ element: <AppShell />, children: [{ path: '/mentor/dashboard', element: <h1>Mentor dashboard</h1> }] }] },
    ], { initialEntries: ['/mentor/dashboard'] })
    render(<ServiceProvider servicesOverride={services({ user: mentor })}><RouterProvider router={router} /></ServiceProvider>)
    const brands = await screen.findAllByRole('link', { name: 'HelpiNUS home' })
    expect(brands).toHaveLength(2)
    expect(brands.map((brand) => brand.getAttribute('href'))).toEqual(['/mentor/dashboard', '/mentor/dashboard'])
  })

  it('denies cross-role access and routes to the profile-authorized dashboard', async () => {
    renderAt('/student/dashboard', services({ user: mentor }))
    expect(await screen.findByRole('heading', { name: 'Mentor dashboard' })).toBeInTheDocument()
  })

  it.each(['SUSPENDED', 'DISABLED'] as const)('denies a %s account', async (status) => {
    renderAt('/student/dashboard', services({ user: { ...student, status } }))
    expect(await screen.findByRole('heading', { name: 'Account access unavailable' })).toBeInTheDocument()
  })
})
