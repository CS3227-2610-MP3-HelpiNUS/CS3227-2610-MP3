import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReadOwnMentorProfileOutput, SearchMentorModulesOutput, UpdateOwnMentorProfileOutput } from '@helpinus/shared'
import { MentorProfilePage } from '../pages/MentorProfilePage'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { ServiceProvider } from '../services/ServiceProvider'
import { mockDashboard, mockServices } from '../services/mockServices'
import type { HelpiNUSServices } from '../services/contracts'

const mentor = mockDashboard.mentors[0].user
const ready = (biography = '', revision = 0): ReadOwnMentorProfileOutput => ({
  kind: 'ready', profile: { displayName: mentor.displayName, biography, moduleIds: [], version: { revision, updateTime: `${revision + 1}:000000000` } }, metadata: { kind: 'ready', modules: [] },
})
const withModules = (ids: string[], modules: Extract<ReadOwnMentorProfileOutput, { kind: 'ready' }>['metadata']): ReadOwnMentorProfileOutput => ({
  kind: 'ready', profile: { displayName: mentor.displayName, biography: 'Before', moduleIds: ids, version: { revision: 0, updateTime: '1:000000000' } }, metadata: modules,
})

function setup(options: { initial?: ReadOwnMentorProfileOutput; readOverride?: () => Promise<ReadOwnMentorProfileOutput>; search?: (input: unknown) => Promise<SearchMentorModulesOutput>; update?: (input: unknown) => Promise<UpdateOwnMentorProfileOutput>; currentUser?: () => typeof mentor | null } = {}) {
  let stored = options.initial ?? ready()
  let emit: ((session: { user: typeof mentor | null }) => void) | null = null
  const update = vi.fn(options.update ?? (async (input: unknown): Promise<UpdateOwnMentorProfileOutput> => {
    const value = input as { biography: string }
    stored = ready(value.biography, 1)
    return { kind: 'accepted', stored: { biography: value.biography, moduleIds: [], revision: 1 } }
  }))
  const read = vi.fn(async () => options.readOverride ? options.readOverride() : stored)
  const search = vi.fn(options.search ?? (async () => ({ modules: [{ id: 'cs2103t', code: 'CS2103T', title: 'Software Engineering' }], nextCursor: null })))
  const services: HelpiNUSServices = {
    ...mockServices,
    session: { ...mockServices.session, getCurrent: async () => ({ user: options.currentUser ? options.currentUser() : mentor }), subscribe: (listener) => { emit = listener; listener({ user: options.currentUser ? options.currentUser() : mentor }); return () => {} } },
    callables: { invoke: ((name: string, input: unknown) => {
      if (name === 'readOwnMentorProfile') return read()
      if (name === 'updateOwnMentorProfile') return update(input)
      if (name === 'searchMentorModules') return search(input)
      throw new Error('Unexpected callable')
    }) as HelpiNUSServices['callables']['invoke'] },
  }
  const router = createMemoryRouter([
    { element: <ProtectedRoute role="MENTOR" />, children: [{ path: '/mentor/profile', element: <MentorProfilePage /> }] },
    { path: '/login', element: <h1>Sign in</h1> },
  ], { initialEntries: ['/mentor/profile'] })
  render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
  return { update, read, search, router, emit: (session: { user: typeof mentor | null }) => emit?.(session), setStored: (next: ReadOwnMentorProfileOutput) => { stored = next } }
}

describe('Mentor profile management', () => {
  it('shows blank public fields and confirms persisted biography only after a fresh read', async () => {
    const user = userEvent.setup()
    const { update, read } = setup()
    expect(await screen.findByText('No biography provided')).toBeInTheDocument()
    expect(screen.getByText('No modules listed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    await user.type(screen.getByLabelText('Biography'), 'I teach software design.')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument()
    expect(screen.getByText('I teach software design.')).toBeInTheDocument()
    expect(update).toHaveBeenCalledTimes(1)
    expect(read.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('keeps an uncertain save in edit mode with the same request ID on retry', async () => {
    const user = userEvent.setup()
    let calls = 0
    const seen: unknown[] = []
    const { update, setStored } = setup({ update: async (input) => {
      seen.push(input)
      calls += 1
      if (calls === 1) throw new Error('lost acknowledgement')
      setStored(ready('New biography', 1))
      return { kind: 'accepted', stored: { biography: 'New biography', moduleIds: [], revision: 1 } }
    } })
    await screen.findByText('No biography provided')
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    await user.type(screen.getByLabelText('Biography'), 'New biography')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText(/Save may have completed/u)).toBeInTheDocument()
    expect(screen.queryByText('Profile saved.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry save or confirmation' }))
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument()
    expect(update).toHaveBeenCalledTimes(2)
    expect((seen[0] as { requestId: string }).requestId).toBe((seen[1] as { requestId: string }).requestId)
  })

  it('shows trusted profile-unavailable guidance if the profile disappears during save', async () => {
    const user = userEvent.setup()
    let unavailable = false
    setup({
      readOverride: async () => unavailable ? { kind: 'missing' } : ready(),
      update: async () => { unavailable = true; throw { code: 'functions/failed-precondition' } },
    })
    await screen.findByText('No biography provided')
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    await user.type(screen.getByLabelText('Biography'), 'Draft biography')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByRole('heading', { name: 'Profile unavailable' })).toBeInTheDocument()
    expect(screen.queryByText('Your account access changed. Sign in again.')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Draft biography')).not.toBeInTheDocument()
  })

  it('rejects an oversized biography locally and shows read-only missing guidance', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText('No biography provided')
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    fireEvent.change(screen.getByLabelText('Biography'), { target: { value: 'x'.repeat(1001) } })
    expect(screen.getByText('Biography must be at most 1,000 characters.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled()
  })

  it('does not publish a stale read after the route unmounts', async () => {
    let resolveFirst!: (value: ReadOwnMentorProfileOutput) => void
    const first = new Promise<ReadOwnMentorProfileOutput>((resolve) => { resolveFirst = resolve })
    let calls = 0
    const { router, read } = setup({ readOverride: () => ++calls === 1 ? first : Promise.resolve(ready('Current biography')) })
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    await router.navigate('/login')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument())
    resolveFirst(ready('Stale private biography'))
    await router.navigate('/mentor/profile')
    expect(await screen.findByText('Current biography')).toBeInTheDocument()
    expect(screen.queryByText('Stale private biography')).not.toBeInTheDocument()
  })

  it('recovers from a rejected search query without losing the biography draft', async () => {
    const user = userEvent.setup()
    const { search } = setup({ search: async (input) => {
      if ((input as { query: string }).query.length > 160) throw { code: 'functions/invalid-argument' }
      return { modules: [{ id: 'cs2103t', code: 'CS2103T', title: 'Software Engineering' }], nextCursor: null }
    } })
    await screen.findByText('No biography provided')
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    await user.type(screen.getByLabelText('Biography'), 'Keep this draft')
    fireEvent.change(screen.getByLabelText('Find modules by code or title prefix'), { target: { value: 'x'.repeat(161) } })
    expect(await screen.findByText(/Module search is unavailable/u)).toBeInTheDocument()
    const query = screen.getByLabelText('Find modules by code or title prefix')
    expect(query).toBeEnabled()
    fireEvent.change(query, { target: { value: 'cs' } })
    expect(await screen.findByRole('button', { name: 'Add CS2103T' })).toBeEnabled()
    expect(screen.getByLabelText('Biography')).toHaveValue('Keep this draft')
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('clears the visible draft when protected search denies access', async () => {
    const user = userEvent.setup()
    setup({ initial: ready('Private biography'), search: async () => { throw { code: 'functions/permission-denied' } } })
    expect(await screen.findByText('Private biography')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    await user.type(screen.getByLabelText('Biography'), 'Secret draft')
    fireEvent.change(screen.getByLabelText('Find modules by code or title prefix'), { target: { value: 'cs' } })
    expect(await screen.findByText('Your account access changed. Sign in again.')).toBeInTheDocument()
    expect(screen.queryByText('Private biography')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Secret draft')).not.toBeInTheDocument()
  })

  it('revalidates on a return to the profile route before reading private content', async () => {
    let currentUser: typeof mentor | null = mentor
    const { router, read } = setup({ initial: ready('Private biography'), currentUser: () => currentUser })
    expect(await screen.findByText('Private biography')).toBeInTheDocument()
    await router.navigate('/login')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument())
    currentUser = null
    await router.navigate('/mentor/profile')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(screen.queryByText('Private biography')).not.toBeInTheDocument()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('shows access guidance after a protected own-profile read denies access', async () => {
    const { read } = setup({ readOverride: async () => { throw { code: 'functions/permission-denied' } } })
    expect(await screen.findByText('Your account access changed. Sign in again.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('blocks navigation from a changed draft until discard is chosen', async () => {
    const user = userEvent.setup()
    const originalShow = HTMLDialogElement.prototype.showModal
    const originalClose = HTMLDialogElement.prototype.close
    HTMLDialogElement.prototype.showModal = function () { this.open = true }
    HTMLDialogElement.prototype.close = function () { this.open = false }
    try {
      const { router } = setup()
      await screen.findByText('No biography provided')
      await user.click(screen.getByRole('button', { name: 'Edit profile' }))
      await user.type(screen.getByLabelText('Biography'), 'Unsaved')
      void router.navigate('/login')
      await waitFor(() => expect(screen.getByText('Discard unsaved changes?').closest('dialog')).toHaveAttribute('open'))
      expect(router.state.location.pathname).toBe('/mentor/profile')
      await user.click(screen.getByRole('button', { name: 'Keep editing' }))
      expect(router.state.location.pathname).toBe('/mentor/profile')
      void router.navigate('/login')
      await waitFor(() => expect(screen.getByText('Discard unsaved changes?').closest('dialog')).toHaveAttribute('open'))
      await user.click(screen.getByRole('button', { name: 'Discard changes' }))
      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    } finally {
      HTMLDialogElement.prototype.showModal = originalShow
      HTMLDialogElement.prototype.close = originalClose
    }
  })

  it('withholds success when a confirming read does not match the receipt', async () => {
    const user = userEvent.setup()
    setup({ update: async () => ({ kind: 'accepted', stored: { biography: 'Changed', moduleIds: [], revision: 1 } }) })
    await screen.findByText('No biography provided')
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    await user.type(screen.getByLabelText('Biography'), 'Changed')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText(/A newer profile is available/u)).toBeInTheDocument()
    expect(screen.queryByText('Profile saved.')).not.toBeInTheDocument()
  })

  it('clears sensitive content when focus revalidation loses Mentor eligibility', async () => {
    let currentUser: typeof mentor | null = mentor
    const { router, emit } = setup({ initial: ready('Private biography'), currentUser: () => currentUser })
    expect(await screen.findByText('Private biography')).toBeInTheDocument()
    currentUser = null
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(screen.queryByText('Private biography')).not.toBeInTheDocument()
    emit({ user: mentor })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(screen.queryByText('Private biography')).not.toBeInTheDocument()
  })

  it('keeps selected modules while paging through 20 results and replacing a query', async () => {
    const user = userEvent.setup()
    const firstPage = Array.from({ length: 20 }, (_, index) => ({ id: `module-${index}`, code: `MOD${index}`, title: `Module ${index}` }))
    const lastPage = [{ id: 'module-20', code: 'MOD20', title: 'Module 20' }]
    const { search } = setup({ search: async (input) => {
      const { query, cursor } = input as { query: string; cursor?: string }
      if (query === 'other') return { modules: [{ id: 'other', code: 'OTHER', title: 'Other module' }], nextCursor: null }
      return cursor ? { modules: lastPage, nextCursor: null } : { modules: firstPage, nextCursor: 'page-two' }
    } })
    await screen.findByText('No biography provided')
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    fireEvent.change(screen.getByLabelText('Find modules by code or title prefix'), { target: { value: 'mod' } })
    expect(await screen.findByRole('button', { name: 'Add MOD19' })).toBeEnabled()
    expect(screen.getAllByRole('button', { name: /^Add MOD/u })).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: 'Add MOD0' }))
    expect(screen.getByRole('button', { name: 'Selected' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('button', { name: 'Add MOD20' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add MOD19' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Add MOD20' }))
    expect(screen.getByText('Selected modules (2/30)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Find modules by code or title prefix'), { target: { value: 'other' } })
    expect(await screen.findByRole('button', { name: 'Add OTHER' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Add MOD19' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove module-0' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove module-20' })).toBeInTheDocument()
    expect(search).toHaveBeenNthCalledWith(2, { query: 'mod', cursor: 'page-two' })
    expect(search).toHaveBeenNthCalledWith(3, { query: 'other' })
  })

  it('shows inactive and missing saved modules, counts them toward 30, and frees a slot on removal', async () => {
    const user = userEvent.setup()
    const ids = [...Array.from({ length: 28 }, (_, index) => `saved-${index}`), 'legacy-off', 'legacy-gone']
    const modules = [...ids.slice(0, 28).map((id, index) => ({ id, state: 'active' as const, code: `S${index}`, title: `Saved ${index}` })),
      { id: 'legacy-off', state: 'inactive' as const, code: 'OFF', title: 'Retired module' },
      { id: 'legacy-gone', state: 'missing' as const }]
    setup({ initial: withModules(ids, { kind: 'ready', modules }), search: async () => ({ modules: [{ id: 'new-one', code: 'NEW1', title: 'New module' }], nextCursor: null }) })
    expect(await screen.findByText('OFF — Retired module (Inactive)')).toBeInTheDocument()
    expect(screen.getByText('Module information unavailable (legacy-gone)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    expect(screen.getByText('Selected modules (30/30)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Find modules by code or title prefix'), { target: { value: 'new' } })
    expect(await screen.findByRole('button', { name: 'Add NEW1' })).toBeDisabled()
    expect(screen.getByText('All 30 module slots are filled. Remove one to add another.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove legacy-gone' }))
    expect(screen.getByText('Selected modules (29/30)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add NEW1' }))
    expect(screen.getByText('Selected modules (30/30)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove new-one' })).toBeInTheDocument()
  })

  it('keeps an effective no-op disabled after trimming biography and restoring the module set', async () => {
    const user = userEvent.setup()
    const { update } = setup({ initial: withModules(['cs2103t'], { kind: 'ready', modules: [{ id: 'cs2103t', state: 'active', code: 'CS2103T', title: 'Software Engineering' }] }), search: async () => ({ modules: [{ id: 'cs2103t', code: 'CS2103T', title: 'Software Engineering' }], nextCursor: null }) })
    await screen.findByText('Before')
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Biography'), { target: { value: '  Before  ' } })
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Remove cs2103t' }))
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Find modules by code or title prefix'), { target: { value: 'cs' } })
    await user.click(await screen.findByRole('button', { name: 'Add CS2103T' }))
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled()
    expect(update).not.toHaveBeenCalled()
    expect(screen.queryByText('Profile saved.')).not.toBeInTheDocument()
  })

  it('keeps the dirty draft and offers conflict review after metadata retry reads a newer version', async () => {
    const user = userEvent.setup()
    let latest = false
    const { read } = setup({ readOverride: async () => latest ? ready('Elsewhere', 1) : { ...ready('Before'), metadata: { kind: 'unavailable' } } as ReadOwnMentorProfileOutput })
    expect(await screen.findByText('Before')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    await user.type(screen.getByLabelText('Biography'), ' draft')
    expect(screen.getByLabelText('Biography')).toHaveValue('Before draft')
    latest = true
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Profile changed elsewhere' })).toBeInTheDocument()
    expect(screen.getByLabelText('Biography')).toHaveValue('Before draft')
    expect(screen.getByText('Latest biography: Elsewhere')).toBeInTheDocument()
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('keeps, discards, or reapplies a draft after the update callable reports a conflict', async () => {
    const user = userEvent.setup()
    let latest = false
    const { update, setStored } = setup({
      initial: ready('Before'),
      update: async () => {
        latest = true
        setStored(ready('Elsewhere', 1))
        return { kind: 'rejected', reason: 'CONFLICT' }
      },
    })
    expect(await screen.findByText('Before')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    fireEvent.change(screen.getByLabelText('Biography'), { target: { value: 'My draft' } })
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByRole('heading', { name: 'Profile changed elsewhere' })).toBeInTheDocument()
    expect(latest).toBe(true)
    expect(screen.getByLabelText('Biography')).toHaveValue('My draft')
    expect(screen.getByText('Latest biography: Elsewhere')).toBeInTheDocument()
    expect(screen.queryByText('Profile saved.')).not.toBeInTheDocument()
    expect(update).toHaveBeenCalledTimes(1)

    // Keeping the draft leaves it editable while the latest profile is visible.
    fireEvent.change(screen.getByLabelText('Biography'), { target: { value: 'My revised draft' } })
    expect(screen.getByLabelText('Biography')).toHaveValue('My revised draft')
    expect(screen.getByText('Latest biography: Elsewhere')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reapply my draft' }))
    expect(screen.getByLabelText('Biography')).toHaveValue('My revised draft')
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
    expect(screen.queryByRole('heading', { name: 'Profile changed elsewhere' })).not.toBeInTheDocument()

    // A second concurrent change surfaces another conflict; discarding loads that version.
    setStored(ready('Latest again', 2))
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('Latest biography: Latest again')).toBeInTheDocument()
    expect(update).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Discard draft and show latest' }))
    expect(screen.getByText('Latest again')).toBeInTheDocument()
    expect(screen.queryByLabelText('Biography')).not.toBeInTheDocument()
    expect(screen.queryByText('My revised draft')).not.toBeInTheDocument()
  })

  it('pauses module changes after search failure, keeps biography editable, and retries the current query', async () => {
    const user = userEvent.setup()
    let fail = true
    const initial = withModules(['cs2103t'], { kind: 'ready', modules: [{ id: 'cs2103t', state: 'active', code: 'CS2103T', title: 'Software Engineering' }] })
    const { search, update } = setup({ initial, search: async () => {
      if (fail) throw new Error('catalogue offline')
      return { modules: [{ id: 'cs2040s', code: 'CS2040S', title: 'Data Structures' }], nextCursor: null }
    } })
    await screen.findByText('Before')
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    fireEvent.change(screen.getByLabelText('Find modules by code or title prefix'), { target: { value: 'CS' } })
    expect(await screen.findByText(/Module search is unavailable/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove cs2103t' })).toBeDisabled()
    await user.type(screen.getByLabelText('Biography'), ' draft')
    expect(screen.getByLabelText('Biography')).toHaveValue('Before draft')
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry search' }))
    expect(await screen.findByRole('button', { name: 'Add CS2040S' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Remove cs2103t' })).toBeEnabled()
    expect(screen.getByLabelText('Biography')).toHaveValue('Before draft')
    expect(search).toHaveBeenNthCalledWith(1, { query: 'cs' })
    expect(search).toHaveBeenNthCalledWith(2, { query: 'cs' })
    expect(update).not.toHaveBeenCalled()
  })

  it('preserves biography editing and an unchanged module set when saved metadata is unavailable', async () => {
    const user = userEvent.setup()
    const initial = withModules(['cs2103t'], { kind: 'unavailable' })
    const storeRef: { setStored?: (next: ReadOwnMentorProfileOutput) => void } = {}
    const { update, setStored: store } = setup({ initial, update: async () => {
      storeRef.setStored?.({ kind: 'ready', profile: { displayName: mentor.displayName, biography: 'Before draft', moduleIds: ['cs2103t'], version: { revision: 1, updateTime: '2:000000000' } }, metadata: { kind: 'ready', modules: [{ id: 'cs2103t', state: 'active', code: 'CS2103T', title: 'Software Engineering' }] } })
      return { kind: 'accepted', stored: { biography: 'Before draft', moduleIds: ['cs2103t'], revision: 1 } }
    } })
    storeRef.setStored = store
    await screen.findByText('Before')
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    expect(screen.getByRole('button', { name: 'Remove cs2103t' })).toBeDisabled()
    expect(screen.getByLabelText('Find modules by code or title prefix')).toBeDisabled()
    await user.type(screen.getByLabelText('Biography'), ' draft')
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect((update.mock.calls[0][0] as { moduleIds: string[] }).moduleIds).toEqual(['cs2103t'])
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument()
  })

  it('locks editing and blocks navigation while one update is pending without claiming success', async () => {
    const user = userEvent.setup()
    let resolveUpdate!: (value: UpdateOwnMentorProfileOutput) => void
    const pending = new Promise<UpdateOwnMentorProfileOutput>((resolve) => { resolveUpdate = resolve })
    const { update, router, setStored } = setup({ update: () => pending })
    await screen.findByText('No biography provided')
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    await user.type(screen.getByLabelText('Biography'), 'Pending save')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Biography')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.queryByText('Profile saved.')).not.toBeInTheDocument()
    void router.navigate('/login')
    await waitFor(() => expect(router.state.location.pathname).toBe('/mentor/profile'))
    expect(screen.queryByText('Profile saved.')).not.toBeInTheDocument()
    setStored(ready('Pending save', 1))
    resolveUpdate({ kind: 'accepted', stored: { biography: 'Pending save', moduleIds: [], revision: 1 } })
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('discards an uncertain attempt after draft changes and requires conflict review before a new UUID', async () => {
    const user = userEvent.setup()
    let calls = 0
    const { update, setStored } = setup({ update: async () => {
      calls += 1
      if (calls === 1) { setStored(ready('First draft', 1)); throw new Error('acknowledgement lost after commit') }
      return { kind: 'accepted', stored: { biography: 'Second draft', moduleIds: [], revision: 2 } }
    } })
    await screen.findByText('No biography provided')
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    await user.type(screen.getByLabelText('Biography'), 'First draft')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText(/Save may have completed/u)).toBeInTheDocument()
    const first = update.mock.calls[0][0] as { requestId: string }
    fireEvent.change(screen.getByLabelText('Biography'), { target: { value: 'Second draft' } })
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByRole('heading', { name: 'Profile changed elsewhere' })).toBeInTheDocument()
    expect(update).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Biography')).toHaveValue('Second draft')
    await user.click(screen.getByRole('button', { name: 'Reapply my draft' }))
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    const second = update.mock.calls[1][0] as { requestId: string; baseline: { revision: number } }
    expect(second.requestId).not.toBe(first.requestId)
    expect(second.baseline.revision).toBe(1)
  })
})
