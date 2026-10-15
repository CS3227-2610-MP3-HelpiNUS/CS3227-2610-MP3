import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ReadOwnMentorProfileOutput } from '@helpinus/shared'
import { appRoutes } from '../routes/appRoutes'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices, Session } from '../services/contracts'
import { mockDashboard, mockServices } from '../services/mockServices'

const mentor = mockDashboard.mentors[0].user
type Ready = Extract<ReadOwnMentorProfileOutput, { kind: 'ready' }>
const ready = (changes: Partial<Ready['profile']> = {}, metadata: Ready['metadata'] = { kind: 'ready', modules: [] }): Ready => ({
  kind: 'ready', profile: { displayName: 'Saved Mentor Name', biography: 'I explain software design.', moduleIds: [], version: { revision: 1, updateTime: '1:000000000' }, ...changes }, metadata,
})
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

function setup(options: { read?: () => Promise<ReadOwnMentorProfileOutput>; current?: () => typeof mentor | null; path?: string } = {}) {
  let callback: ((session: { user: typeof mentor | null }) => void) | undefined
  const invoke = vi.fn((name: string, input: unknown) => {
    if (name !== 'readOwnMentorProfile' || JSON.stringify(input) !== '{}') throw new Error(`Unexpected callable: ${name}`)
    return options.read?.() ?? Promise.resolve(ready())
  })
  const getCurrent = vi.fn(async () => ({ user: options.current ? options.current() : mentor }))
  const services: HelpiNUSServices = { ...mockServices, session: { ...mockServices.session, getCurrent, subscribe: (listener) => { callback = listener; listener({ user: options.current ? options.current() : mentor }); return () => {} } }, callables: { invoke: invoke as HelpiNUSServices['callables']['invoke'] } }
  const router = createMemoryRouter(appRoutes, { initialEntries: [options.path ?? '/mentor/dashboard'] })
  const wrapper = render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
  return { invoke, getCurrent, router, services, wrapper, publish: (user: typeof mentor | null) => callback?.({ user }) }
}

describe('S1-D2-F03 Mentor dashboard', () => {
  it('TC-01 mounts the exported production route and its Mentor guard', async () => {
    const pending = deferred<ReadOwnMentorProfileOutput>()
    const { invoke } = setup({ read: () => pending.promise })
    expect(await screen.findByRole('heading', { name: 'Welcome to your Mentor space' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your profile' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading your profile')
    expect(screen.getAllByRole('link', { name: 'My profile' })).toHaveLength(3)
    expect(screen.queryByText(/manage student requests and consultations/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Student dashboard/i })).not.toBeInTheDocument()
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('readOwnMentorProfile', {}))
  })

  it('TC-02 navigates to F04 and rereads on return', async () => {
    const fullBiography = `First ${'detailed '.repeat(25)}biography.`
    let result = ready({ biography: fullBiography })
    const { invoke, router } = setup({ read: async () => result })
    await screen.findByText(/First detailed detailed/u)
    expect(screen.queryByText(fullBiography)).not.toBeInTheDocument()
    await userEvent.setup().click(within(screen.getByRole('main')).getByRole('link', { name: 'My profile' }))
    expect(await screen.findByRole('heading', { name: 'My Profile' })).toBeInTheDocument()
    expect(screen.getByText(fullBiography)).toBeInTheDocument()
    result = ready({ biography: 'Changed saved biography.' })
    await act(async () => { await router.navigate('/mentor/dashboard') })
    expect(await screen.findByText('Changed saved biography.')).toBeInTheDocument()
    expect(invoke.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByRole('button', { name: /edit|save/i })).not.toBeInTheDocument()
    const desktop = screen.getAllByRole('navigation', { name: 'Mentor navigation' })[0]
    await userEvent.setup().click(within(desktop).getByRole('link', { name: 'My profile' }))
    expect(await screen.findByRole('heading', { name: 'My Profile' })).toBeInTheDocument()
    await act(async () => { await router.navigate('/mentor/dashboard') })
    const mobile = screen.getAllByRole('navigation', { name: 'Mentor navigation' })[1]
    await userEvent.setup().click(within(mobile).getByRole('link', { name: 'My profile' }))
    expect(await screen.findByRole('heading', { name: 'My Profile' })).toBeInTheDocument()
  })

  it('TC-03 uses saved plain text and a bounded Unicode excerpt', async () => {
    const bio = `  ${'🙂 '.repeat(100)}<script>bad</script> `
    const { invoke } = setup({ read: async () => ready({ biography: bio }) })
    expect(await screen.findByText('Saved Mentor Name')).toBeInTheDocument()
    const card = screen.getByRole('heading', { name: 'Your profile' }).closest('section')!
    expect(within(card).queryByText(mentor.displayName)).not.toBeInTheDocument()
    expect(screen.queryByText(mentor.email)).not.toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
    expect(within(card).getByText(/🙂/).textContent!.endsWith('…')).toBe(true)
    expect(invoke).toHaveBeenCalledWith('readOwnMentorProfile', {})
  })

  it('TC-03 keeps literal markup inert and does not split an unbroken Unicode token', async () => {
    setup({ read: async () => ready({ biography: `<img src=x onerror=alert(1)> ${'🙂'.repeat(200)}` }) })
    expect(await screen.findByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    const excerpt = screen.getByText(/<img src=x onerror=alert\(1\)>/).textContent!
    expect(Array.from(excerpt).length).toBeLessThanOrEqual(181)
    expect(excerpt.endsWith('…')).toBe(true)
  })

  it('TC-03 applies the exact code-point limit and last-space boundary', async () => {
    const biography = `  Alpha\n\t${'🙂'.repeat(173)} beta and more  `
    setup({ read: async () => ready({ biography }) })
    const shown = await screen.findByText(/^Alpha 🙂+…$/u)
    expect(shown.textContent).toBe(`Alpha ${'🙂'.repeat(173)}…`)
    expect(Array.from(shown.textContent ?? '').length).toBe(180)
    expect(screen.queryByText('1:000000000')).not.toBeInTheDocument()
  })

  it('TC-03 cuts an unbroken token at 180 code points', async () => {
    setup({ read: async () => ready({ biography: '🙂'.repeat(200) }) })
    expect(await screen.findByText(`${'🙂'.repeat(180)}…`)).toBeInTheDocument()
  })

  it('TC-04 previews active saved modules and counts review and unknown entries', async () => {
    const ids = ['a', 'b', 'c', 'd', 'old', 'gone', 'unknown']
    const modules: Extract<Ready['metadata'], { kind: 'ready' }>['modules'] = [
      ...['a', 'b', 'c', 'd'].map((id) => ({ id, state: 'active' as const, code: `CS${id}`, title: `Title ${id}` })),
      { id: 'old', state: 'inactive', code: 'CSold', title: 'Old title' }, { id: 'gone', state: 'missing' },
      { id: 'extra', state: 'active', code: 'CSextra', title: 'Extra title' },
    ]
    setup({ read: async () => ready({ moduleIds: ids }, { kind: 'ready', modules }) })
    expect(await screen.findByText('CSa — Title a')).toBeInTheDocument()
    expect(screen.getByText('CSb — Title b')).toBeInTheDocument()
    expect(screen.getByText('CSc — Title c')).toBeInTheDocument()
    expect(screen.getByText('+1 more active modules')).toBeInTheDocument()
    expect(screen.getByText('2 module references need review')).toBeInTheDocument()
    expect(screen.getByText('1 module details unavailable')).toBeInTheDocument()
    expect(screen.queryByText(/CSold|CSextra|CSd/)).not.toBeInTheDocument()
  })

  it('TC-04 distinguishes nonempty IDs with no active labels from an empty list', async () => {
    setup({ read: async () => ready({ moduleIds: ['old'] }, { kind: 'ready', modules: [{ id: 'old', state: 'inactive', code: 'CSold', title: 'Old title' }] }) })
    expect(await screen.findByText('No active modules available to preview')).toBeInTheDocument()
    expect(screen.getByText('1 module references need review')).toBeInTheDocument()
    expect(screen.queryByText('No modules listed')).not.toBeInTheDocument()
  })

  it.each([['blank biography', { biography: ' ' }], ['empty modules', { moduleIds: [] }]])('TC-05 shows completion for %s', async (_, changes) => {
    setup({ read: async () => ready({ moduleIds: ['a'], ...changes }, { kind: 'ready', modules: [{ id: 'a', state: 'active', code: 'CS1', title: 'One' }] }) })
    expect(await screen.findByRole('link', { name: 'Complete your profile' })).toHaveAttribute('href', '/mentor/profile')
  })

  it('TC-05 shows both empty messages with one completion action', async () => {
    setup({ read: async () => ready({ biography: '', moduleIds: [] }) })
    expect(await screen.findByText('No biography provided')).toBeInTheDocument()
    expect(screen.getByText('No modules listed')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Complete your profile' })).toHaveLength(1)
  })

  it('TC-05 does not invite completion when both fields are populated', async () => {
    setup({ read: async () => ready({ moduleIds: ['a'] }, { kind: 'ready', modules: [{ id: 'a', state: 'active', code: 'CS1', title: 'One' }] }) })
    await screen.findByText('CS1 — One')
    expect(screen.queryByRole('link', { name: 'Complete your profile' })).not.toBeInTheDocument()
  })

  it('TC-06 preserves the profile when module metadata is unavailable', async () => {
    setup({ read: async () => ready({ moduleIds: ['a', 'b'] }, { kind: 'unavailable' }) })
    expect(await screen.findByText('2 saved modules; module information unavailable')).toBeInTheDocument()
    expect(screen.getByText('Saved Mentor Name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry module information' })).toBeEnabled()
  })

  it('TC-07 replaces all fields after metadata retry', async () => {
    let count = 0
    const { invoke } = setup({ read: async () => ++count === 1 ? ready({ moduleIds: ['a'] }, { kind: 'unavailable' }) : ready({ displayName: 'Updated Name', biography: 'Updated bio.', moduleIds: ['b'] }, { kind: 'ready', modules: [{ id: 'b', state: 'active', code: 'CS2', title: 'New module' }] }) })
    await screen.findByText('1 saved module; module information unavailable')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry module information' }))
    expect(await screen.findByText('Updated Name')).toBeInTheDocument()
    expect(screen.getByText('CS2 — New module')).toBeInTheDocument()
    expect(screen.queryByText('Saved Mentor Name')).not.toBeInTheDocument()
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('TC-07 marks module information refreshing while a retry is pending', async () => {
    const pending = deferred<ReadOwnMentorProfileOutput>()
    let calls = 0
    setup({ read: () => ++calls === 1 ? Promise.resolve(ready({ moduleIds: ['a'] }, { kind: 'unavailable' })) : pending.promise })
    await screen.findByText('Saved Mentor Name')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry module information' }))
    expect(screen.getByText('Saved Mentor Name')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Refreshing module information')
    await act(async () => pending.resolve(ready({ displayName: 'New Name', moduleIds: ['b'] }, { kind: 'ready', modules: [{ id: 'b', state: 'active', code: 'CS2', title: 'Two' }] })))
    expect(await screen.findByText('CS2 — Two')).toBeInTheDocument()
    expect(screen.queryByText('Saved Mentor Name')).not.toBeInTheDocument()
  })

  it('TC-07 discards the old profile when metadata retry returns missing', async () => {
    let calls = 0
    setup({ read: async () => ++calls === 1 ? ready({ moduleIds: ['a'] }, { kind: 'unavailable' }) : { kind: 'missing' } })
    await screen.findByText('Saved Mentor Name')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry module information' }))
    expect(await screen.findByText('Profile unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Saved Mentor Name')).not.toBeInTheDocument()
  })

  it('TC-07 retains valid fields but no old labels after a transient metadata retry failure', async () => {
    let calls = 0
    setup({ read: async () => { if (++calls === 1) return ready({ moduleIds: ['a'] }, { kind: 'unavailable' }); throw new Error('offline') } })
    await screen.findByText('Saved Mentor Name')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry module information' }))
    expect(await screen.findByText('Module information is unavailable.')).toBeInTheDocument()
    expect(screen.getByText('Saved Mentor Name')).toBeInTheDocument()
    expect(screen.queryByText(/CS\d+ —/)).not.toBeInTheDocument()
  })

  it('TC-08 recovers from a full read failure', async () => {
    let count = 0
    setup({ read: async () => { if (++count === 1) throw new Error('offline'); return ready() } })
    expect(await screen.findByText('We could not load your profile.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Saved Mentor Name')).toBeInTheDocument()
  })

  it('TC-08 announces deferred loading and error without an empty-profile claim', async () => {
    const pending = deferred<ReadOwnMentorProfileOutput>()
    setup({ read: () => pending.promise })
    expect(await screen.findByText('Loading your profile…')).toHaveAttribute('role', 'status')
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'My profile' })).toHaveAttribute('href', '/mentor/profile')
    await act(async () => pending.reject(new Error('offline')))
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your profile.')
    expect(screen.queryByText('No biography provided')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it.each(['missing', 'inactive', 'invalid'] as const)('TC-09 handles %s without an edit invitation', async (kind) => {
    setup({ read: async () => ({ kind }) })
    expect(await screen.findByText('Profile unavailable')).toBeInTheDocument()
    expect(screen.getByText(/Contact your administrator or HelpiNUS support/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Complete your profile' })).not.toBeInTheDocument()
  })

  it('TC-10 drops stale responses after a newer retry', async () => {
    const pending = deferred<ReadOwnMentorProfileOutput>()
    let count = 0
    setup({ read: () => ++count === 1 ? Promise.resolve(ready({ moduleIds: ['a'] }, { kind: 'unavailable' })) : count === 2 ? pending.promise : Promise.resolve(ready({ displayName: 'Current Name', moduleIds: ['b'] }, { kind: 'ready', modules: [{ id: 'b', state: 'active', code: 'CS2', title: 'Current module' }] })) })
    await screen.findByText('1 saved module; module information unavailable')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retry module information' }))
    await user.click(screen.getByRole('button', { name: 'Retry module information' }))
    expect(await screen.findByText('Current Name')).toBeInTheDocument()
    await act(async () => { pending.resolve(ready({ displayName: 'Old Name' })) })
    expect(screen.queryByText('Old Name')).not.toBeInTheDocument()
    expect(screen.getByText('CS2 — Current module')).toBeInTheDocument()
  })

  it('TC-10 lets a newer unavailable result supersede an older ready retry', async () => {
    const old = deferred<ReadOwnMentorProfileOutput>()
    let calls = 0
    setup({ read: () => ++calls === 1 ? Promise.resolve(ready({ moduleIds: ['a'] }, { kind: 'unavailable' })) : calls === 2 ? old.promise : Promise.resolve({ kind: 'inactive' }) })
    await screen.findByText('Saved Mentor Name')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retry module information' }))
    await user.click(screen.getByRole('button', { name: 'Retry module information' }))
    expect(await screen.findByText('Profile unavailable')).toBeInTheDocument()
    await act(async () => old.resolve(ready({ displayName: 'Stale Name' })))
    expect(screen.queryByText('Stale Name')).not.toBeInTheDocument()
  })

  it('TC-11 clears old identity when the provider publishes another Mentor', async () => {
    let current = mentor
    const { publish } = setup({ read: async () => ready({ displayName: current.id === mentor.id ? 'Private Name' : 'Second Name' }), current: () => current })
    await screen.findByText('Private Name')
    const second = { ...mentor, id: 'mentor-02' }
    current = second
    act(() => publish(second))
    expect(screen.queryByText('Private Name')).not.toBeInTheDocument()
    expect(await screen.findByText('Second Name')).toBeInTheDocument()
    expect(screen.queryByText('Private Name')).not.toBeInTheDocument()
  })

  it.each([
    ['sign-out', null, '/login'],
    ['Student role', mockDashboard.user, '/student/dashboard'],
    ['inactive Mentor', { ...mentor, status: 'SUSPENDED' as const }, '/account-access'],
  ])('TC-11 clears private content on %s', async (_, next, destination) => {
    let current: typeof mentor | null = mentor
    const { publish, router } = setup({ current: () => current, read: async () => ready({ displayName: 'Private Name' }) })
    await screen.findByText('Private Name')
    current = next
    act(() => publish(next))
    expect(screen.queryByText('Private Name')).not.toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe(destination))
  })

  it('TC-11 discards an old pending read after a UID change', async () => {
    const old = deferred<ReadOwnMentorProfileOutput>()
    let current = mentor
    const { publish } = setup({ current: () => current, read: () => current.id === mentor.id ? old.promise : Promise.resolve(ready({ displayName: 'New Identity' })) })
    await screen.findByRole('status')
    current = { ...mentor, id: 'mentor-02' }
    act(() => publish(current))
    expect(await screen.findByText('New Identity')).toBeInTheDocument()
    await act(async () => old.resolve(ready({ displayName: 'Old Identity' })))
    expect(screen.queryByText('Old Identity')).not.toBeInTheDocument()
  })

  it('TC-12 ignores a late result after leaving the route', async () => {
    const pending = deferred<ReadOwnMentorProfileOutput>()
    const { router } = setup({ read: () => pending.promise })
    await screen.findByRole('status')
    await act(async () => { await router.navigate('/not-found') })
    await act(async () => pending.resolve(ready({ displayName: 'Late Private Name' })))
    expect(screen.queryByText('Late Private Name')).not.toBeInTheDocument()
  })

  it('TC-12 gates private content on a service replacement', async () => {
    const first = setup({ read: async () => ready({ displayName: 'Old Service Name' }) })
    await screen.findByText('Old Service Name')
    const replacement: HelpiNUSServices = { ...first.services, callables: { invoke: vi.fn(async () => ready({ displayName: 'New Service Name' })) as HelpiNUSServices['callables']['invoke'] } }
    first.wrapper.rerender(<ServiceProvider servicesOverride={replacement}><RouterProvider router={first.router} /></ServiceProvider>)
    expect(screen.queryByText('Old Service Name')).not.toBeInTheDocument()
    expect(await screen.findByText('New Service Name')).toBeInTheDocument()
  })

  it('TC-12 discards a pending old-service retry after service replacement', async () => {
    const pending = deferred<ReadOwnMentorProfileOutput>()
    let calls = 0
    const first = setup({ read: () => ++calls === 1 ? Promise.resolve(ready({ displayName: 'Old Service Name', moduleIds: ['a'] }, { kind: 'unavailable' })) : pending.promise })
    await screen.findByText('Old Service Name')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry module information' }))
    const replacement: HelpiNUSServices = { ...first.services, callables: { invoke: vi.fn(async () => ready({ displayName: 'New Service Name' })) as HelpiNUSServices['callables']['invoke'] } }
    first.wrapper.rerender(<ServiceProvider servicesOverride={replacement}><RouterProvider router={first.router} /></ServiceProvider>)
    expect(screen.queryByText('Old Service Name')).not.toBeInTheDocument()
    expect(await screen.findByText('New Service Name')).toBeInTheDocument()
    await act(async () => { pending.resolve(ready({ displayName: 'Late Old Service Name' })) })
    expect(screen.queryByText('Late Old Service Name')).not.toBeInTheDocument()
  })

  it('TC-13 never calls the profile callable when entry eligibility differs', async () => {
    let calls = 0
    const { invoke } = setup({ current: () => ++calls <= 1 ? mentor : null })
    await waitFor(() => expect(calls).toBeGreaterThan(1))
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each([
    ['Student role', mockDashboard.user, '/student/dashboard'],
    ['suspended Mentor', { ...mentor, status: 'SUSPENDED' as const }, '/account-access'],
  ])('TC-13 rejects a stale provider Mentor after entry reports %s', async (_, next, destination) => {
    let calls = 0
    const invoke = vi.fn()
    const services: HelpiNUSServices = { ...mockServices, session: { ...mockServices.session, getCurrent: async () => ({ user: ++calls === 1 ? mentor : next }), subscribe: (listener) => { listener({ user: mentor }); return () => {} } }, callables: { invoke: invoke as HelpiNUSServices['callables']['invoke'] } }
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/mentor/dashboard'] })
    render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
    await waitFor(() => expect(router.state.location.pathname).toBe(destination))
    expect(invoke).not.toHaveBeenCalled()
  })

  it('TC-13 treats a transient entry check failure as an account-check error', async () => {
    let calls = 0
    const original = mentor
    const invoke = vi.fn(async () => ready())
    const services: HelpiNUSServices = { ...mockServices, session: { ...mockServices.session, getCurrent: async () => { if (++calls === 2) throw new Error('offline'); return { user: original } }, subscribe: (listener) => { listener({ user: original }); return () => {} } }, callables: { invoke: invoke as HelpiNUSServices['callables']['invoke'] } }
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/mentor/dashboard'] })
    render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
    expect(await screen.findByText('We could not check your account access.')).toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Saved Mentor Name')).toBeInTheDocument()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it.each(['permission-denied', 'unauthenticated', 'failed-precondition'])('TC-14 marks %s before refresh and avoids an automatic read loop', async (code) => {
    let calls = 0
    const { invoke, router, getCurrent } = setup({ read: async () => { calls++; if (calls === 1) return ready({ displayName: 'Private Name', moduleIds: ['a'] }, { kind: 'unavailable' }); throw { code: `functions/${code}` } } })
    await screen.findByText('Private Name')
    let markerObservedBeforeRefresh = false
    getCurrent.mockImplementation(async () => {
      if (!markerObservedBeforeRefresh && invoke.mock.calls.length === 2) {
        expect(router.state.location.state).toEqual({ f03AccessDenied: mentor.id })
        markerObservedBeforeRefresh = true
      }
      return { user: mentor }
    })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry module information' }))
    await screen.findByText(/Your account access may have changed/)
    expect(router.state.location.state).toEqual({ f03AccessDenied: mentor.id })
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Private Name')).not.toBeInTheDocument()
    // The provider's initial check, the two page entry checks, and the refresh all finish.
    await waitFor(() => expect(getCurrent.mock.calls.length).toBeGreaterThanOrEqual(4))
    expect(markerObservedBeforeRefresh).toBe(true)
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeEnabled()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(invoke).toHaveBeenCalledTimes(2)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3))
    expect(router.state.location.state).toEqual({ f03AccessDenied: mentor.id })
    await act(async () => { await router.navigate('/not-found') })
    await waitFor(() => expect(router.state.location.pathname).toBe('/not-found'))
    await act(async () => { await router.navigate('/mentor/dashboard') })
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(4))
  })

  it('TC-14 keeps the denial marker through a deferred same-UID guard unmount and remount', async () => {
    const refresh = deferred<{ user: typeof mentor }>()
    let calls = 0
    const { invoke, router, getCurrent } = setup({ read: async () => {
      calls++
      if (calls === 1) return ready({ displayName: 'Private Name', moduleIds: ['a'] }, { kind: 'unavailable' })
      if (calls === 2) throw { code: 'functions/permission-denied' }
      return ready({ displayName: 'Recovered Name' })
    } })
    await screen.findByText('Private Name')
    let refreshStarted = false
    getCurrent.mockImplementation(() => {
      if (!refreshStarted && invoke.mock.calls.length === 2) {
        expect(router.state.location.state).toEqual({ f03AccessDenied: mentor.id })
        refreshStarted = true
        return refresh.promise
      }
      return Promise.resolve({ user: mentor })
    })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry module information' }))
    await waitFor(() => expect(refreshStarted).toBe(true))
    expect(await screen.findByRole('status')).toHaveTextContent('Loading your workspace')
    expect(screen.queryByRole('heading', { name: 'Welcome to your Mentor space' })).not.toBeInTheDocument()
    expect(screen.queryByText('Private Name')).not.toBeInTheDocument()
    expect(invoke).toHaveBeenCalledTimes(2)
    await act(async () => refresh.resolve({ user: mentor }))
    expect(await screen.findByRole('heading', { name: 'Welcome to your Mentor space' })).toBeInTheDocument()
    expect(screen.getByText(/Your account access may have changed/)).toBeInTheDocument()
    expect(invoke).toHaveBeenCalledTimes(2)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Recovered Name')).toBeInTheDocument()
    expect(invoke).toHaveBeenCalledTimes(3)
  })

  it('TC-15 denies Student sessions before reading profile data', async () => {
    const student = mockDashboard.user
    const invoke = vi.fn()
    const services: HelpiNUSServices = { ...mockServices, session: { ...mockServices.session, getCurrent: async () => ({ user: student }), subscribe: (listener) => { listener({ user: student }); return () => {} } }, callables: { invoke: invoke as HelpiNUSServices['callables']['invoke'] } }
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/mentor/dashboard'] })
    render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
    await waitFor(() => expect(router.state.location.pathname).toBe('/student/dashboard'))
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each([
    ['signed out', { user: null } as Session, '/login'],
    ['inactive', { user: { ...mentor, status: 'SUSPENDED' as const } } as Session, '/account-access'],
    ['unverified', { user: null, issue: 'EMAIL_UNVERIFIED' } as Session, '/account-access'],
  ])('TC-15 denies %s sessions before reading profile data', async (_, session, destination) => {
    const invoke = vi.fn()
    const services: HelpiNUSServices = { ...mockServices, session: { ...mockServices.session, getCurrent: async () => session, subscribe: (listener) => { listener(session); return () => {} } }, callables: { invoke: invoke as HelpiNUSServices['callables']['invoke'] } }
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/mentor/dashboard'] })
    render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
    await waitFor(() => expect(router.state.location.pathname).toBe(destination))
    expect(invoke).not.toHaveBeenCalled()
  })
})
