import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import type { ReadOwnMentorProfileOutput, SearchMentorModulesOutput, UpdateOwnMentorProfileInput, UpdateOwnMentorProfileOutput } from '@helpinus/shared'
import { useServices } from '../services/useServices'
import type { HelpiNUSServices } from '../services/contracts'

type Ready = Extract<ReadOwnMentorProfileOutput, { kind: 'ready' }>
type Attempt = { input: UpdateOwnMentorProfileInput; receipt?: Extract<UpdateOwnMentorProfileOutput, { kind: 'accepted' }> }
type SearchState = { query: string; modules: SearchMentorModulesOutput['modules']; cursor: string | null; status: 'idle' | 'loading' | 'ready' | 'error' }
const emptySearch: SearchState = { query: '', modules: [], cursor: null, status: 'idle' }
const serviceKeys = new WeakMap<HelpiNUSServices, number>()
let nextServiceKey = 0
const equalIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id))
const sameVersion = (a: Ready['profile']['version'], b: Ready['profile']['version']) => a.revision === b.revision && a.updateTime === b.updateTime
const isProtectedDenial = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && /unauthenticated|permission-denied|failed-precondition/u.test(String(error.code))
const isFailedPrecondition = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && /failed-precondition/u.test(String(error.code))

export function MentorProfilePage() {
  const { services, session, refreshSession } = useServices()
  let serviceKey = serviceKeys.get(services)
  if (serviceKey === undefined) { serviceKey = ++nextServiceKey; serviceKeys.set(services, serviceKey) }
  const user = session?.user
  return <MentorProfileContent key={`${serviceKey}:${user?.id ?? ''}:${user?.role ?? ''}:${user?.status ?? ''}`} services={services} uid={user?.id ?? null} refreshSession={refreshSession} />
}

function MentorProfileContent({ services, uid, refreshSession }: { services: HelpiNUSServices; uid: string | null; refreshSession: () => Promise<void> }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'inactive' | 'invalid' | 'error'>('loading')
  const [confirmed, setConfirmed] = useState<Ready | null>(null)
  const confirmedRef = useRef<Ready | null>(null)
  useEffect(() => { confirmedRef.current = confirmed }, [confirmed])
  const [mode, setMode] = useState<'saved' | 'edit'>('saved')
  const [biography, setBiography] = useState('')
  const [moduleIds, setModuleIds] = useState<string[]>([])
  const [search, setSearch] = useState<SearchState>(emptySearch)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [conflict, setConflict] = useState<Ready | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const generation = useRef(0)
  const searchGeneration = useRef(0)
  const attemptGeneration = useRef(0)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const dialogActionRef = useRef<HTMLButtonElement>(null)
  const conflictDialogRef = useRef<HTMLDialogElement>(null)
  const conflictActionRef = useRef<HTMLButtonElement>(null)
  const editHeadingRef = useRef<HTMLHeadingElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const dirty = confirmed !== null && (biography.trim() !== confirmed.profile.biography || !equalIds(moduleIds, confirmed.profile.moduleIds))
  const metadataHealthy = confirmed?.metadata.kind === 'ready' && search.status !== 'error'
  const modulesChanged = confirmed ? !equalIds(moduleIds, confirmed.profile.moduleIds) : false
  const biographyValid = biography.trim().length <= 1000
  const blocker = useBlocker(mode === 'edit' && dirty)
  const dialogVisible = discardOpen || blocker.state === 'blocked'

  const clearForAccessLoss = useCallback(() => {
    ++generation.current; ++searchGeneration.current; ++attemptGeneration.current
    setConfirmed(null); confirmedRef.current = null
    setBiography(''); setModuleIds([]); setSearch(emptySearch)
    setAttempt(null); setConflict(null); setDiscardOpen(false); setSaving(false); setMode('saved')
    setStatus('error'); setMessage('Your account access changed. Sign in again.')
    void refreshSession()
  }, [refreshSession])

  const verifyCurrentSession = useCallback(async () => {
    const captured = generation.current
    try {
      const current = await services.session.getCurrent()
      if (generation.current !== captured) return false
      if (current.user?.id === uid && current.user.role === 'MENTOR' && current.user.status === 'ACTIVE') return true
    } catch {
      // A failed eligibility check cannot authorize a profile read.
    }
    if (generation.current !== captured) return false
    clearForAccessLoss()
    return false
  }, [clearForAccessLoss, services, uid])

  const read = useCallback(async (preserveDraft = false) => {
    const captured = ++generation.current
    if (!preserveDraft) setStatus('loading')
    try {
      const result = await services.callables.invoke('readOwnMentorProfile', {})
      if (generation.current !== captured) return null
      if (result.kind !== 'ready') {
        ++searchGeneration.current; ++attemptGeneration.current
        setConfirmed(null); confirmedRef.current = null; setBiography(''); setModuleIds([]); setSearch(emptySearch)
        setStatus(result.kind); setMode('saved'); setAttempt(null); setConflict(null); setSaving(false); setMessage('')
        return null
      }
      if (preserveDraft && confirmedRef.current && !sameVersion(result.profile.version, confirmedRef.current.profile.version)) {
        setConflict(result); setMessage('Your profile changed elsewhere. Review the latest version.'); return result
      }
      setConfirmed(result)
      setStatus('ready')
      if (!preserveDraft) { setBiography(result.profile.biography); setModuleIds(result.profile.moduleIds); setMode('saved'); setAttempt(null); setConflict(null) }
      return result
    } catch (error) {
      if (generation.current === captured) {
        if (isProtectedDenial(error)) clearForAccessLoss()
        else { if (!preserveDraft) setStatus('error'); setMessage('Could not load your profile. Try again.') }
      }
      return null
    }
  }, [clearForAccessLoss, services])

  useEffect(() => {
    let active = true
    const revalidate = () => {
      const captured = generation.current
      void verifyCurrentSession().then((eligible) => { if (active && eligible && generation.current === captured) void read() })
    }
    queueMicrotask(() => { if (active) revalidate() })
    const onFocus = () => { void verifyCurrentSession() }
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onFocus)
    const profileGeneration = generation
    const queryGeneration = searchGeneration
    const saveGeneration = attemptGeneration
    return () => { active = false; ++profileGeneration.current; ++queryGeneration.current; ++saveGeneration.current; window.removeEventListener('focus', onFocus); window.removeEventListener('pageshow', onFocus) }
  }, [read, verifyCurrentSession])

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialogVisible && dialog && !dialog.open) { dialog.showModal?.(); dialogActionRef.current?.focus() }
    if (!dialogVisible && dialog?.open) dialog.close()
  }, [dialogVisible])

  useEffect(() => {
    const dialog = conflictDialogRef.current
    if (conflict && dialog && !dialog.open) {
      if (dialog.showModal) dialog.showModal()
      else dialog.setAttribute('open', '')
      conflictActionRef.current?.focus()
    }
    if (!conflict && dialog?.open) {
      if (dialog.close) dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [conflict])

  async function searchPage(query: string, cursor?: string) {
    const normalized = query.normalize('NFKC').trim().toLowerCase()
    const captured = ++searchGeneration.current
    if (!normalized) { setSearch(emptySearch); return }
    setSearch((previous) => ({ query: normalized, modules: cursor ? previous.modules : [], cursor: cursor ?? null, status: 'loading' }))
    try {
      const page = await services.callables.invoke('searchMentorModules', { query: normalized, ...(cursor ? { cursor } : {}) })
      if (captured !== searchGeneration.current) return
      setSearch((previous) => ({ query: normalized, modules: [...new Map([...(cursor ? previous.modules : []), ...page.modules].map((module) => [module.id, module])).values()], cursor: page.nextCursor, status: 'ready' }))
    } catch (error) {
      if (captured === searchGeneration.current) {
        if (isProtectedDenial(error)) clearForAccessLoss()
        else setSearch((previous) => ({ ...previous, status: 'error' }))
      }
    }
  }

  function changeDraft(nextBiography: string, nextIds: string[]) {
    ++attemptGeneration.current
    setAttempt(null); setMessage(''); setBiography(nextBiography); setModuleIds(nextIds)
  }

  function enterEdit() { setMode('edit'); setMessage(''); setTimeout(() => editHeadingRef.current?.focus(), 0) }
  function cancelEdit() {
    if (dirty) { setDiscardOpen(true); return }
    setMode('saved'); editButtonRef.current?.focus()
  }
  function closeDiscard(discard: boolean) {
    if (saving) return
    setDiscardOpen(false)
    if (discard) {
      if (blocker.state === 'blocked') blocker.proceed()
      else { setBiography(confirmed?.profile.biography ?? ''); setModuleIds(confirmed?.profile.moduleIds ?? []); setMode('saved'); setAttempt(null); editButtonRef.current?.focus() }
    } else if (blocker.state === 'blocked') blocker.reset()
  }

  async function save(retry = false) {
    if (!confirmed || saving || !biographyValid || moduleIds.length > 30 || (!metadataHealthy && modulesChanged)) return
    const captured = ++attemptGeneration.current
    setSaving(true); setMessage('Checking your current profile…')
    try {
      const session = await services.session.getCurrent()
      if (captured !== attemptGeneration.current) return
      if (session.user?.id !== uid || session.user.role !== 'MENTOR' || session.user.status !== 'ACTIVE') {
        clearForAccessLoss(); return
      }
      if (!retry || !attempt) {
        const latest = await services.callables.invoke('readOwnMentorProfile', {})
        if (captured !== attemptGeneration.current) return
        if (latest.kind !== 'ready') { setConfirmed(null); setBiography(''); setModuleIds([]); setStatus(latest.kind); setMode('saved'); setMessage('Your profile is no longer available.'); return }
        if (!sameVersion(latest.profile.version, confirmed.profile.version)) { setConflict(latest); setMessage('Your profile changed elsewhere. Review the latest version.'); return }
      }
      const activeAttempt = retry && attempt ? attempt : { input: { requestId: crypto.randomUUID(), baseline: confirmed.profile.version, biography: biography.trim(), moduleIds } }
      setAttempt(activeAttempt)
      const outcome = activeAttempt.receipt ?? await services.callables.invoke('updateOwnMentorProfile', activeAttempt.input)
      if (captured !== attemptGeneration.current) return
      if (outcome.kind === 'rejected') {
        if (outcome.reason === 'CONFLICT') {
          const refreshed = await services.callables.invoke('readOwnMentorProfile', {})
          if (captured === attemptGeneration.current && refreshed.kind === 'ready') setConflict(refreshed)
          setMessage('Your profile changed elsewhere. Review the latest version.')
        } else setMessage('One or more selected modules are no longer eligible. Review your selection.')
        setAttempt(null); return
      }
      setAttempt({ ...activeAttempt, receipt: outcome })
      const verification = await services.callables.invoke('readOwnMentorProfile', {})
      if (captured !== attemptGeneration.current) return
      if (verification.kind === 'ready' && verification.profile.version.revision === outcome.stored.revision && verification.profile.biography === outcome.stored.biography && equalIds(verification.profile.moduleIds, outcome.stored.moduleIds)) {
        setConfirmed(verification); setBiography(verification.profile.biography); setModuleIds(verification.profile.moduleIds); setMode('saved'); setAttempt(null); setConflict(null); setMessage('Profile saved.')
      } else if (verification.kind === 'ready') { setConflict(verification); setMessage('A newer profile is available. Review it before saving again.') }
      else setMessage('Save may have completed; retry confirmation.')
    } catch (error) {
      if (captured === attemptGeneration.current) {
        if (isFailedPrecondition(error)) await read()
        else if (isProtectedDenial(error)) clearForAccessLoss()
        else setMessage('Save may have completed; retry with the same request.')
      }
    } finally { if (captured === attemptGeneration.current) setSaving(false) }
  }

  function resolveConflict(reapply: boolean) {
    if (!conflict) return
    setConfirmed(conflict); setConflict(null); setAttempt(null); ++attemptGeneration.current
    if (!reapply) { setBiography(conflict.profile.biography); setModuleIds(conflict.profile.moduleIds); setMode('saved') }
    setMessage(reapply ? 'Review your draft against the latest profile, then save again.' : 'Latest profile loaded.')
    setTimeout(() => { if (reapply) editHeadingRef.current?.focus(); else editButtonRef.current?.focus() }, 0)
  }

  const savedLabels = confirmed?.metadata.kind === 'ready' ? new Map(confirmed.metadata.modules.map((module) => [module.id, module])) : new Map()
  return <section className="mentor-profile">
    <header className="mentor-profile-header">
      <div><span className="mentor-profile-eyebrow">MENTOR SPACE</span><h1>My Profile</h1><p>Your biography and supported modules are visible to Students in mentor discovery.</p></div>
      {status === 'ready' && confirmed && mode === 'saved' && <button ref={editButtonRef} className="button button-primary" onClick={enterEdit}>Edit profile</button>}
    </header>
    {message && <p className={`mentor-profile-feedback${/could not|unavailable|changed elsewhere|no longer|may have|eligible|access changed|must be/iu.test(message) ? ' mentor-profile-feedback-error' : ''}`} role="status" aria-live="polite">{message}</p>}
    {status === 'loading' && <div className="mentor-profile-card mentor-profile-state" role="status">Loading your profile…</div>}
    {status === 'error' && <div className="mentor-profile-card mentor-profile-state" role="alert"><p>We could not load your profile.</p><button className="button button-secondary" onClick={() => void read()}>Try again</button></div>}
    {['missing', 'inactive', 'invalid'].includes(status) && <div className="mentor-profile-card mentor-profile-state" role="alert"><h2>Profile unavailable</h2><p>Your Mentor profile cannot be edited. Contact your administrator or HelpiNUS support.</p></div>}
    {status === 'ready' && confirmed && <>
      <section className="mentor-profile-card mentor-profile-identity" aria-label="Mentor identity"><span className="mentor-profile-avatar" aria-hidden="true">{confirmed.profile.displayName.trim().slice(0, 1).toUpperCase() || 'M'}</span><div><span className="mentor-profile-role">Mentor</span><h2>{confirmed.profile.displayName}</h2><p>Your display name is managed with your account.</p></div></section>
      {mode === 'saved' ? <div className="mentor-profile-sections">
        <section className="mentor-profile-card"><div className="mentor-profile-section-heading"><h3>Biography</h3><p>Introduce yourself to Students</p></div><p className={confirmed.profile.biography ? 'mentor-profile-bio' : 'mentor-profile-empty'}>{confirmed.profile.biography || 'No biography provided'}</p></section>
        <section className="mentor-profile-card" aria-labelledby="mentor-modules-title"><div className="mentor-profile-section-heading"><h3 id="mentor-modules-title">Supported modules</h3><p>Modules you can help with</p></div>
          {confirmed.profile.moduleIds.length === 0 ? <p className="mentor-profile-empty">No modules listed</p> : <ul className="mentor-profile-module-list">{confirmed.profile.moduleIds.map((id) => { const item = savedLabels.get(id); return <li key={id} className={`mentor-profile-module${item?.state === 'inactive' ? ' is-inactive' : item?.state === 'missing' || !item ? ' is-unavailable' : ''}`}>{item && item.state !== 'missing' ? `${item.code} — ${item.title}${item.state === 'inactive' ? ' (Inactive)' : ''}` : `Module information unavailable (${id})`}</li> })}</ul>}
          {confirmed.metadata.kind === 'unavailable' && <p className="mentor-profile-inline-alert" role="alert">Module information is unavailable. <button className="mentor-profile-text-button" onClick={() => void read(true)}>Retry module information</button></p>}
        </section>
      </div> : <>
        <h2 className="mentor-profile-edit-heading" ref={editHeadingRef} tabIndex={-1}>Edit your profile</h2>
        <section className="mentor-profile-card mentor-profile-edit-card" aria-labelledby="mentor-edit-bio-title"><div className="mentor-profile-section-heading"><h3 id="mentor-edit-bio-title">About you</h3><p>Tell Students about your experience and approach</p></div>
          <label htmlFor="mentor-bio">Biography</label><textarea id="mentor-bio" value={biography} onChange={(event) => changeDraft(event.target.value, moduleIds)} disabled={saving} maxLength={1001} aria-invalid={!biographyValid} aria-describedby="mentor-bio-help" /><p id="mentor-bio-help" className={`mentor-profile-counter${!biographyValid ? ' is-invalid' : ''}`}>{!biographyValid ? 'Biography must be at most 1,000 characters.' : `${biography.trim().length} of 1,000 characters`}</p>
        </section>
        <section className="mentor-profile-card mentor-profile-edit-card" aria-labelledby="mentor-edit-modules-title"><div className="mentor-profile-section-heading"><h3 id="mentor-edit-modules-title">Supported modules</h3><p>Choose up to 30 modules</p></div>
          <h4>Selected modules ({moduleIds.length}/30)</h4>{moduleIds.length >= 30 && <p role="status">All 30 module slots are filled. Remove one to add another.</p>}{moduleIds.length === 0 && <p className="mentor-profile-empty">No modules selected</p>}
          <ul className="mentor-profile-selected">{moduleIds.map((id) => { const item = savedLabels.get(id) ?? search.modules.find((module) => module.id === id); return <li key={id}><span>{item && 'code' in item ? `${item.code} — ${item.title}` : `Module information unavailable (${id})`}</span><button disabled={saving || !metadataHealthy} onClick={() => changeDraft(biography, moduleIds.filter((value) => value !== id))} aria-label={`Remove ${id}`}>Remove</button></li> })}</ul>
          {confirmed.metadata.kind === 'unavailable' && <p className="mentor-profile-inline-alert" role="alert">Module information is unavailable. Module changes are paused. <button className="mentor-profile-text-button" onClick={() => void read(true)}>Retry</button></p>}
          <label htmlFor="mentor-module-query">Find modules by code or title prefix</label><input id="mentor-module-query" type="search" value={search.query} onChange={(event) => { const query = event.target.value; setSearch({ ...emptySearch, query }); void searchPage(query) }} disabled={saving || confirmed.metadata.kind !== 'ready'} />
          {search.status === 'loading' && <p className="mentor-profile-search-note" role="status">Searching modules…</p>}{search.status === 'error' && <p className="mentor-profile-inline-alert" role="alert">Module search is unavailable. <button className="mentor-profile-text-button" onClick={() => void searchPage(search.query, search.cursor ?? undefined)}>Retry search</button></p>}
          {search.status === 'ready' && <>{search.modules.length === 0 && <p className="mentor-profile-empty">No matches</p>}<ul className="mentor-profile-results">{search.modules.map((item) => <li key={item.id}><span><strong>{item.code}</strong><small>{item.title}</small></span><button className="button button-secondary" disabled={saving || !metadataHealthy || moduleIds.includes(item.id) || moduleIds.length >= 30} onClick={() => changeDraft(biography, [...moduleIds, item.id])}>{moduleIds.includes(item.id) ? 'Selected' : `Add ${item.code}`}</button></li>)}</ul>{search.cursor && <button className="button button-secondary mentor-profile-more" onClick={() => void searchPage(search.query, search.cursor!)}>Load more</button>}</>}
        </section>
        <div className="mentor-profile-actions"><button className="button button-primary" disabled={!dirty || !biographyValid || moduleIds.length > 30 || (!metadataHealthy && modulesChanged) || saving} onClick={() => void save(Boolean(attempt))}>{saving ? 'Saving…' : attempt ? 'Retry save or confirmation' : 'Save profile'}</button><button className="button button-secondary" disabled={saving} onClick={cancelEdit}>Cancel</button></div>
      </>}
      {conflict && <dialog ref={conflictDialogRef} className="mentor-profile-dialog" aria-labelledby="mentor-conflict-title" onCancel={(event) => event.preventDefault()}><h2 id="mentor-conflict-title">Profile changed elsewhere</h2><p>Review the latest version before continuing.</p><div className="mentor-profile-conflict-copy"><div><p>Latest biography: {conflict.profile.biography || 'No biography provided'}</p></div><div><p>Your draft: {biography || 'No biography provided'}</p></div></div><div className="mentor-profile-dialog-actions"><button className="button button-secondary" onClick={() => resolveConflict(false)}>Discard draft and show latest</button><button ref={conflictActionRef} className="button button-primary" onClick={() => resolveConflict(true)}>Reapply my draft</button></div></dialog>}
    </>}
    <dialog ref={dialogRef} className="mentor-profile-dialog" onCancel={(event) => { event.preventDefault(); closeDiscard(false) }} aria-labelledby="mentor-discard-title"><h2 id="mentor-discard-title">Discard unsaved changes?</h2><p>{saving ? 'Please wait for the save to finish.' : 'Your edits will be lost.'}</p><div className="mentor-profile-dialog-actions"><button ref={dialogActionRef} className="button button-secondary" onClick={() => closeDiscard(false)}>Keep editing</button><button className="button button-primary" disabled={saving} onClick={() => closeDiscard(true)}>Discard changes</button></div></dialog>
  </section>
}
