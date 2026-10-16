import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { F01HelpRequest, Module } from '@helpinus/shared'
import { useServices } from '../services/useServices'
import type { HelpiNUSServices } from '../services/contracts'
import './HelpRequestPages.css'

type Cursor = { createdAt: string; id: string }
type PageState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; items: F01HelpRequest[] }
type FrozenAttempt = { operationId: string; mentorId: string; moduleId: string; title: string; description: string }
type StoredDraft = { moduleId: string; title: string; description: string; mentorName?: string; uncertain: FrozenAttempt | null }
const denied = (error: unknown) => /(?:permission-denied|unauthenticated|failed-precondition)/u.test(String((error as { code?: unknown })?.code ?? ''))
const draftKey = (uid: string | undefined, mentorId: string | undefined, moduleId: string | null) => `f01-draft:${encodeURIComponent(uid ?? '')}:${encodeURIComponent(mentorId ?? '')}:${encodeURIComponent(moduleId ?? '')}`
function readDraft(key: string): StoredDraft | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw) as StoredDraft
    if (typeof value.moduleId !== 'string' || typeof value.title !== 'string' || typeof value.description !== 'string') return null
    return value
  } catch { return null }
}

function useRequestPage(kind: 'student' | 'pending' | 'decided', uid: string | null, services: HelpiNUSServices, cursor: Cursor | null = null) {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!uid) return
    let active = true
    const onData = (items: F01HelpRequest[]) => { if (active) setState({ kind: 'ready', items }) }
    const onError = () => { if (active) setState({ kind: 'error' }) }
    const read = services.helpRequests
    const unsubscribe = kind === 'student' ? read.subscribeStudentPage(uid, cursor, onData, onError)
      : kind === 'pending' ? read.subscribeMentorPendingPage(uid, cursor, onData, onError)
        : read.subscribeMentorDecidedPage(uid, cursor, onData, onError)
    return () => { active = false; unsubscribe() }
  }, [kind, uid, services, cursor, retry])
  return { state, retry: () => { setState({ kind: 'loading' }); setRetry((value) => value + 1) } }
}

function ModuleName({ id }: { id: string }) {
  const { services, session } = useServices()
  const [label, setLabel] = useState('Loading module…')
  useEffect(() => {
    let active = true
    void services.modules.getById(id).then((module) => { if (active) setLabel(module ? module.code : 'Module information unavailable') }).catch(() => { if (active) setLabel('Module information unavailable') })
    return () => { active = false }
  }, [id, services, session?.user?.id])
  return <span>{label}</span>
}

export function RequestHelpPage() {
  const { mentorId } = useParams()
  const [search] = useSearchParams()
  const { session } = useServices()
  return <RequestHelpContent key={`${session?.user?.id ?? ''}:${mentorId ?? ''}:${search.get('moduleId') ?? ''}`} />
}

function RequestHelpContent() {
  const { mentorId } = useParams()
  const [search] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { services, session } = useServices()
  const uid = session?.user?.id
  const storageKey = draftKey(uid, mentorId, search.get('moduleId'))
  const [initialDraft] = useState(() => readDraft(storageKey))
  const selectedName = (location.state as { mentorName?: string } | null)?.mentorName ?? initialDraft?.mentorName
  const [modules, setModules] = useState<Module[]>([])
  const [selection, setSelection] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [selectionRetry, setSelectionRetry] = useState(0)
  const [moduleId, setModuleId] = useState(initialDraft?.moduleId ?? search.get('moduleId') ?? '')
  const [title, setTitle] = useState(initialDraft?.title ?? '')
  const [description, setDescription] = useState(initialDraft?.description ?? '')
  const [fieldErrors, setFieldErrors] = useState<{ module?: string; title?: string; description?: string }>({})
  const [message, setMessage] = useState('')
  const [duplicateId, setDuplicateId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uncertain, setUncertain] = useState<FrozenAttempt | null>(initialDraft && initialDraft.uncertain?.mentorId === mentorId ? initialDraft.uncertain : null)
  const attempt = useRef(0)
  const completed = useRef(false)
  useEffect(() => {
    if (!uid) return
    try {
      const owner = sessionStorage.getItem('f01-draft-owner')
      if (owner && owner !== uid) for (let index = sessionStorage.length - 1; index >= 0; index--) { const key = sessionStorage.key(index); if (key?.startsWith('f01-draft:')) sessionStorage.removeItem(key) }
      sessionStorage.setItem('f01-draft-owner', uid)
    } catch { /* Storage is optional; the current mounted attempt is still stable. */ }
  }, [uid])
  useEffect(() => {
    if (!uid || completed.current) return
    try { sessionStorage.setItem(storageKey, JSON.stringify({ moduleId, title, description, mentorName: selectedName, uncertain })) }
    catch { /* The request remains usable without storage. */ }
  }, [uid, storageKey, moduleId, title, description, selectedName, uncertain])
  useEffect(() => {
    if (!mentorId || !uid) return
    let active = true
    const currentAttempt = attempt
    queueMicrotask(() => { if (active) setSelection('loading') })
    void services.helpRequests.getSelection(mentorId).then(async (result) => {
      if (!result) { if (active) setSelection('empty'); return }
      const values = await Promise.all(result.moduleIds.map((id) => services.modules.getById(id)))
      if (active) { setModules(values.filter((value): value is Module => value !== null && value.active)); setSelection('ready') }
    }).catch(() => { if (active) setSelection('error') })
    return () => { active = false; ++currentAttempt.current }
  }, [mentorId, uid, services, selectionRetry])

  async function submit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!uncertain) {
      const errors = {
        module: modules.some((item) => item.id === moduleId) ? undefined : 'Choose a supported module.',
        title: !title.trim() ? 'Enter a question title.' : title.trim().length > 120 ? 'Use no more than 120 characters.' : undefined,
        description: !description.trim() ? 'Enter a detailed question.' : description.trim().length > 2000 ? 'Use no more than 2,000 characters.' : undefined,
      }
      setFieldErrors(errors)
      if (Object.values(errors).some(Boolean)) { setMessage('Correct the highlighted request fields.'); return }
    }
    if (!uncertain && !mentorId) { setMessage('Choose a Mentor first.'); return }
    const input: FrozenAttempt = uncertain ?? { operationId: crypto.randomUUID(), mentorId: mentorId ?? '', moduleId, title: title.trim(), description: description.trim() }
    const token = ++attempt.current
    // Save the operation before the network call: a refresh while it is in flight
    // must retry this exact payload, even if the first response never arrives.
    try { sessionStorage.setItem(storageKey, JSON.stringify({ moduleId, title, description, mentorName: selectedName, uncertain: input })) }
    catch { /* Storage is optional; the mounted attempt remains frozen. */ }
    setUncertain(input)
    setSubmitting(true); setMessage(''); setDuplicateId('')
    try {
      const result = await services.callables.invoke('createHelpRequest', input)
      if (token !== attempt.current) return
      if (result.kind === 'created') { completed.current = true; try { sessionStorage.removeItem(storageKey) } catch { /* Optional storage. */ } setUncertain(null); void navigate(`/student/requests/${result.helpRequest.id}`, { state: { created: true } }); return }
      setUncertain(null)
      setDuplicateId(result.existingHelpRequestId)
      setMessage(result.currentStatus === 'PENDING' ? 'No new request was sent. You already have a pending request for this Mentor and module. Your draft is still here.' : `No new request was sent. This operation refers to a request that is now ${result.currentStatus.toLowerCase()}. Your draft is still here.`)
    } catch (error) {
      if (token !== attempt.current) return
      const reason = (error as { details?: { reason?: string } })?.details?.reason
      const code = String((error as { code?: unknown })?.code ?? '')
      if (reason === 'SELECTION_INELIGIBLE') { setUncertain(null); setMessage('This Mentor or module is no longer available. Return to Mentor discovery and choose again.') }
      else if (reason === 'INTEGRITY_ERROR') { setUncertain(null); setMessage('This request needs support review. Contact HelpiNUS support before trying again.') }
      else if (/(?:^|\/)invalid-argument$/u.test(code)) { setUncertain(null); setMessage('Please correct the request fields. If this operation ID was reused with changed content, start a new intended request.') }
      else if (denied(error)) { setUncertain(null); setMessage('Your account or selection is no longer authorized. Refresh your account or choose another Mentor and module.') }
      else { setUncertain(input); setMessage('We could not confirm whether your request was sent. Keep this draft and check again with the same attempt.') }
    } finally { if (token === attempt.current) setSubmitting(false) }
  }
  const recoveryOnly = !!uncertain && (selection === 'error' || selection === 'empty' || (selection === 'ready' && !modules.some((item) => item.id === moduleId)))
  return <section className="help-page">
    <header className="page-heading"><Link to="/student/mentors">← Find a mentor</Link><h1>Request help</h1><p>Ask {selectedName ?? 'your selected Mentor'} about one supported module.</p></header>
    {selection === 'loading' && <p role="status">Loading supported modules…</p>}
    {selection === 'error' && <div className="help-card" role="alert"><p>We could not load this Mentor’s modules.</p><button className="button button-secondary" onClick={() => setSelectionRetry((value) => value + 1)}>Try again</button><Link to="/student/mentors">Return to Mentor discovery</Link></div>}
    {selection === 'empty' && <div className="help-card" role="alert"><p>This Mentor is no longer available for requests.</p><Link to="/student/mentors">Choose another Mentor</Link></div>}
    {recoveryOnly && <div className="help-card"><p>Checking an earlier attempt. Its original Mentor, module and question will be used even if this selection has changed.</p><button className="button button-primary" disabled={submitting} onClick={() => void submit()}>{submitting ? 'Checking request…' : 'Check this attempt again'}</button></div>}
    {message && (selection !== 'ready' || recoveryOnly) && <div role="alert" className="help-notice"><p>{message}</p>{duplicateId && <Link to={`/student/requests/${duplicateId}`}>View existing request</Link>}</div>}
    {selection === 'ready' && !recoveryOnly && <form className="help-card help-form" noValidate onSubmit={(event) => void submit(event)}>
      <div className="help-field"><label htmlFor="help-module">Module</label><select id="help-module" value={moduleId} onChange={(event) => { setModuleId(event.target.value); setFieldErrors((errors) => ({ ...errors, module: undefined })) }} disabled={submitting || !!uncertain} aria-invalid={!!fieldErrors.module} aria-describedby={fieldErrors.module ? 'help-module-error' : undefined} required><option value="">Choose a module</option>{modules.map((module) => <option key={module.id} value={module.id}>{module.code} — {module.title}</option>)}</select>{fieldErrors.module && <span id="help-module-error" className="help-field-error">{fieldErrors.module}</span>}</div>
      {modules.length === 0 && <p>No active supported modules are available. Choose another Mentor.</p>}
      <div className="help-field"><label htmlFor="help-title">Question title</label><input id="help-title" value={title} onChange={(event) => { setTitle(event.target.value); setFieldErrors((errors) => ({ ...errors, title: undefined })) }} maxLength={120} disabled={submitting || !!uncertain} aria-invalid={!!fieldErrors.title} aria-describedby={fieldErrors.title ? 'help-title-error' : undefined} required />{fieldErrors.title && <span id="help-title-error" className="help-field-error">{fieldErrors.title}</span>}</div>
      <div className="help-field"><label htmlFor="help-description">Detailed question</label><textarea id="help-description" value={description} onChange={(event) => { setDescription(event.target.value); setFieldErrors((errors) => ({ ...errors, description: undefined })) }} maxLength={2000} rows={7} disabled={submitting || !!uncertain} aria-invalid={!!fieldErrors.description} aria-describedby={fieldErrors.description ? 'help-description-error' : undefined} required />{fieldErrors.description && <span id="help-description-error" className="help-field-error">{fieldErrors.description}</span>}</div>
      <p className="help-hint">Title: up to 120 characters. Description: up to 2,000 characters.</p>
      {message && <div role="alert" className="help-notice"><p>{message}</p>{duplicateId && <Link to={`/student/requests/${duplicateId}`}>View existing request</Link>}</div>}
      <button className="button button-primary" disabled={submitting || modules.length === 0}>{submitting ? 'Checking request…' : uncertain ? 'Check this attempt again' : 'Send request'}</button>
    </form>}
  </section>
}

function RequestRows({ items, role }: { items: F01HelpRequest[]; role: 'student' | 'mentor' }) {
  return <ul className="help-list">{items.map((item) => <li key={item.id} className="help-card"><Link to={`/${role}/requests/${item.id}`}><strong>{item.title}</strong></Link><p>{role === 'student' ? item.mentorDisplayName : item.studentDisplayName} · <ModuleName id={item.moduleId} /></p><span className={`status-pill status-${item.status.toLowerCase()}`}>{item.status}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('en-SG')}</time></li>)}</ul>
}

function PagedRows({ kind, uid, services, cursor = null }: { kind: 'student' | 'pending' | 'decided'; uid: string | null; services: HelpiNUSServices; cursor?: Cursor | null }) {
  const { state, retry } = useRequestPage(kind, uid, services, cursor)
  const [nextPage, setNextPage] = useState<{ cursor: Cursor; signature: string } | null>(null)
  const role = kind === 'student' ? 'student' : 'mentor'
  if (state.kind === 'loading') return <p role="status">Loading requests…</p>
  if (state.kind === 'error') return <div className="help-card" role="alert"><p>Requests are unavailable. Check your account access or connection.</p><button className="button button-secondary" onClick={retry}>Try again</button></div>
  if (!state.items.length) return cursor ? null : <p className="help-card">{kind === 'pending' ? 'No pending requests.' : kind === 'decided' ? 'No decided requests.' : 'No requests yet.'}</p>
  const last = state.items.at(-1)!
  const currentCursor = { id: last.id, createdAt: last.createdAt }
  const signature = state.items.map((item) => `${item.id}:${item.createdAt}:${item.status}:${item.updatedAt}`).join('|')
  const childVisible = nextPage?.signature === signature
  const mayHaveContinuation = state.items.length === 20 || !!nextPage
  return <><RequestRows items={state.items} role={role} />{mayHaveContinuation && (childVisible ? <PagedRows key={`${nextPage.cursor.id}:${nextPage.cursor.createdAt}:${signature}`} kind={kind} uid={uid} services={services} cursor={nextPage.cursor} /> : <button className="button button-secondary" onClick={() => setNextPage({ cursor: currentCursor, signature })}>Load more requests</button>)}</>
}

export function StudentRequestsPage() {
  const { services, session } = useServices()
  const uid = session?.user?.id ?? null
  return <section className="help-page"><header className="page-heading"><h1>Your help requests</h1><p>Track questions sent to Mentors.</p></header>
    <PagedRows key={uid ?? ''} kind="student" uid={uid} services={services} />
    <Link to="/student/mentors">Find a Mentor</Link>
  </section>
}

export function MentorRequestsPage() {
  const { services, session } = useServices()
  const uid = session?.user?.id ?? null
  return <section className="help-page"><header className="page-heading"><h1>Help requests</h1><p>Review requests addressed to you.</p></header>
    <div className="help-columns"><section><h2>Pending</h2><PagedRows key={`${uid}:pending`} kind="pending" uid={uid} services={services} /></section>
      <section><h2>Decided</h2><PagedRows key={`${uid}:decided`} kind="decided" uid={uid} services={services} /></section></div>
  </section>
}

export function RequestDetailPage({ role }: { role: 'student' | 'mentor' }) {
  const { id } = useParams()
  const { session } = useServices()
  return <RequestDetailContent key={`${session?.user?.id ?? ''}:${role}:${id ?? ''}`} role={role} />
}

function RequestDetailContent({ role }: { role: 'student' | 'mentor' }) {
  const { id } = useParams()
  const { services, session } = useServices()
  const location = useLocation()
  const [item, setItem] = useState<F01HelpRequest | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [confirm, setConfirm] = useState<'ACCEPTED' | 'REJECTED' | null>(null)
  const [decision, setDecision] = useState<'idle' | 'working' | 'uncertain'>('idle')
  const [message, setMessage] = useState('')
  const operation = useRef<string | null>(null)
  const decisionGeneration = useRef(0)
  useEffect(() => {
    if (!id) return
    let active = true
    const unsubscribe = services.helpRequests.subscribeDetail(id, (value) => {
      if (!active) return
      if (value && value[role === 'student' ? 'studentId' : 'mentorId'] !== session?.user?.id) { setItem(null); setState('error'); return }
      setItem(value); setState('ready')
    }, () => { if (active) { setItem(null); setState('error') } })
    const generation = decisionGeneration
    return () => { active = false; ++generation.current; unsubscribe() }
  }, [id, role, services, session?.user?.id])
  async function decide() {
    if (!id || !confirm) return
    const response = confirm
    const operationId = operation.current ?? crypto.randomUUID()
    const token = ++decisionGeneration.current
    operation.current = operationId
    setDecision('working'); setMessage('')
    try {
      const result = await services.callables.invoke('respondToHelpRequest', { operationId, helpRequestId: id, response })
      if (token !== decisionGeneration.current) return
      if (result.kind === 'conflict') setMessage(`This request was already ${result.actualStatus.toLowerCase()}.`)
      else setMessage(result.helpRequest.status === 'REJECTED' ? 'Request rejected.' : 'Request accepted.')
      setDecision('idle'); setConfirm(null); operation.current = null
    } catch (error) {
      if (token !== decisionGeneration.current) return
      const reason = (error as { details?: { reason?: string } })?.details?.reason
      setDecision('uncertain')
      setMessage(reason === 'INTEGRITY_ERROR' ? 'This request needs support review. Contact HelpiNUS support before trying again.' : response === 'ACCEPTED' ? 'Acceptance is unavailable until conversations are integrated. No acceptance has been confirmed.' : denied(error) ? 'You can no longer decide this request. Check your account access.' : 'We could not confirm the decision. Check the live status, then retry this same action if still pending.')
    }
  }
  return <section className="help-page"><header className="page-heading"><Link to={`/${role}/requests`}>← Help requests</Link><h1>Request details</h1></header>
    {state === 'loading' && <p role="status">Loading request…</p>}
    {state === 'error' && <div className="help-card" role="alert">This request is unavailable or your access has changed.</div>}
    {state === 'ready' && !item && <div className="help-card">Request not found.</div>}
    {item && <article className="help-card help-detail"><div className="help-detail-heading"><h2>{item.title}</h2><span className={`status-pill status-${item.status.toLowerCase()}`}>{item.status}</span></div>
      <p><strong>{role === 'student' ? 'Mentor' : 'Student'}:</strong> {role === 'student' ? item.mentorDisplayName : item.studentDisplayName}</p><p><strong>Module:</strong> <ModuleName id={item.moduleId} /></p>
      <p className="help-description">{item.description}</p><p>Sent: <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('en-SG')}</time></p>{item.status !== 'PENDING' && <p>Decided: <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString('en-SG')}</time></p>}
      {role === 'mentor' && item.status === 'PENDING' && <div className="help-actions"><button className="button button-primary" disabled title="Acceptance needs conversation integration" onClick={() => { setConfirm('ACCEPTED'); operation.current = null }}>Accept</button><button className="button button-secondary" disabled={decision === 'working'} onClick={() => { setConfirm('REJECTED'); operation.current = null }}>Reject</button><p>Acceptance will be available after conversations are integrated.</p></div>}
      {confirm && item.status === 'PENDING' && <div className="help-confirm" role="group" aria-label="Confirm decision"><p>Confirm {confirm.toLowerCase()} for this request?</p><button className="button button-primary" disabled={decision === 'working'} onClick={() => void decide()}>{decision === 'working' ? 'Checking…' : decision === 'uncertain' ? 'Retry same decision' : 'Confirm'}</button><button className="button button-secondary" disabled={decision === 'working'} onClick={() => { setConfirm(null); setDecision('idle'); operation.current = null }}>Cancel</button></div>}
      {message && <p role="alert" className="help-notice">{message}</p>}{(location.state as { created?: boolean } | null)?.created && role === 'student' && <p role="status">Your request was saved.</p>}
    </article>}
  </section>
}
