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

function initials(value: string) {
  return value.trim().split(/\s+/u).slice(0, 2).map((part) => Array.from(part)[0]?.toLocaleUpperCase() ?? '').join('') || 'M'
}

function moduleSummary(result: Ready) {
  if (result.metadata.kind !== 'ready') return null
  const byId = new Map(result.metadata.modules.map((module) => [module.id, module]))
  const active: { id: string; label: string }[] = []
  let review = 0
  let unknown = 0
  for (const id of new Set(result.profile.moduleIds)) {
    const module = byId.get(id)
    if (!module) unknown++
    else if (module.state === 'active') active.push({ id, label: `${module.code} — ${module.title}` })
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
      <div className="mentor-dashboard-welcome">
        <span className="mentor-dashboard-eyebrow">MENTOR SPACE</span>
        <h1>Welcome to your Mentor space</h1>
        <p>Review the profile Students can see when they find a mentor.</p>
      </div>
      <Link className="button button-primary mentor-dashboard-primary" to="/mentor/profile">My profile</Link>
    </header>
    <section className="mentor-dashboard-card" aria-labelledby="mentor-dashboard-profile-title">
      <div className="mentor-dashboard-card-heading">
        <h2 id="mentor-dashboard-profile-title">Your profile</h2>
        <p>A quick view of your Student-visible profile.</p>
      </div>
      {view.kind === 'loading' && <p className="mentor-dashboard-message mentor-dashboard-loading" role="status">Loading your profile…</p>}
      {view.kind === 'error' && <div className="mentor-dashboard-message mentor-dashboard-error" role="alert"><p>We could not load your profile.</p><button className="button button-secondary" onClick={() => void read()}>Try again</button></div>}
      {view.kind === 'sessionError' && <div className="mentor-dashboard-message mentor-dashboard-error" role="alert"><p>We could not check your account access.</p><button className="button button-secondary" onClick={() => void read()}>Try again</button></div>}
      {view.kind === 'accessLost' && <div className="mentor-dashboard-message mentor-dashboard-error" role="alert"><p>Your account access may have changed. Check your account or contact your administrator or HelpiNUS support.</p><button className="button button-secondary" onClick={() => void retryDenied()}>Try again</button></div>}
      {view.kind === 'unavailable' && <div className="mentor-dashboard-message mentor-dashboard-error" role="alert"><p><strong>Profile unavailable</strong></p><p>Your Mentor profile cannot be edited. Contact your administrator or HelpiNUS support.</p></div>}
      {profile && view.kind === 'ready' && <div className="mentor-dashboard-details">
        <div className="mentor-dashboard-identity">
          <span className="mentor-dashboard-avatar" aria-hidden="true">{initials(profile.displayName)}</span>
          <div><span className="mentor-dashboard-role">MENTOR PROFILE</span><p className="mentor-dashboard-name">{profile.displayName}</p></div>
        </div>
        <div className="mentor-dashboard-overview">
          <section className="mentor-dashboard-panel" aria-labelledby="mentor-dashboard-bio-title">
            <h3 id="mentor-dashboard-bio-title">Biography</h3>
            <p className={bio ? 'mentor-dashboard-bio' : 'mentor-dashboard-empty'}>{bio || 'No biography provided'}</p>
          </section>
          <section className="mentor-dashboard-panel" aria-labelledby="mentor-dashboard-modules-title">
            <h3 id="mentor-dashboard-modules-title">Supported modules</h3>
            {profile.moduleIds.length === 0 ? <p className="mentor-dashboard-empty">No modules listed</p> : view.result.metadata.kind === 'unavailable' || view.metadataFailed || view.refreshing ? <p className="mentor-dashboard-empty">{profile.moduleIds.length} saved {profile.moduleIds.length === 1 ? 'module' : 'modules'}; module information unavailable</p> : <>
              {summary && summary.active.length > 0 ? <ul className="mentor-dashboard-modules">{summary.active.slice(0, 3).map(({ id, label }) => <li key={id}>{label}</li>)}</ul> : <p className="mentor-dashboard-empty">No active modules available to preview</p>}
              {summary && summary.active.length > 3 && <p className="mentor-dashboard-module-note">+{summary.active.length - 3} more active modules</p>}
              {summary && summary.review > 0 && <p className="mentor-dashboard-module-note">{summary.review} module references need review</p>}
              {summary && summary.unknown > 0 && <p className="mentor-dashboard-module-note">{summary.unknown} module details unavailable</p>}
            </>}
            {(view.result.metadata.kind === 'unavailable' || view.metadataFailed || view.refreshing) && <div className="mentor-dashboard-metadata-message" role="alert"><p>{view.refreshing ? 'Refreshing module information…' : 'Module information is unavailable.'}</p><button className="button button-secondary" onClick={() => void read(true)}>Retry module information</button></div>}
          </section>
        </div>
        {(!bio || profile.moduleIds.length === 0) && <div className="mentor-dashboard-footer"><Link className="mentor-dashboard-complete" to="/mentor/profile">Complete your profile</Link></div>}
      </div>}
    </section>
  </section>
}
