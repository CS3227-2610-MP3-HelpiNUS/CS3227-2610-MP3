import { StrictMode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { discoverMentorsOutputSchema, moduleSchema, type DiscoverMentorsOutput } from '@helpinus/shared'
import { MentorDiscoveryPage } from '../pages/MentorDiscoveryPage'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { ServiceProvider } from '../services/ServiceProvider'
import { mockDashboard, mockServices } from '../services/mockServices'
import type { HelpiNUSServices } from '../services/contracts'

const mentor = (userId: string, displayName: string, biography = '', moduleIds: string[] = []) => ({ userId, displayName, biography, moduleIds })
const page = (mentors: ReturnType<typeof mentor>[], nextCursor: string | null): DiscoverMentorsOutput => discoverMentorsOutputSchema.parse({ mentors, nextCursor })
const cs2040s = moduleSchema.parse({ id: 'cs2040s', code: 'CS2040S', title: 'Data Structures and Algorithms', active: true })
const cs2103t = moduleSchema.parse({ id: 'cs2103t', code: 'CS2103T', title: 'Software Engineering', active: true })
const cs3230 = moduleSchema.parse({ id: 'cs3230', code: 'CS3230', title: 'Analysis of Algorithms', active: false })
const first = page([
  mentor('sample-a', 'Sample Aisha Rahman', 'Explains graph traversal', ['cs2040s', 'cs2103t', 'missing-1']),
  mentor('sample-b', 'Sample Ben Lim', 'Practices software design', ['cs2103t']),
  mentor('sample-c', 'Sample Cora Tan'),
], 'opaque-page-2')
const second = page([mentor('sample-b', 'Duplicate Ben', 'Should not replace', []), mentor('sample-d', 'Sample Devi Koh', 'Studies databases', ['cs3230'])], null)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function setup(pages: Record<string, DiscoverMentorsOutput | (() => Promise<DiscoverMentorsOutput>)> = { first, 'opaque-page-2': second }, options?: {
  moduleLookup?: HelpiNUSServices['modules']['getById']
  strict?: boolean
  user?: typeof mockDashboard.user | null
}) {
  const calls: Array<{ cursor?: string; limit: number }> = []
  const discover = vi.fn(async (input: { cursor?: string; limit: number }) => {
    calls.push(input)
    if (input.limit !== 20) throw new Error('Wrong limit')
    const entry = pages[input.cursor ?? 'first']
    if (!entry) throw new Error('Unknown cursor')
    return typeof entry === 'function' ? entry() : entry
  })
  const moduleReads = vi.fn(options?.moduleLookup ?? (async (id: string) => ({ cs2040s, cs2103t, cs3230 } as Record<string, typeof cs2040s>)[id] ?? null))
  const mutation = vi.fn(async () => { throw new Error('Mutation must not be called') })
  const user = options?.user === undefined ? mockDashboard.user : options.user
  const services: HelpiNUSServices = {
    ...mockServices,
    session: { ...mockServices.session, getCurrent: async () => ({ user }), subscribe: (listener) => { listener({ user }); return () => {} } },
    modules: { getById: moduleReads },
    callables: { invoke: ((name: string, input: { cursor?: string; limit: number }) => name === 'discoverMentors' ? discover(input) : mutation()) as HelpiNUSServices['callables']['invoke'] },
  }
  const router = createMemoryRouter([
    { element: <ProtectedRoute role="STUDENT" />, children: [{ path: '/student/mentors', element: <MentorDiscoveryPage /> }] },
    { path: '/login', element: <h1>Sign in</h1> },
    { path: '/mentor/dashboard', element: <h1>Mentor dashboard</h1> },
    { path: '/account-access', element: <h1>Account access</h1> },
  ], { initialEntries: ['/student/mentors'] })
  const result = render(<ServiceProvider servicesOverride={services}>{options?.strict ? <StrictMode><RouterProvider router={router} /></StrictMode> : <RouterProvider router={router} />}</ServiceProvider>)
  return { ...result, router, services, calls, discover, moduleReads, mutation }
}

describe('Mentor discovery route', () => {
  it('F02-TC-001/004/005: guards the route and appends the exact cursor page in response order', async () => {
    const user = userEvent.setup()
    const scenario = setup()
    expect(await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })).toBeInTheDocument()
    expect(scenario.calls).toEqual([{ limit: 20 }])
    expect(screen.getAllByRole('listitem').filter((item) => item.classList.contains('mentor-card')).map((item) => within(item).getByRole('heading').textContent)).toEqual(['Sample Aisha Rahman', 'Sample Ben Lim', 'Sample Cora Tan'])
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('heading', { name: 'Sample Devi Koh' })).toBeInTheDocument()
    expect(scenario.calls).toEqual([{ limit: 20 }, { cursor: 'opaque-page-2', limit: 20 }])
    expect(screen.queryByRole('heading', { name: 'Duplicate Ben' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('F02-TC-004: keeps a full 20-card first page in backend order', async () => {
    const twenty = Array.from({ length: 20 }, (_, index) => mentor(`sample-${index}`, `Sample Mentor ${String(20 - index).padStart(2, '0')}`))
    setup({ first: page(twenty, 'opaque-page-2'), 'opaque-page-2': page([], null) })
    await screen.findByRole('heading', { name: 'Sample Mentor 20' })
    expect(screen.getAllByRole('listitem').filter((item) => item.classList.contains('mentor-card')).map((item) => within(item).getByRole('heading').textContent)).toEqual(twenty.map((record) => record.displayName))
  })

  it('F02-TC-006/007: distinguishes catalogue exhaustion from empty incomplete pages', async () => {
    const user = userEvent.setup()
    setup({ first: page([], 'opaque-page-2'), 'opaque-page-2': page([], null) })
    expect(await screen.findByText('No mentors loaded yet. Load more to continue.')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Mentor results' })).toHaveTextContent('use Load more to continue')
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('heading', { name: 'No mentors available' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Mentor results' })).toHaveTextContent('No mentors are available')
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('F02-TC-007: an empty later page retains loaded cards and manual continuation', async () => {
    const user = userEvent.setup()
    const scenario = setup({ first, 'opaque-page-2': page([], 'opaque-page-3'), 'opaque-page-3': page([mentor('new', 'Sample New Mentor')], null) })
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(scenario.calls).toHaveLength(2))
    expect(screen.getByRole('heading', { name: 'Sample Aisha Rahman' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled()
    expect(scenario.calls).toEqual([{ limit: 20 }, { cursor: 'opaque-page-2', limit: 20 }])
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('heading', { name: 'Sample New Mentor' })).toBeInTheDocument()
    expect(scenario.calls[2]).toEqual({ cursor: 'opaque-page-3', limit: 20 })
  })

  it('F02-TC-008/012: retries the same failed cursor without losing loaded cards or controls', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const scenario = setup({ first, 'opaque-page-2': async () => { if (attempts++ === 0) throw new Error('offline'); return second } })
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    await user.type(screen.getByRole('searchbox', { name: 'Search loaded mentors' }), 'sample')
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText(/could not load more Mentors/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sample Aisha Rahman' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Sample Devi Koh' })).toBeInTheDocument()
    expect(scenario.calls).toEqual([{ limit: 20 }, { cursor: 'opaque-page-2', limit: 20 }, { cursor: 'opaque-page-2', limit: 20 }])
    expect(screen.getByRole('searchbox', { name: 'Search loaded mentors' })).toHaveValue('sample')
  })

  it('F02-TC-012: retries an initial failure and does not present empty success', async () => {
    let attempts = 0
    const scenario = setup({ first: async () => { if (attempts++ === 0) throw new Error('offline'); return first }, 'opaque-page-2': second })
    expect(await screen.findByRole('heading', { name: 'Mentors are unavailable' })).toBeInTheDocument()
    expect(screen.queryByText('No mentors available')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })).toBeInTheDocument()
    expect(scenario.calls).toEqual([{ limit: 20 }, { limit: 20 }])
  })

  it('F02-TC-012: initial Retry can recover to an incomplete empty page', async () => {
    let attempts = 0
    const scenario = setup({ first: async () => { if (attempts++ === 0) throw new Error('offline'); return page([], 'opaque-page-2') } })
    expect(await screen.findByRole('heading', { name: 'Mentors are unavailable' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No mentors loaded yet. Load more to continue.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled()
    expect(screen.queryByRole('heading', { name: 'No mentors available' })).not.toBeInTheDocument()
    expect(scenario.calls).toEqual([{ limit: 20 }, { limit: 20 }])
  })

  it('F02-TC-017/019: searches and filters only loaded Mentors, then updates no-match scope', async () => {
    const user = userEvent.setup()
    const scenario = setup()
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Academic module' })).toBeEnabled())
    await user.selectOptions(screen.getByRole('combobox', { name: 'Academic module' }), 'cs2103t')
    await user.type(screen.getByRole('searchbox', { name: 'Search loaded mentors' }), 'ben')
    expect(screen.getByRole('heading', { name: 'Sample Ben Lim' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sample Aisha Rahman' })).not.toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: 'Search loaded mentors' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search loaded mentors' }), 'devi')
    expect(screen.getByText('No matches among loaded mentors.')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Mentor results' })).toHaveTextContent('No matches among loaded mentors. Load more to continue.')
    expect(scenario.calls).toEqual([{ limit: 20 }])
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('No mentors match your search or module filter.')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Mentor results' })).toHaveTextContent('No loaded Mentors match the current search or module filter.')
    expect(screen.getByRole('button', { name: 'Clear search and filters' })).toBeEnabled()
  })

  it('F02-TC-021/033: uses real module labels in public order, with absent and empty details', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    const aisha = screen.getByText('Sample Aisha Rahman').closest('.mentor-card')!
    await user.click(within(aisha as HTMLElement).getByRole('button', { name: 'View details' }))
    const details = await screen.findByRole('region', { name: 'Sample Aisha Rahman details' })
    await waitFor(() => expect(within(details).getByText(/CS2040S/)).toBeInTheDocument())
    expect(within(details).getByText('Module information unavailable')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'View details' })[1])
    expect(screen.queryByRole('region', { name: 'Sample Aisha Rahman details' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Sample Cora Tan details' })).toHaveTextContent('No modules listed')
  })

  it('F02-TC-035/036: opens informational help dialog, closes by Escape, and makes no mutation', async () => {
    const user = userEvent.setup()
    const scenario = setup()
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    const card = screen.getByText('Sample Aisha Rahman').closest('.mentor-card')!
    await user.click(within(card as HTMLElement).getByRole('button', { name: 'View details' }))
    const trigger = within(card as HTMLElement).getByRole('button', { name: 'Ask for help' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Ask for help' })
    expect(dialog).toHaveTextContent('Sample Aisha Rahman')
    expect(dialog).toHaveTextContent('cannot yet be sent')
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Ask for help' })).not.toBeInTheDocument()
    expect(scenario.mutation).not.toHaveBeenCalled()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('F02-TC-024/027: degrades on failed metadata, retries failed IDs only, and retains filtering', async () => {
    const user = userEvent.setup()
    let failed = true
    const lookup = vi.fn(async (id: string) => { if (id === 'cs2103t' && failed) { failed = false; throw new Error('permission') }; return ({ cs2040s, cs2103t, cs3230 } as Record<string, typeof cs2040s>)[id] ?? null })
    setup(undefined, { moduleLookup: lookup })
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    expect(await screen.findByText(/Some module information is unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Academic module' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Retry module information' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Academic module' })).toBeEnabled())
    expect(lookup.mock.calls.filter(([id]) => id === 'cs2103t')).toHaveLength(2)
    expect(lookup.mock.calls.filter(([id]) => id === 'cs2040s')).toHaveLength(1)
  })

  it('F02-TC-009/011: prevents repeated pending loads and surfaces a nonadvancing cursor', async () => {
    const wait = deferred<DiscoverMentorsOutput>()
    const scenario = setup({ first, 'opaque-page-2': () => wait.promise })
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    const loadMore = screen.getByRole('button', { name: 'Load more' })
    act(() => { loadMore.click(); loadMore.click() })
    expect(screen.getByRole('button', { name: 'Load more' })).toBeDisabled()
    wait.resolve(page([], 'opaque-page-2'))
    expect(await screen.findByText(/could not load more Mentors/)).toBeInTheDocument()
    expect(scenario.calls).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Sample Aisha Rahman' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/could not load more Mentors/)).toBeInTheDocument()
    expect(scenario.calls[2]).toEqual({ cursor: 'opaque-page-2', limit: 20 })
    expect(screen.getByRole('heading', { name: 'Sample Aisha Rahman' })).toBeInTheDocument()
  })

  it('F02-TC-009: rapid failed-page Retry starts only one pending attempt', async () => {
    const wait = deferred<DiscoverMentorsOutput>()
    let attempts = 0
    const scenario = setup({ first, 'opaque-page-2': () => attempts++ === 0 ? Promise.reject(new Error('offline')) : wait.promise })
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load more' }))
    const retry = await screen.findByRole('button', { name: 'Retry' })
    act(() => { retry.click(); retry.click() })
    expect(scenario.calls).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    wait.resolve(second)
    expect(await screen.findByRole('heading', { name: 'Sample Devi Koh' })).toBeInTheDocument()
    expect(scenario.calls.filter((call) => call.cursor === 'opaque-page-2')).toHaveLength(2)
  })

  it('F02-TC-039: shares the first pending request during StrictMode effect replay', async () => {
    const wait = deferred<DiscoverMentorsOutput>()
    const scenario = setup({ first: () => wait.promise }, { strict: true })
    await waitFor(() => expect(scenario.calls).toEqual([{ limit: 20 }]))
    wait.resolve(page([mentor('sample-one', 'Sample One')], null))
    expect(await screen.findByRole('heading', { name: 'Sample One' })).toBeInTheDocument()
    expect(scenario.calls).toHaveLength(1)
  })

  it('F02-TC-002: never calls discovery for signed-out or wrong-role sessions', async () => {
    const signedOut = setup(undefined, { user: null })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(signedOut.calls).toHaveLength(0)
    signedOut.unmount()
    const wrongRole = setup(undefined, { user: { ...mockDashboard.user, role: 'MENTOR' } })
    expect(await screen.findByRole('heading', { name: 'Mentor dashboard' })).toBeInTheDocument()
    expect(wrongRole.calls).toHaveLength(0)
  })

  it('F02-TC-013: announces initial and additional loading separately while retaining cards', async () => {
    const firstWait = deferred<DiscoverMentorsOutput>()
    const laterWait = deferred<DiscoverMentorsOutput>()
    const scenario = setup({ first: () => firstWait.promise, 'opaque-page-2': () => laterWait.promise })
    expect(await screen.findByRole('status', { name: 'Loading mentors' })).toBeInTheDocument()
    expect(screen.queryByText('No mentors available')).not.toBeInTheDocument()
    firstWait.resolve(first)
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(screen.getByText('Loading more mentors…')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('heading', { name: 'Sample Aisha Rahman' })).toBeInTheDocument()
    expect(scenario.calls).toHaveLength(2)
    laterWait.resolve(second)
    expect(await screen.findByRole('heading', { name: 'Sample Devi Koh' })).toBeInTheDocument()
  })

  it('F02-TC-014/015/016: normalizes text, searches real active/inactive metadata, and independently clears controls', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    const search = screen.getByRole('searchbox', { name: 'Search loaded mentors' })
    const selector = screen.getByRole('combobox', { name: 'Academic module' })
    await waitFor(() => expect(selector).toBeEnabled())
    await user.type(search, '  GRAPH TRAVERSAL  ')
    expect(screen.getByRole('heading', { name: 'Sample Aisha Rahman' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sample Ben Lim' })).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'software engineering')
    expect(screen.getAllByRole('listitem').filter((item) => item.classList.contains('mentor-card'))).toHaveLength(2)
    await user.selectOptions(selector, 'cs2040s')
    expect(screen.getByRole('heading', { name: 'Sample Aisha Rahman' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sample Ben Lim' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear module' }))
    expect(search).toHaveValue('software engineering')
    expect(screen.getByRole('heading', { name: 'Sample Ben Lim' })).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'missing-1')
    expect(screen.getByText('No matches among loaded mentors.')).toBeInTheDocument()
    await user.clear(search)
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByRole('heading', { name: 'Sample Devi Koh' })
    await user.type(search, 'analysis of algorithms')
    expect(screen.getByRole('heading', { name: 'Sample Devi Koh' })).toBeInTheDocument()
  })

  it('F02-TC-020/022: offers only active modules supported by loaded Mentors', async () => {
    setup({ first: page([mentor('sample-one', 'Sample One', '', ['cs3230', 'missing-1'])], null) })
    await screen.findByRole('heading', { name: 'Sample One' })
    expect(await screen.findByText('No active supported modules are available for filtering.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Academic module' })).toBeDisabled()
    expect(screen.queryByText(/Some module information is unavailable/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sample One' })).toBeInTheDocument()
  })

  it('F02-TC-023/028: pending IDs are read once across overlapping pages, then enable module search', async () => {
    const wait = deferred<typeof cs2040s>()
    const lookup = vi.fn(async (id: string) => id === 'cs2040s' ? wait.promise : null)
    const user = userEvent.setup()
    setup({ first: page([mentor('sample-one', 'Sample One', '', ['cs2040s'])], 'next'), next: page([mentor('sample-two', 'Sample Two', '', ['cs2040s'])], null) }, { moduleLookup: lookup })
    await screen.findByRole('heading', { name: 'Sample One' })
    expect(screen.getByText(/Module information is loading/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Academic module' })).toBeDisabled()
    await user.type(screen.getByRole('searchbox', { name: 'Search loaded mentors' }), 'data structures')
    expect(screen.getByText('No matches among loaded mentors.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(lookup.mock.calls.filter(([id]) => id === 'cs2040s')).toHaveLength(1)
    wait.resolve(cs2040s)
    expect(await screen.findByRole('heading', { name: 'Sample One' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Academic module' })).toBeEnabled())
    expect(screen.getByRole('heading', { name: 'Sample Two' })).toBeInTheDocument()
  })

  it('F02-TC-024/025: keeps cards and known details through partial metadata failure', async () => {
    const user = userEvent.setup()
    const lookup = vi.fn(async (id: string) => { if (id === 'cs2103t') throw new Error('private permission detail'); return id === 'cs2040s' ? cs2040s : null })
    setup({ first }, { moduleLookup: lookup })
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    expect(await screen.findByText(/Some module information is unavailable/)).toBeInTheDocument()
    const search = screen.getByRole('searchbox', { name: 'Search loaded mentors' })
    await user.type(search, 'data structures')
    expect(screen.getByText('No matches among loaded mentors.')).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'graph traversal')
    expect(screen.getByRole('heading', { name: 'Sample Aisha Rahman' })).toBeInTheDocument()
    await user.click(within(screen.getByText('Sample Aisha Rahman').closest('.mentor-card') as HTMLElement).getByRole('button', { name: 'View details' }))
    const details = screen.getByRole('region', { name: 'Sample Aisha Rahman details' })
    expect(details).toHaveTextContent('CS2040S')
    expect(details).toHaveTextContent('Module information unavailable')
    expect(screen.queryByText('private permission detail')).not.toBeInTheDocument()
  })

  it('F02-TC-026/027: keeps selected ID through later metadata failure and allows independent clearing', async () => {
    const user = userEvent.setup()
    let fail = true
    const lookup = vi.fn(async (id: string) => {
      if (id === 'cs3230' && fail) { fail = false; throw new Error('offline') }
      return ({ cs2040s, cs2103t, cs3230 } as Record<string, typeof cs2040s>)[id] ?? null
    })
    setup(undefined, { moduleLookup: lookup })
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    const selector = screen.getByRole('combobox', { name: 'Academic module' })
    await waitFor(() => expect(selector).toBeEnabled())
    await user.selectOptions(selector, 'cs2040s')
    const search = screen.getByRole('searchbox', { name: 'Search loaded mentors' })
    await user.type(search, 'sample')
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText(/Some module information is unavailable/)).toBeInTheDocument()
    expect(selector).toHaveValue('cs2040s')
    expect(selector).toBeDisabled()
    expect(screen.queryByRole('heading', { name: 'Sample Devi Koh' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear module' }))
    expect(search).toHaveValue('sample')
    expect(screen.getByRole('heading', { name: 'Sample Devi Koh' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry module information' }))
    await waitFor(() => expect(selector).toBeEnabled())
    expect(lookup.mock.calls.filter(([id]) => id === 'cs3230')).toHaveLength(2)
  })

  it('F02-TC-033/034: collapses a filtered-out card and never reopens it automatically', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    const aisha = screen.getByText('Sample Aisha Rahman').closest('.mentor-card') as HTMLElement
    const toggle = within(aisha).getByRole('button', { name: 'View details' })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle.getAttribute('aria-controls')).toBe(screen.getByRole('region', { name: 'Sample Aisha Rahman details' }).id)
    const search = screen.getByRole('searchbox', { name: 'Search loaded mentors' })
    await user.type(search, 'ben')
    expect(screen.queryByRole('region', { name: 'Sample Aisha Rahman details' })).not.toBeInTheDocument()
    await user.clear(search)
    expect(screen.getByText('Sample Aisha Rahman').closest('.mentor-card')).toHaveTextContent('View details')
  })

  it('F02-TC-037: route revisit starts fresh and discards old page responses', async () => {
    const user = userEvent.setup()
    const wait = deferred<DiscoverMentorsOutput>()
    let firstCalls = 0
    const scenario = setup({ first: () => { firstCalls++; return Promise.resolve(first) }, 'opaque-page-2': () => wait.promise })
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    await user.type(screen.getByRole('searchbox', { name: 'Search loaded mentors' }), 'aisha')
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await scenario.router.navigate('/login')
    await screen.findByRole('heading', { name: 'Sign in' })
    wait.resolve(page([mentor('stale', 'Stale Mentor')], null))
    await scenario.router.navigate('/student/mentors')
    expect(await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search loaded mentors' })).toHaveValue('')
    expect(screen.queryByRole('heading', { name: 'Stale Mentor' })).not.toBeInTheDocument()
    expect(firstCalls).toBe(2)
  })

  it('F02-TC-018/020: new page grows sorted selector choices under retained controls', async () => {
    const user = userEvent.setup()
    const cs3227 = moduleSchema.parse({ id: 'cs3227', code: 'CS3227', title: 'Software Engineering on Modern Application Platforms', active: true })
    const lookup = vi.fn(async (id: string) => ({ cs2040s, cs3227 } as Record<string, typeof cs2040s>)[id] ?? null)
    setup({ first: page([mentor('one', 'Sample One', 'graph', ['cs2040s'])], 'next'), next: page([mentor('two', 'Sample Two', 'graph', ['cs2040s', 'cs3227'])], null) }, { moduleLookup: lookup })
    await screen.findByRole('heading', { name: 'Sample One' })
    const selector = screen.getByRole('combobox', { name: 'Academic module' })
    await waitFor(() => expect(selector).toBeEnabled())
    expect(within(selector).getAllByRole('option').map((option) => option.textContent)).toEqual(['All modules', 'CS2040S — Data Structures and Algorithms'])
    await user.selectOptions(selector, 'cs2040s')
    await user.type(screen.getByRole('searchbox', { name: 'Search loaded mentors' }), 'graph')
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('heading', { name: 'Sample Two' })).toBeInTheDocument()
    await waitFor(() => expect(within(selector).getAllByRole('option')).toHaveLength(3))
    expect(within(selector).getAllByRole('option').map((option) => option.textContent)).toEqual(['All modules', 'CS2040S — Data Structures and Algorithms', 'CS3227 — Software Engineering on Modern Application Platforms'])
    expect(selector).toHaveValue('cs2040s')
    expect(lookup.mock.calls.filter(([id]) => id === 'cs2040s')).toHaveLength(1)
  })

  it('F02-TC-035: help dialog captures selected real module, then clears context on close', async () => {
    const user = userEvent.setup()
    const scenario = setup()
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    const selector = screen.getByRole('combobox', { name: 'Academic module' })
    await waitFor(() => expect(selector).toBeEnabled())
    await user.selectOptions(selector, 'cs2040s')
    const card = screen.getByText('Sample Aisha Rahman').closest('.mentor-card') as HTMLElement
    await user.click(within(card).getByRole('button', { name: 'View details' }))
    await user.click(within(card).getByRole('button', { name: 'Ask for help' }))
    expect(screen.getByRole('dialog', { name: 'Ask for help' })).toHaveTextContent('Selected module: CS2040S — Data Structures and Algorithms')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: 'Clear module' }))
    await user.click(within(card).getByRole('button', { name: 'Ask for help' }))
    expect(screen.getByRole('dialog', { name: 'Ask for help' })).not.toHaveTextContent('Selected module:')
    expect(scenario.mutation).not.toHaveBeenCalled()
  })

  it.each(['SUSPENDED', 'DISABLED'] as const)('F02-TC-002: denies %s Students before discovery', async (status) => {
    const scenario = setup(undefined, { user: { ...mockDashboard.user, status } })
    expect(await screen.findByRole('heading', { name: 'Account access' })).toBeInTheDocument()
    expect(scenario.calls).toHaveLength(0)
  })

  it('F02-TC-038: service identity replacement ignores an old deferred response', async () => {
    const oldWait = deferred<DiscoverMentorsOutput>()
    const scenario = setup({ first: () => oldWait.promise })
    expect(await screen.findByRole('status', { name: 'Loading mentors' })).toBeInTheDocument()
    const newDiscovery = vi.fn(async () => page([mentor('new', 'Sample New Mentor')], null))
    const newServices: HelpiNUSServices = {
      ...scenario.services,
      callables: { invoke: ((name: string) => name === 'discoverMentors' ? newDiscovery() : Promise.reject(new Error('Unexpected callable'))) as HelpiNUSServices['callables']['invoke'] },
    }
    scenario.rerender(<ServiceProvider servicesOverride={newServices}><RouterProvider router={scenario.router} /></ServiceProvider>)
    expect(await screen.findByRole('heading', { name: 'Sample New Mentor' })).toBeInTheDocument()
    oldWait.resolve(page([mentor('old', 'Sample Old Mentor')], null))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Sample Old Mentor' })).not.toBeInTheDocument())
    expect(newDiscovery).toHaveBeenCalledTimes(1)
  })

  it('F02-TC-003/021: cards expose public fields and ordered metadata without private sentinels', async () => {
    const user = userEvent.setup()
    setup({ first: page([mentor('one', 'Sample One', 'Public biography', ['cs2040s', 'cs3230', 'missing-1'])], null) })
    await screen.findByRole('heading', { name: 'Sample One' })
    await user.click(screen.getByRole('button', { name: 'View details' }))
    const details = screen.getByRole('region', { name: 'Sample One details' })
    await waitFor(() => expect(details).toHaveTextContent('CS3230'))
    expect(within(details).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'CS2040S — Data Structures and Algorithms',
      'CS3230 — Analysis of Algorithms (Inactive)',
      'Module information unavailable',
    ])
    expect(document.body).not.toHaveTextContent(mockDashboard.user.email)
    expect(document.body).not.toHaveTextContent('SUSPENDED')
    expect(document.body).not.toHaveTextContent('missing-1')
  })

  it('F02-TC-025: full module failure retains name search without exposing service errors', async () => {
    const user = userEvent.setup()
    setup({ first }, { moduleLookup: async () => { throw new Error('private Firebase permission trace') } })
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    expect(await screen.findByText(/Some module information is unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Academic module' })).toBeDisabled()
    await user.type(screen.getByRole('searchbox', { name: 'Search loaded mentors' }), 'ben')
    expect(screen.getByRole('heading', { name: 'Sample Ben Lim' })).toBeInTheDocument()
    expect(screen.queryByText('private Firebase permission trace')).not.toBeInTheDocument()
  })

  it('F02-TC-028: repeated Retry cannot start concurrent reads for one failed module', async () => {
    const wait = deferred<typeof cs2040s>()
    let calls = 0
    const lookup = vi.fn(async () => { calls++; if (calls === 1) throw new Error('offline'); return wait.promise })
    setup({ first: page([mentor('one', 'Sample One', '', ['cs2040s'])], null) }, { moduleLookup: lookup })
    await screen.findByRole('heading', { name: 'Sample One' })
    const retry = await screen.findByRole('button', { name: 'Retry module information' })
    act(() => { retry.click(); retry.click() })
    expect(screen.queryByRole('button', { name: 'Retry module information' })).not.toBeInTheDocument()
    expect(lookup).toHaveBeenCalledTimes(2)
    wait.resolve(cs2040s)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Academic module' })).toBeEnabled())
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('F02-TC-033: opening another card collapses the first, and a second toggle closes it', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    const aisha = screen.getByText('Sample Aisha Rahman').closest('.mentor-card') as HTMLElement
    const ben = screen.getByText('Sample Ben Lim').closest('.mentor-card') as HTMLElement
    await user.click(within(aisha).getByRole('button', { name: 'View details' }))
    await user.click(within(ben).getByRole('button', { name: 'View details' }))
    expect(screen.queryByRole('region', { name: 'Sample Aisha Rahman details' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Sample Ben Lim details' })).toBeInTheDocument()
    await user.click(within(ben).getByRole('button', { name: 'Hide details' }))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('F02-TC-036: closing dialog after its trigger vanishes focuses a surviving control', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByRole('heading', { name: 'Sample Aisha Rahman' })
    const aisha = screen.getByText('Sample Aisha Rahman').closest('.mentor-card') as HTMLElement
    await user.click(within(aisha).getByRole('button', { name: 'View details' }))
    await user.click(within(aisha).getByRole('button', { name: 'Ask for help' }))
    const search = screen.getByRole('searchbox', { name: 'Search loaded mentors' })
    fireEvent.change(search, { target: { value: 'ben' } })
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Sample Aisha Rahman' })).not.toBeInTheDocument())
    await user.click(within(screen.getByRole('dialog', { name: 'Ask for help' })).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(search).toHaveFocus())
  })

  it('F02-TC-038: authenticated session identity change resets page and rejects late old records', async () => {
    const oldWait = deferred<DiscoverMentorsOutput>()
    const initialUser = mockDashboard.user
    const nextUser = { ...initialUser, id: 'student-02' }
    let currentUser = initialUser
    let emit!: (session: { user: typeof initialUser }) => void
    const discover = vi.fn()
      .mockImplementationOnce(() => oldWait.promise)
      .mockResolvedValueOnce(page([mentor('new', 'Sample New Student Mentor')], null))
    const services: HelpiNUSServices = {
      ...mockServices,
      session: { ...mockServices.session, getCurrent: async () => ({ user: currentUser }), subscribe: (listener) => { emit = listener; listener({ user: initialUser }); return () => {} } },
      callables: { invoke: ((name: string, input: unknown) => name === 'discoverMentors' ? discover(input) : Promise.reject(new Error('Unexpected callable'))) as HelpiNUSServices['callables']['invoke'] },
    }
    const router = createMemoryRouter([{ element: <ProtectedRoute role="STUDENT" />, children: [{ path: '/student/mentors', element: <MentorDiscoveryPage /> }] }], { initialEntries: ['/student/mentors'] })
    render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
    expect(await screen.findByRole('status', { name: 'Loading mentors' })).toBeInTheDocument()
    currentUser = nextUser
    act(() => emit({ user: nextUser }))
    expect(await screen.findByRole('heading', { name: 'Sample New Student Mentor' })).toBeInTheDocument()
    oldWait.resolve(page([mentor('old', 'Sample Old Student Mentor')], null))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Sample Old Student Mentor' })).not.toBeInTheDocument())
    expect(discover).toHaveBeenCalledTimes(2)
  })

  it('F02-TC-038: identity replacement hides loaded cards while the new page waits and discards old metadata', async () => {
    const oldModule = deferred<typeof cs2040s>()
    const newPage = deferred<DiscoverMentorsOutput>()
    const initialUser = mockDashboard.user
    const nextUser = { ...initialUser, id: 'student-02' }
    let currentUser = initialUser
    let emit!: (session: { user: typeof initialUser }) => void
    const discover = vi.fn()
      .mockResolvedValueOnce(page([mentor('old', 'Sample Old Mentor', '', ['cs2040s'])], null))
      .mockImplementationOnce(() => newPage.promise)
    const services: HelpiNUSServices = {
      ...mockServices,
      session: { ...mockServices.session, getCurrent: async () => ({ user: currentUser }), subscribe: (listener) => { emit = listener; listener({ user: initialUser }); return () => {} } },
      modules: { getById: () => oldModule.promise },
      callables: { invoke: ((name: string, input: unknown) => name === 'discoverMentors' ? discover(input) : Promise.reject(new Error('Unexpected callable'))) as HelpiNUSServices['callables']['invoke'] },
    }
    const router = createMemoryRouter([{ element: <ProtectedRoute role="STUDENT" />, children: [{ path: '/student/mentors', element: <MentorDiscoveryPage /> }] }], { initialEntries: ['/student/mentors'] })
    render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
    expect(await screen.findByRole('heading', { name: 'Sample Old Mentor' })).toBeInTheDocument()
    currentUser = nextUser
    act(() => emit({ user: nextUser }))
    expect(screen.queryByRole('heading', { name: 'Sample Old Mentor' })).not.toBeInTheDocument()
    expect(await screen.findByRole('status', { name: 'Loading mentors' })).toBeInTheDocument()
    await act(async () => oldModule.resolve(cs2040s))
    expect(screen.queryByText(/CS2040S/)).not.toBeInTheDocument()
    await act(async () => newPage.resolve(page([mentor('new', 'Sample New Mentor')], null)))
    expect(await screen.findByRole('heading', { name: 'Sample New Mentor' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sample Old Mentor' })).not.toBeInTheDocument()
    expect(discover).toHaveBeenCalledTimes(2)
  })

  it('F02-TC-038: an identity becoming unauthorized removes discovery without another fetch', async () => {
    const initialUser = mockDashboard.user
    let emit!: (session: { user: typeof initialUser }) => void
    const discover = vi.fn(async (input: unknown) => {
      expect(input).toEqual({ limit: 20 })
      return page([mentor('old', 'Sample Old Mentor')], null)
    })
    const services: HelpiNUSServices = {
      ...mockServices,
      session: { ...mockServices.session, getCurrent: async () => ({ user: initialUser }), subscribe: (listener) => { emit = listener; listener({ user: initialUser }); return () => {} } },
      callables: { invoke: ((name: string, input: unknown) => name === 'discoverMentors' ? discover(input) : Promise.reject(new Error('Unexpected callable'))) as HelpiNUSServices['callables']['invoke'] },
    }
    const router = createMemoryRouter([
      { element: <ProtectedRoute role="STUDENT" />, children: [{ path: '/student/mentors', element: <MentorDiscoveryPage /> }] },
      { path: '/account-access', element: <h1>Account access</h1> },
    ], { initialEntries: ['/student/mentors'] })
    render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
    expect(await screen.findByRole('heading', { name: 'Sample Old Mentor' })).toBeInTheDocument()
    act(() => emit({ user: { ...initialUser, status: 'SUSPENDED' } }))
    expect(await screen.findByRole('heading', { name: 'Account access' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sample Old Mentor' })).not.toBeInTheDocument()
    expect(discover).toHaveBeenCalledTimes(1)
  })
})
