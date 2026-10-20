import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountAccessPage, ForgotPasswordPage, LoginPage, RegisterPage } from '../pages/AuthPages'
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
    { path: '/login', element: <LoginPage /> }, { path: '/register', element: <RegisterPage /> }, { path: '/forgot-password', element: <ForgotPasswordPage /> },
    { path: '/account-access', element: <AccountAccessPage /> },
    { path: '/student/dashboard', element: <ProtectedRoute role="STUDENT" />, children: [{ index: true, element: <h1>Student dashboard</h1> }] },
    { path: '/mentor/dashboard', element: <ProtectedRoute role="MENTOR" />, children: [{ index: true, element: <h1>Mentor dashboard</h1> }] },
  ], { initialEntries: [path] })
  return render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
}
function services(session: Session = { user: null }, overrides: Partial<HelpiNUSServices['session']> = {}): HelpiNUSServices {
  return { ...mockServices, session: { ...mockServices.session, getCurrent: async () => session, selectRole: async (role) => ({ user: null, selectedRole: role }), subscribe: (listener) => { listener(session); return () => {} }, ...overrides } }
}

describe('authentication and role routing', () => {
  it('requires a role choice before Google sign-in and offers matching Mentor registration', async () => {
    const user = userEvent.setup()
    let current: Session = { user: null }
    const signInWithGoogle = vi.fn(async () => { current = { user: null, selectedRole: 'MENTOR', issue: 'PROFILE_MISSING' as const }; return current })
    renderAt('/login', services(current, { signInWithGoogle, getCurrent: async () => current }))
    expect(screen.queryByRole('button', { name: /Continue with Google/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue as Mentor' }))
    await user.click(screen.getByRole('button', { name: 'Continue with Google as Mentor' }))
    expect(signInWithGoogle).toHaveBeenCalledWith('MENTOR')
    expect(await screen.findByRole('link', { name: 'Create Mentor account' })).toHaveAttribute('href', '/register?role=MENTOR')
  })

  it('registers a Mentor using the selected identity and routes to Mentor dashboard', async () => {
    const user = userEvent.setup()
    let current: Session = { user: null, selectedRole: 'MENTOR', issue: 'PROFILE_MISSING' }
    const registerMentorWithGoogle = vi.fn(async () => { current = { user: mentor, selectedRole: 'MENTOR' }; return current })
    renderAt('/register?role=MENTOR', services(current, { registerMentorWithGoogle, getCurrent: async () => current }))
    await user.click(screen.getByRole('button', { name: 'Create Mentor account with Google' }))
    expect(registerMentorWithGoogle).toHaveBeenCalledOnce()
    expect(await screen.findByRole('heading', { name: 'Mentor dashboard' })).toBeInTheDocument()
  })

  it('registers a Student with Google without exposing role or status controls', async () => {
    const user = userEvent.setup(); const register = vi.fn().mockResolvedValue({ user: student })
    const svc = services({ user: null }, { registerStudentWithGoogle: register, getCurrent: async () => ({ user: student }) })
    renderAt('/register', svc)
    expect(screen.queryByLabelText(/email|password|role|status/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create Student account with Google' }))
    expect(register).toHaveBeenCalledOnce()
    expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeInTheDocument()
  })

  it('signs in with Google and routes using the trusted Mentor profile', async () => {
    const user = userEvent.setup(); let current: Session = { user: null }
    const signInWithGoogle = vi.fn(async () => { current = { user: mentor, selectedRole: 'MENTOR' }; return current })
    renderAt('/login', services(current, { signInWithGoogle, getCurrent: async () => current }))
    expect(screen.queryByLabelText(/email|password/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue as Mentor' }))
    await user.click(screen.getByRole('button', { name: 'Continue with Google as Mentor' }))
    expect(signInWithGoogle).toHaveBeenCalledWith('MENTOR')
    expect(await screen.findByRole('heading', { name: 'Mentor dashboard' })).toBeInTheDocument()
  })

  it('offers bounded name recovery when Google has no display name', async () => {
    const user = userEvent.setup(); const retry = vi.fn().mockResolvedValue({ user: student }); let current: Session = { user: null, issue: 'PROFILE_MISSING' }
    const svc = services({ user: null }, { registerStudentWithGoogle: async () => current, getCurrent: async () => current, retryStudentProfile: async (displayName) => { current = { user: student }; return retry(displayName) } })
    renderAt('/register', svc)
    await user.click(screen.getByRole('button', { name: 'Create Student account with Google' }))
    await user.type(await screen.findByLabelText('Name'), 'Jamie Tan')
    expect(screen.queryByLabelText(/role|status/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finish Student profile setup' }))
    expect(retry).toHaveBeenCalledWith('Jamie Tan')
    expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeInTheDocument()
  })

  it.each([
    ['auth/popup-blocked', 'Your browser blocked the Google sign-in window. Allow popups for HelpiNUS and try again.'],
    ['auth/unauthorized-domain', 'Google sign-in is not configured for this website. Contact HelpiNUS support.'],
    ['auth/network-request-failed', 'We could not reach Google sign-in. Check your connection and try again.'],
    ['auth/missing-email', 'This Google account did not provide an email address. Try another account.'],
  ])('maps %s without exposing raw Firebase text', async (code, expected) => {
    const user = userEvent.setup()
    const raw = Object.assign(new Error(`Firebase: Error (${code}). token-secret`), { code })
    renderAt('/login', services({ user: null }, { signInWithGoogle: async () => { throw raw } }))
    await user.click(screen.getByRole('button', { name: 'Continue as Student' }))
    await user.click(screen.getByRole('button', { name: 'Continue with Google as Student' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(expected)
    expect(screen.queryByText(/Firebase:|token-secret/)).not.toBeInTheDocument()
  })

  it('treats popup dismissal as a quiet cancellation', async () => {
    const user = userEvent.setup()
    renderAt('/login', services({ user: null }, { signInWithGoogle: async () => { throw Object.assign(new Error('closed'), { code: 'auth/popup-closed-by-user' }) } }))
    await user.click(screen.getByRole('button', { name: 'Continue as Student' }))
    await user.click(screen.getByRole('button', { name: 'Continue with Google as Student' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue with Google as Student' })).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('links password help to Google Account Recovery without requesting a password reset', async () => {
    const user = userEvent.setup()
    renderAt('/login', services())
    await user.click(screen.getByRole('link', { name: 'Need help with your Google password?' }))
    const recovery = screen.getByRole('link', { name: 'Open Google Account Recovery' })
    expect(recovery).toHaveAttribute('href', 'https://accounts.google.com/signin/recovery')
    expect(recovery).toHaveAttribute('rel', 'noreferrer')
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
