import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DiscoverMentorsOutput, Module } from '@helpinus/shared'
import { useServices } from '../services/useServices'
import type { HelpiNUSServices } from '../services/contracts'

type Mentor = DiscoverMentorsOutput['mentors'][number]
type PageStatus = 'loading' | 'ready' | 'error'
type MetadataEntry = { status: 'pending' } | { status: 'failed' } | { status: 'ready'; value: Module | null }
type DialogContext = { mentorName: string; moduleName: string | null; mentorId: string }

const PAGE_SIZE = 20
const serviceKeys = new WeakMap<HelpiNUSServices, number>()
let nextServiceKey = 0

function normalized(value: string) { return value.trim().toLocaleLowerCase() }

export function MentorDiscoveryPage() {
  const { services, session } = useServices()
  const sessionId = session?.user?.id ?? null
  let serviceKey = serviceKeys.get(services)
  if (serviceKey === undefined) {
    serviceKey = ++nextServiceKey
    serviceKeys.set(services, serviceKey)
  }
  return <MentorDiscoveryContent key={JSON.stringify([serviceKey, sessionId])} services={services} sessionId={sessionId} />
}

function MentorDiscoveryContent({ services, sessionId }: { services: HelpiNUSServices; sessionId: string | null }) {
  const [mentors, setMentors] = useState<Mentor[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [initialStatus, setInitialStatus] = useState<PageStatus>('loading')
  const [nextStatus, setNextStatus] = useState<PageStatus>('ready')
  const [query, setQuery] = useState('')
  const [selectedModuleId, setSelectedModuleId] = useState('')
  const [expandedMentorId, setExpandedMentorId] = useState<string | null>(null)
  const [dialogContext, setDialogContext] = useState<DialogContext | null>(null)
  const [moduleEntries, setModuleEntries] = useState<Map<string, MetadataEntry>>(() => new Map())
  const generationRef = useRef(0)
  const mentorsRef = useRef<Mentor[]>([])
  const cursorRef = useRef<string | null>(null)
  const pagePendingRef = useRef(false)
  const metadataRef = useRef(new Map<string, MetadataEntry>())
  const initialPromiseRef = useRef<{ services: HelpiNUSServices; sessionId: string | null; promise: Promise<DiscoverMentorsOutput> } | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  function publishModules() { setModuleEntries(new Map(metadataRef.current)) }

  function resolveModules(records: Mentor[], generation: number) {
    const ids = [...new Set(records.flatMap((mentor) => mentor.moduleIds))].filter((id) => !metadataRef.current.has(id))
    if (!ids.length) return
    for (const id of ids) metadataRef.current.set(id, { status: 'pending' })
    publishModules()
    void Promise.allSettled(ids.map((id) => services.modules.getById(id))).then((results) => {
      if (generationRef.current !== generation) return
      results.forEach((result, index) => {
        metadataRef.current.set(ids[index], result.status === 'fulfilled'
          ? { status: 'ready', value: result.value }
          : { status: 'failed' })
      })
      publishModules()
    })
  }

  function acceptPage(page: DiscoverMentorsOutput, requestedCursor: string | undefined, generation: number) {
    if (requestedCursor !== undefined && page.nextCursor === requestedCursor) throw new Error('Cursor did not advance')
    const known = new Set(mentorsRef.current.map((mentor) => mentor.userId))
    const additions = page.mentors.filter((mentor) => {
      if (known.has(mentor.userId)) return false
      known.add(mentor.userId)
      return true
    })
    const combined = [...mentorsRef.current, ...additions]
    mentorsRef.current = combined
    cursorRef.current = page.nextCursor
    setMentors(combined)
    setCursor(page.nextCursor)
    setInitialStatus('ready')
    setNextStatus('ready')
    resolveModules(additions, generation)
  }

  function requestPage(requestedCursor?: string) {
    if (pagePendingRef.current) return
    if (requestedCursor !== undefined && cursorRef.current !== requestedCursor) return
    pagePendingRef.current = true
    const generation = generationRef.current
    if (requestedCursor === undefined) setInitialStatus('loading')
    else setNextStatus('loading')
    void services.callables.invoke('discoverMentors', requestedCursor === undefined
      ? { limit: PAGE_SIZE }
      : { cursor: requestedCursor, limit: PAGE_SIZE }).then((page) => {
      if (generationRef.current !== generation) return
      acceptPage(page, requestedCursor, generation)
    }).catch(() => {
      if (generationRef.current !== generation) return
      if (requestedCursor === undefined) setInitialStatus('error')
      else setNextStatus('error')
    }).finally(() => {
      if (generationRef.current === generation) pagePendingRef.current = false
    })
  }

  useEffect(() => {
    const generation = ++generationRef.current
    const currentGenerationRef = generationRef
    mentorsRef.current = []
    cursorRef.current = null
    metadataRef.current = new Map()
    pagePendingRef.current = true
    queueMicrotask(() => {
      if (generationRef.current !== generation) return
      setMentors([])
      setCursor(null)
      setInitialStatus('loading')
      setNextStatus('ready')
      setModuleEntries(new Map())
      setQuery('')
      setSelectedModuleId('')
      setExpandedMentorId(null)
      setDialogContext(null)
      if (dialogRef.current?.open) {
        if (typeof dialogRef.current.close === 'function') dialogRef.current.close()
        else dialogRef.current.removeAttribute('open')
      }
    })

    const previous = initialPromiseRef.current
    const promise = previous?.services === services && previous.sessionId === sessionId
      ? previous.promise
      : services.callables.invoke('discoverMentors', { limit: PAGE_SIZE })
    initialPromiseRef.current = { services, sessionId, promise }
    void promise.then((page) => {
      if (generationRef.current !== generation) return
      try { acceptPage(page, undefined, generation) }
      catch { setInitialStatus('error') }
    }).catch(() => {
      if (generationRef.current === generation) setInitialStatus('error')
    }).finally(() => {
      if (generationRef.current !== generation) return
      pagePendingRef.current = false
      if (initialPromiseRef.current?.promise === promise) initialPromiseRef.current = null
    })
    return () => { if (currentGenerationRef.current === generation) currentGenerationRef.current++ }
  // The page request is owned by service/session identity; changing render-local callbacks must not restart it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, sessionId])

  const referencedIds = useMemo(() => [...new Set(mentors.flatMap((mentor) => mentor.moduleIds))], [mentors])
  const pendingIds = referencedIds.filter((id) => moduleEntries.get(id)?.status === 'pending')
  const failedIds = referencedIds.filter((id) => moduleEntries.get(id)?.status === 'failed')
  const metadataReady = pendingIds.length === 0 && failedIds.length === 0 && referencedIds.every((id) => moduleEntries.get(id)?.status === 'ready')
  const choices = referencedIds.flatMap((id) => {
    const entry = moduleEntries.get(id)
    return entry?.status === 'ready' && entry.value?.active ? [entry.value] : []
  }).sort((a, b) => a.code.localeCompare(b.code) || a.title.localeCompare(b.title))
  const selectedModule = moduleEntries.get(selectedModuleId)
  const selectedModuleName = selectedModule?.status === 'ready' && selectedModule.value
    ? `${selectedModule.value.code} — ${selectedModule.value.title}` : null
  const needle = normalized(query)
  const visibleMentors = mentors.filter((mentor) => {
    if (selectedModuleId && !mentor.moduleIds.includes(selectedModuleId)) return false
    if (!needle) return true
    if (normalized(mentor.displayName).includes(needle) || normalized(mentor.biography).includes(needle)) return true
    return metadataReady && mentor.moduleIds.some((id) => {
      const entry = moduleEntries.get(id)
      return entry?.status === 'ready' && entry.value !== null
        && (normalized(entry.value.code).includes(needle) || normalized(entry.value.title).includes(needle))
    })
  })
  const resultAnnouncement = initialStatus !== 'ready' ? ''
    : mentors.length === 0 ? (cursor === null ? 'No mentors are available.' : 'No Mentor records have loaded yet; use Load more to continue.')
      : visibleMentors.length === 0 ? (cursor ? 'No matches among loaded mentors. Load more to continue.' : 'No loaded Mentors match the current search or module filter.')
        : ''

  useEffect(() => {
    if (expandedMentorId && !visibleMentors.some((mentor) => mentor.userId === expandedMentorId)) {
      queueMicrotask(() => setExpandedMentorId((current) => current === expandedMentorId ? null : current))
    }
  }, [expandedMentorId, visibleMentors])

  function retryMetadata() {
    const ids = failedIds.filter((id) => metadataRef.current.get(id)?.status === 'failed')
    if (!ids.length) return
    const generation = generationRef.current
    ids.forEach((id) => metadataRef.current.set(id, { status: 'pending' }))
    publishModules()
    void Promise.allSettled(ids.map((id) => services.modules.getById(id))).then((results) => {
      if (generationRef.current !== generation) return
      results.forEach((result, index) => metadataRef.current.set(ids[index], result.status === 'fulfilled'
        ? { status: 'ready', value: result.value }
        : { status: 'failed' }))
      publishModules()
    })
  }

  function closeDialog() {
    if (dialogRef.current?.open) {
      if (typeof dialogRef.current.close === 'function') dialogRef.current.close()
      else dialogRef.current.removeAttribute('open')
    }
    setDialogContext(null)
    queueMicrotask(() => {
      const fallback = document.getElementById(`mentor-toggle-${dialogContext?.mentorId}`)
      if (triggerRef.current?.isConnected) triggerRef.current.focus()
      else if (fallback?.isConnected) fallback.focus()
      else document.querySelector<HTMLInputElement>('.mentor-controls input[type="search"]')?.focus()
    })
  }

  useEffect(() => {
    if (!dialogContext || !dialogRef.current) return
    if (typeof dialogRef.current.showModal === 'function') dialogRef.current.showModal()
    else dialogRef.current.setAttribute('open', '')
    dialogRef.current.querySelector<HTMLButtonElement>('button')?.focus()
  }, [dialogContext])

  return <section className="mentor-discovery">
    <div className="page-heading"><h1>Find a mentor</h1><p>Browse available Mentors and explore the modules they support.</p></div>
    <p className="mentor-announcement" role="status" aria-label="Mentor results" aria-live="polite" aria-atomic="true">{resultAnnouncement}</p>
    {initialStatus === 'loading' && <p role="status" aria-label="Loading mentors">Loading mentors…</p>}
    {initialStatus === 'error' && <div className="mentor-state" role="alert"><h2>Mentors are unavailable</h2><p>We could not load the Mentor list. Check your connection and try again.</p><button className="button button-secondary" onClick={() => requestPage()}>Retry</button></div>}
    {initialStatus === 'ready' && <>
      <div className="mentor-controls">
        <label>Search loaded mentors<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, biography or module" /></label>
        <label>Academic module<select value={selectedModuleId} disabled={!metadataReady || choices.length === 0} onChange={(event) => setSelectedModuleId(event.target.value)}>
          <option value="">All modules</option>
          {choices.map((module) => <option key={module.id} value={module.id}>{module.code} — {module.title}</option>)}
        </select></label>
        {selectedModuleId && <button className="button button-secondary" onClick={() => setSelectedModuleId('')}>Clear module</button>}
      </div>
      <p className="mentor-scope">Search and filters cover loaded mentors only.{cursor && ' Load more to see additional Mentors.'}</p>
      {pendingIds.length > 0 && <p role="status">Module information is loading. Search currently covers names and biographies only.</p>}
      {failedIds.length > 0 && <div role="alert" className="mentor-notice"><p>Some module information is unavailable. Search currently covers names and biographies only. You can retry module information.</p><button className="button button-secondary" onClick={retryMetadata}>Retry module information</button></div>}
      {metadataReady && mentors.length > 0 && choices.length === 0 && <p>No active supported modules are available for filtering.</p>}
      {mentors.length === 0 && cursor === null && <div className="mentor-state"><h2>No mentors available</h2><p>There are no available Mentors to show right now.</p></div>}
      {mentors.length === 0 && cursor !== null && <p>No mentors loaded yet. Load more to continue.</p>}
      {mentors.length > 0 && visibleMentors.length === 0 && <div className="mentor-state"><p>{cursor ? 'No matches among loaded mentors.' : 'No mentors match your search or module filter.'}</p>{(query || selectedModuleId) && <button className="button button-secondary" onClick={() => { setQuery(''); setSelectedModuleId('') }}>Clear search and filters</button>}</div>}
      {visibleMentors.length > 0 && <ul className="mentor-list">{visibleMentors.map((mentor) => {
        const expanded = expandedMentorId === mentor.userId
        const regionId = `mentor-details-${mentor.userId}`
        return <li key={mentor.userId} className="mentor-card"><div className="mentor-card-top"><div><h2>{mentor.displayName}</h2><p>Mentor</p></div><button id={`mentor-toggle-${mentor.userId}`} className="button button-secondary" aria-expanded={expanded} aria-controls={regionId} onClick={() => setExpandedMentorId(expanded ? null : mentor.userId)}>{expanded ? 'Hide details' : 'View details'}</button></div>
          {expanded && <section id={regionId} role="region" aria-label={`${mentor.displayName} details`} className="mentor-details">
            {mentor.biography && <p>{mentor.biography}</p>}
            <h3>Supported modules</h3>
            {mentor.moduleIds.length === 0 ? <p>No modules listed</p> : <ul>{mentor.moduleIds.map((id) => {
              const entry = moduleEntries.get(id)
              const module = entry?.status === 'ready' ? entry.value : null
              return <li key={id}>{module ? <>{module.code} — {module.title}{!module.active && ' (Inactive)'}</> : 'Module information unavailable'}</li>
            })}</ul>}
            <button className="button button-primary" onClick={(event) => { triggerRef.current = event.currentTarget; setDialogContext({ mentorId: mentor.userId, mentorName: mentor.displayName, moduleName: selectedModuleName }) }}>Ask for help</button>
          </section>}
        </li>
      })}</ul>}
      {nextStatus === 'loading' && <p role="status">Loading more mentors…</p>}
      {nextStatus === 'error' && <div className="mentor-notice" role="alert"><p>We could not load more Mentors. Your loaded Mentors are still here.</p><button className="button button-secondary" onClick={() => requestPage(cursor ?? undefined)}>Retry</button></div>}
      {cursor !== null && nextStatus !== 'error' && <button className="button button-secondary mentor-more" disabled={nextStatus === 'loading'} onClick={() => requestPage(cursor)}>Load more</button>}
    </>}
    <dialog ref={dialogRef} aria-label="Ask for help" onCancel={(event) => { event.preventDefault(); closeDialog() }} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeDialog() }
      if (event.key === 'Tab') {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
        const first = controls?.[0]
        const last = controls?.[controls.length - 1]
        if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus() }
      }
    }} className="mentor-dialog">
      {dialogContext && <><h2>Ask {dialogContext.mentorName} for help</h2>{dialogContext.moduleName && <p>Selected module: {dialogContext.moduleName}</p>}<p>Choose a supported module and describe your question on the next page.</p><div className="mentor-dialog-actions"><Link className="button button-primary" to={`/student/mentors/${encodeURIComponent(dialogContext.mentorId)}/request${selectedModuleId ? `?moduleId=${encodeURIComponent(selectedModuleId)}` : ''}`} state={{ mentorName: dialogContext.mentorName }} onClick={closeDialog}>Request help</Link><button className="button button-secondary" onClick={closeDialog}>Close</button></div></>}
    </dialog>
  </section>
}
