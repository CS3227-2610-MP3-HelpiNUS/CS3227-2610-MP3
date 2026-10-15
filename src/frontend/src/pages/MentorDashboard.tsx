import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ReadOwnMentorProfileOutput } from '@helpinus/shared'
import type { HelpiNUSServices } from '../services/contracts'
import { useServices } from '../services/useServices'
import './MentorDashboard.css'

type Ready = Extract<ReadOwnMentorProfileOutput, { kind: 'ready' }>
type View = { kind: 'loading' | 'error' | 'sessionError' | 'unavailable' | 'accessLost' } | { kind: 'ready'; result: Ready; refreshing: boolean; metadataFailed: boolean }
const serviceKeys = new WeakMap<HelpiNUSServices, number>()
let nextServiceKey = 0

function excerpt(value: string) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  const points = Array.from(normalized)
  if (points.length <= 180) return normalized
  const prefix = points.slice(0, 180).join('')
  const lastSpace = prefix.lastIndexOf(' ')
  return `${lastSpace > 0 ? prefix.slice(0, lastSpace) : prefix}…`
}

function moduleSummary(result: Ready) {
  if (result.metadata.kind !== 'ready') return null
  const byId = new Map(result.metadata.modules.map((module) => [module.id, module]))
  const active: string[] = []
  let review = 0
  let unknown = 0
  for (const id of new Set(result.profile.moduleIds)) {
    const module = byId.get(id)
    if (!module) unknown++
    else if (module.state === 'active') active.push(`${module.code} — ${module.title}`)
    else review++
  }
  return { active, review, unknown }
}

const protectedDenial = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && /(?:^|\/)(?:unauthenticated|permission-denied|failed-precondition)$/u.test(String(error.code))

export function MentorDashboard() {
  const { services, session, refreshSession } = useServices()
  let serviceKey = serviceKeys.get(services)
  if (serviceKey === undefined) { serviceKey = ++nextServiceKey; serviceKeys.set(services, serviceKey) }
  const user = session?.user
  return <MentorDashboardContent key={`${serviceKey}:${user?.id ?? ''}:${user?.role ?? ''}:${user?.status ?? ''}`} services={services} uid={user?.id ?? null} refreshSession={refreshSession} />
}

function MentorDashboardContent({ services, uid, refreshSession }: { services: HelpiNUSServices; uid: string | null; refreshSession: () => Promise<void> }) {
  const navigate = useNavigate()
  const location = useLocation()
  const deniedUid = (location.state as { f03AccessDenied?: unknown } | null)?.f03AccessDenied
  const denied = typeof deniedUid === 'string' && deniedUid === uid
  const [view, setView] = useState<View>(denied ? { kind: 'accessLost' } : { kind: 'loading' })
  const generation = useRef(0)
  const mounted = useRef(false)

  const markAccessLost = useCallback(async () => {
    ++generation.current
    setView({ kind: 'accessLost' })
    // The marker must be committed before refreshSession can unmount the guarded route.
    await Promise.resolve(navigate(location.pathname, { replace: true, state: { f03AccessDenied: uid } }))
    await refreshSession()
  }, [location.pathname, navigate, refreshSession, uid])

  const read = useCallback(async (preserveReady = false) => {
    const request = ++generation.current
    const previous = preserveReady && view.kind === 'ready' ? view.result : null
    if (previous) setView({ kind: 'ready', result: previous, refreshing: true, metadataFailed: true })
    else setView({ kind: 'loading' })
    try {
      const current = await services.session.getCurrent()
      if (!mounted.current || request !== generation.current) return
      if (current.user?.id !== uid || current.user.role !== 'MENTOR' || current.user.status !== 'ACTIVE') {
        setView({ kind: 'accessLost' })
        await refreshSession()
        return
      }
    } catch {
      if (mounted.current && request === generation.current) setView({ kind: 'sessionError' })
      return
    }
    try {
      const result = await services.callables.invoke('readOwnMentorProfile', {})
      if (!mounted.current || request !== generation.current) return
      setView(result.kind === 'ready' ? { kind: 'ready', result, refreshing: false, metadataFailed: false } : { kind: 'unavailable' })
    } catch (error) {
      if (!mounted.current || request !== generation.current) return
      if (protectedDenial(error)) await markAccessLost()
      else if (previous) setView({ kind: 'ready', result: previous, refreshing: false, metadataFailed: true })
      else setView({ kind: 'error' })
    }
  }, [markAccessLost, refreshSession, services, uid, view])

  useEffect(() => {
    mounted.current = true
    let active = true
    const currentGeneration = generation
    queueMicrotask(() => { if (active && !denied) void read() })
    return () => { active = false; mounted.current = false; ++currentGeneration.current }
    // Entry alone starts the read. Retries call read directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function retryDenied() {
    ++generation.current
    setView({ kind: 'loading' })
    await Promise.resolve(navigate(location.pathname, { replace: true, state: null }))
    if (mounted.current) void read()
  }

  const profile = view.kind === 'ready' ? view.result.profile : null
  const bio = profile ? excerpt(profile.biography) : ''
  const summary = view.kind === 'ready' ? moduleSummary(view.result) : null
  return <section className="mentor-dashboard">
    <header className="mentor-dashboard-header">
      <div><span className="mentor-dashboard-eyebrow">MENTOR SPACE</span><h1>Welcome to your Mentor space</h1><p>Review the profile Students can see when they find a mentor.</p></div>
      <Link className="button button-primary mentor-dashboard-primary" to="/mentor/profile">My profile</Link>
    </header>
    <section className="mentor-dashboard-card" aria-labelledby="mentor-dashboard-profile-title">
      <h2 id="mentor-dashboard-profile-title">Your profile</h2>
      <p className="mentor-dashboard-intro">A quick view of your Student-visible profile.</p>
      {view.kind === 'loading' && <p role="status">Loading your profile…</p>}
      {view.kind === 'error' && <div role="alert"><p>We could not load your profile.</p><button className="button button-secondary" onClick={() => void read()}>Try again</button></div>}
      {view.kind === 'sessionError' && <div role="alert"><p>We could not check your account access.</p><button className="button button-secondary" onClick={() => void read()}>Try again</button></div>}
      {view.kind === 'accessLost' && <div role="alert"><p>Your account access may have changed. Check your account or contact your administrator or HelpiNUS support.</p><button className="button button-secondary" onClick={() => void retryDenied()}>Try again</button></div>}
      {view.kind === 'unavailable' && <div role="alert"><p><strong>Profile unavailable</strong></p><p>Your Mentor profile cannot be edited. Contact your administrator or HelpiNUS support.</p></div>}
      {profile && view.kind === 'ready' && <div className="mentor-dashboard-details">
        <p className="mentor-dashboard-name">{profile.displayName}</p>
        <div><h3>Biography</h3><p>{bio || 'No biography provided'}</p></div>
        <div><h3>Supported modules</h3>
          {profile.moduleIds.length === 0 ? <p>No modules listed</p> : view.result.metadata.kind === 'unavailable' || view.metadataFailed || view.refreshing ? <p>{profile.moduleIds.length} saved modules; module information unavailable</p> : <>
            {summary && summary.active.length > 0 ? <ul>{summary.active.slice(0, 3).map((label) => <li key={label}>{label}</li>)}</ul> : <p>No active modules available to preview</p>}
            {summary && summary.active.length > 3 && <p>+{summary.active.length - 3} more active modules</p>}
            {summary && summary.review > 0 && <p>{summary.review} module references need review</p>}
            {summary && summary.unknown > 0 && <p>{summary.unknown} module details unavailable</p>}
          </>}
          {(view.result.metadata.kind === 'unavailable' || view.metadataFailed || view.refreshing) && <div role="alert"><p>{view.refreshing ? 'Refreshing module information…' : 'Module information is unavailable.'}</p><button className="button button-secondary" onClick={() => void read(true)}>Retry module information</button></div>}
        </div>
        {(!bio || profile.moduleIds.length === 0) && <Link className="mentor-dashboard-complete" to="/mentor/profile">Complete your profile</Link>}
      </div>}
    </section>
  </section>
}
