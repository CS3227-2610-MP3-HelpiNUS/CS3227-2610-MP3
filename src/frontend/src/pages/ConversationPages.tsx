import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { messageBodySchema, type F02SavedMessage } from '@helpinus/shared'
import { useServices } from '../services/useServices'
import { clearChatRetries, loadChatRetries, removeChatRetry, saveChatRetry, type ChatRetry } from '../services/chatRetryStore'
import type { ChatCursor, ChatDetail, ChatRow } from '../services/contracts'
import './ConversationPages.css'

const denied = (error: unknown) => ['permission-denied', 'unauthenticated'].some((code) => String((error as { code?: unknown })?.code ?? '').includes(code))
const support = 'This conversation needs support review. Contact HelpiNUS support.'

export function ConversationListPage({ role }: { role: 'student' | 'mentor' }) {
  const { services, session } = useServices()
  const uid = session?.user?.id ?? ''
  const [pages, setPages] = useState<Array<{ cursor: ChatCursor | null; rows: ChatRow[]; next: ChatCursor | null }>>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'stale'>('loading')
  const [generation, setGeneration] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  useEffect(() => {
    if (!uid) return
    let live = true
    const unsubscribes: Array<() => void> = []
    priorRows.current = false
    const anchored = new Set<string>()
    let previousLive: ChatRow[] | null = null
    const rowId = (row: ChatRow) => row.kind === 'ready' ? row.request.id : row.requestId
    const subscribe = (cursor: ChatCursor | null, bridgeTarget?: Set<string>) => {
      const key = JSON.stringify(cursor)
      if (anchored.has(key)) return
      anchored.add(key)
      const unsubscribe = services.conversations.subscribeList(uid, role === 'student' ? 'STUDENT' : 'MENTOR', cursor, (rows, next) => {
        if (!live) return
        if (cursor === null) {
          const currentIds = new Set(rows.map(rowId))
          const evicted = previousLive?.filter((row) => !currentIds.has(rowId(row))) ?? []
          previousLive = rows
          if (evicted.length > 0 && next) subscribe(next, new Set(evicted.map(rowId)))
        } else if (bridgeTarget && !rows.some((row) => bridgeTarget.has(rowId(row))) && next) {
          subscribe(next, bridgeTarget)
        }
        setPages((prior) => {
          const found = prior.findIndex((page) => JSON.stringify(page.cursor) === JSON.stringify(cursor))
          const updated = [...prior]
          if (found >= 0) updated[found] = { cursor, rows, next }
          else updated.push({ cursor, rows, next })
          return updated
        })
        priorRows.current = true; setState('ready'); setLoadingMore(false)
      }, (error) => {
        if (!live) return
        setState(denied(error) ? 'error' : priorRows.current ? 'stale' : 'error')
        if (denied(error)) { clearChatRetries(); setPages([]) }
        setLoadingMore(false)
      })
      unsubscribes.push(unsubscribe)
    }
    queueMicrotask(() => { if (live) { setPages([]); setState('loading'); setLoadingMore(false); subscribe(null); more.current = subscribe } })
    return () => { live = false; more.current = null; unsubscribes.forEach((unsubscribe) => unsubscribe()) }
  }, [uid, role, services, generation])
  const more = useRef<((cursor: ChatCursor) => void) | null>(null)
  const priorRows = useRef(false)
  const rows = new Map<string, ChatRow>()
  for (const page of pages) for (const row of page.rows) rows.set(row.kind === 'ready' ? row.request.id : row.requestId, row)
  const sorted = [...rows.values()].sort((a, b) => {
    const at = a.kind === 'ready' ? a.request.updatedAt : a.acceptedAt
    const bt = b.kind === 'ready' ? b.request.updatedAt : b.acceptedAt
    const aid = a.kind === 'ready' ? a.request.id : a.requestId
    const bid = b.kind === 'ready' ? b.request.id : b.requestId
    return bt.localeCompare(at) || bid.localeCompare(aid)
  })
  const oldestPage = [...pages].filter((page) => page.rows.length > 0).sort((a, b) => {
    const lastA = a.rows.at(-1)!
    const lastB = b.rows.at(-1)!
    const at = lastA.kind === 'ready' ? lastA.request.updatedAt : lastA.acceptedAt
    const bt = lastB.kind === 'ready' ? lastB.request.updatedAt : lastB.acceptedAt
    return at.localeCompare(bt) || (lastA.kind === 'ready' ? lastA.request.id : lastA.requestId).localeCompare(lastB.kind === 'ready' ? lastB.request.id : lastB.requestId)
  })[0]
  const next = oldestPage?.next ?? null
  return <section className="chat-page"><header className="page-heading"><h1>Conversations</h1><p>Private conversations for accepted help requests.</p></header>
    {state === 'loading' && <p role="status">Loading conversations…</p>}
    {state === 'error' && <p role="alert">Conversation access is unavailable. Check your account and try again. <button className="button button-secondary" onClick={() => setGeneration((value) => value + 1)}>Retry</button></p>}
    {state === 'stale' && <p role="alert">The conversation list may be out of date. <button className="button button-secondary" onClick={() => setGeneration((value) => value + 1)}>Retry</button></p>}
    {state === 'ready' && sorted.length === 0 && <p className="help-card">No accepted conversations yet.</p>}
    <ul className="chat-list">{sorted.map((row) => <li className="help-card" key={row.kind === 'ready' ? row.request.id : row.requestId}>
      {row.kind === 'ready' ? <><h2>{row.request.title}</h2><p>{role === 'student' ? row.request.mentorDisplayName : row.request.studentDisplayName} · {row.request.moduleId}</p><Link to={`/${role}/conversations/${row.request.id}`}>Open conversation</Link></> : <><h2>Conversation needs support</h2><p>{support}</p></>}
    </li>)}</ul>
    {next && <button className="button button-secondary" disabled={loadingMore} onClick={() => { setLoadingMore(true); more.current?.(next) }}>{loadingMore ? 'Loading…' : 'Load more'}</button>}
  </section>
}

type Pending = ChatRetry & { note?: string }

export function ConversationDetailPage({ role }: { role: 'student' | 'mentor' }) {
  const { requestId = '' } = useParams()
  const { services, session } = useServices()
  const uid = session?.user?.id ?? ''
  const [detail, setDetail] = useState<ChatDetail | null>(null)
  const [detailState, setDetailState] = useState<'loading' | 'ready' | 'error' | 'support'>('loading')
  const [pages, setPages] = useState<Array<{ cursor: ChatCursor | null; messages: F02SavedMessage[]; next: ChatCursor | null }>>([])
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'stale' | 'error'>('loading')
  const [pending, setPending] = useState<Pending[]>([])
  const [confirmed, setConfirmed] = useState<F02SavedMessage[]>([])
  const [body, setBody] = useState('')
  const [notice, setNotice] = useState('')
  const [generation, setGeneration] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const [foreground, setForeground] = useState(() => document.visibilityState === 'visible' && document.hasFocus())
  const [receiptRetry, setReceiptRetry] = useState(0)
  const epoch = useRef(0)
  const sendSequence = useRef(0)
  const more = useRef<((cursor: ChatCursor) => void) | null>(null)
  const announced = useRef(new Set<string>())
  const acknowledgeAttempted = useRef(new Set<string>())
  const restoredIds = useRef(new Set<string>())
  const retryRef = useRef<((item: Pending, verifiedDetail?: ChatDetail) => Promise<void>) | null>(null)
  const historyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => setForeground(document.visibilityState === 'visible' && document.hasFocus())
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    return () => { document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', update); window.removeEventListener('blur', update) }
  }, [])

  useEffect(() => {
    const epochRef = epoch
    const current = ++epochRef.current
    restoredIds.current.clear()
    if (!uid || !requestId) return
    let unsubscribe = () => {}
    queueMicrotask(() => { if (epoch.current === current) {
      setDetail(null); setDetailState('loading'); setPages([]); setConfirmed([]); setHistoryState('loading'); setPending([]); setBody(''); setNotice('')
      unsubscribe = services.conversations.subscribeDetail(requestId, (value) => {
      if (epoch.current !== current) return
      if (!value || value.request[role === 'student' ? 'studentId' : 'mentorId'] !== uid) {
        clearChatRetries(); setDetail(null); setPending([]); setBody(''); setDetailState('support'); return
      }
      setDetail(value); setDetailState('ready')
      try {
        const restored = loadChatRetries(uid, requestId)
        sendSequence.current = Math.max(sendSequence.current, ...restored.map((item) => item.localSequence), 0)
        const newItems = restored.filter((item) => !restoredIds.current.has(item.messageId))
        newItems.forEach((item) => restoredIds.current.add(item.messageId))
        setPending((prior) => [...prior, ...newItems.map((item) => ({ ...item, state: 'uncertain' as const }))])
        newItems.forEach((item) => queueMicrotask(() => { if (epoch.current === current) void retryRef.current?.(item, value) }))
      } catch { setNotice('Saved message recovery is unavailable. Check browser storage before sending again.') }
    }, (error) => {
      if (epoch.current !== current) return
      if (denied(error)) clearChatRetries()
      setDetail(null); setPending([]); setBody(''); setDetailState('error')
      })
    } })
    return () => { if (epochRef.current === current) ++epochRef.current; unsubscribe() }
  }, [uid, requestId, role, services, generation])

  useEffect(() => {
    if (!detail || !requestId) return
    const current = epoch.current
    let live = true
    const unsubscribes: Array<() => void> = []
    const anchored = new Set<string>()
    let previousLive: F02SavedMessage[] | null = null
    const subscribe = (cursor: ChatCursor | null, bridgeTarget?: Set<string>) => {
      const key = JSON.stringify(cursor)
      if (anchored.has(key)) return
      anchored.add(key)
      const unsubscribe = services.conversations.subscribeMessages(requestId, cursor, (messages, next) => {
        if (!live || epoch.current !== current) return
        if (cursor === null) {
          const currentIds = new Set(messages.map((message) => message.id))
          const evicted = previousLive?.filter((message) => !currentIds.has(message.id)) ?? []
          previousLive = messages
          if (evicted.length > 0 && next) subscribe(next, new Set(evicted.map((message) => message.id)))
        } else if (bridgeTarget && !messages.some((message) => bridgeTarget.has(message.id)) && next) {
          // A live-window jump may evict more than one page. Keep adding bounded
          // listeners until the newly loaded range overlaps previously seen history.
          subscribe(next, bridgeTarget)
        }
        setPages((prior) => {
          const found = prior.findIndex((page) => JSON.stringify(page.cursor) === JSON.stringify(cursor))
          const updated = [...prior]
          if (found >= 0) updated[found] = { cursor, messages, next }
          else updated.push({ cursor, messages, next })
          return updated
        })
        setHistoryState('ready')
        setPending((prior) => prior.filter((item) => {
          const saved = messages.find((message) => message.id === item.messageId && message.senderId === uid && message.body === item.normalizedBody)
          if (saved) { try { removeChatRetry(item) } catch { /* Next restore reconciles. */ }; return false }
          return true
        }))
        if (cursor === null && announced.current.size > 0) {
          const incoming = messages.find((message) => message.senderId !== uid && !announced.current.has(message.id))
          if (incoming) setAnnouncement(`New message from ${role === 'student' ? detail.request.mentorDisplayName : detail.request.studentDisplayName}`)
        }
        messages.forEach((message) => announced.current.add(message.id))
      }, (error) => {
        if (!live || epoch.current !== current) return
        if (denied(error)) { clearChatRetries(); live = false; unsubscribes.forEach((unsubscribe) => unsubscribe()); setDetail(null); setPages([]); setConfirmed([]); setPending([]); setBody(''); setDetailState('error'); setHistoryState('error') }
        else setHistoryState('stale')
      })
      unsubscribes.push(unsubscribe)
    }
    subscribe(null)
    more.current = subscribe
    return () => { live = false; more.current = null; unsubscribes.forEach((unsubscribe) => unsubscribe()) }
  }, [detail, requestId, services, uid, role])

  const saved = new Map<string, F02SavedMessage>()
  for (const page of pages) for (const message of page.messages) saved.set(message.id, message)
  for (const message of confirmed) if (!saved.has(message.id)) saved.set(message.id, message)
  const messages = [...saved.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const unresolved = pending.filter((item) => !saved.has(item.messageId)).sort((a, b) => a.localSequence - b.localSequence)
  const oldestPage = [...pages].filter((page) => page.messages.length > 0).sort((a, b) => {
    const oldestA = a.messages.at(-1)!
    const oldestB = b.messages.at(-1)!
    return oldestA.createdAt.localeCompare(oldestB.createdAt) || oldestA.id.localeCompare(oldestB.id)
  })[0]
  const next = oldestPage?.next ?? null

  async function retry(item: Pending, verifiedDetail: ChatDetail | null = detail) {
    const current = epoch.current
    if (!verifiedDetail || !uid || verifiedDetail.request[role === 'student' ? 'studentId' : 'mentorId'] !== uid) return
    setPending((prior) => prior.map((entry) => entry.messageId === item.messageId ? { ...entry, state: 'sending', note: undefined } : entry))
    try {
      const existing = await services.conversations.getMessageFromServer(requestId, item.messageId)
      if (epoch.current !== current) return
      if (existing) {
        if (existing.senderId !== uid || existing.body !== item.normalizedBody) throw new Error('Message ID conflicts with saved content.')
        setConfirmed((prior) => [...prior.filter((message) => message.id !== existing.id), existing])
        removeChatRetry(item)
        setPending((prior) => prior.filter((entry) => entry.messageId !== item.messageId))
        return
      }
      const result = await services.callables.invoke('sendMessage', { requestId, messageId: item.messageId, body: item.normalizedBody })
      if (epoch.current !== current) return
      if (result.message.senderId !== uid || result.message.body !== item.normalizedBody) throw new Error('Saved message did not match this send.')
      setConfirmed((prior) => [...prior.filter((message) => message.id !== result.message.id), result.message])
      removeChatRetry(item)
      setPending((prior) => prior.filter((entry) => entry.messageId !== item.messageId))
    } catch (error) {
      if (epoch.current !== current) return
      if (denied(error)) { clearChatRetries(); setDetail(null); setPages([]); setConfirmed([]); setPending([]); setBody(''); setDetailState('error'); return }
      const definitive = ['invalid-argument', 'already-exists', 'failed-precondition'].some((code) => String((error as { code?: unknown })?.code ?? '').includes(code))
      const state = definitive ? 'failed' : 'uncertain'
      const updated = { ...item, state } as Pending
      try { saveChatRetry(updated) } catch { setNotice('Message recovery storage is full. Keep this page open and contact support if needed.') }
      setPending((prior) => prior.map((entry) => entry.messageId === item.messageId ? { ...updated, note: definitive ? 'Message could not be sent.' : 'Save is uncertain. Retry to check the server.' } : entry))
    }
  }
  useEffect(() => { retryRef.current = retry })

  function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = messageBodySchema.safeParse(body)
    if (!parsed.success) { setNotice('Enter 1 to 4,000 characters. Outer spaces are removed.'); return }
    if (!uid || !detail) return
    const item: ChatRetry = { version: 1, uid, requestId, messageId: crypto.randomUUID(), normalizedBody: parsed.data, localSequence: ++sendSequence.current, state: 'sending' }
    try { saveChatRetry(item) } catch { setNotice('This message cannot be saved for recovery. Free browser session storage before sending.'); return }
    setPending((prior) => [...prior, item]); setBody(''); setNotice('')
    void retry(item)
  }

  useEffect(() => {
    if (!detail || !historyRef.current || typeof IntersectionObserver !== 'function' || !foreground) return
    const root = historyRef.current
    const observer = new IntersectionObserver((entries) => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const id = (entry.target as HTMLElement).dataset.messageId
        const message = messages.find((candidate) => candidate.id === id)
        if (!message || message.senderId === uid || message.readAt || acknowledgeAttempted.current.has(message.id)) continue
        acknowledgeAttempted.current.add(message.id)
        const current = epoch.current
        void services.callables.invoke('acknowledgeMessage', { requestId, messageId: message.id }).catch(() => {
          acknowledgeAttempted.current.delete(message.id)
          window.setTimeout(() => { if (epoch.current === current) setReceiptRetry((value) => value + 1) }, 2000)
        })
      }
    }, { root, threshold: 0.5 })
    root.querySelectorAll('[data-message-id]').forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [detail, foreground, messages, receiptRetry, requestId, services, uid])

  return <section className="chat-page"><header className="page-heading"><Link to={`/${role}/conversations`}>← Conversations</Link><h1>Conversation</h1></header>
    {detailState === 'loading' && <p role="status">Loading conversation…</p>}
    {detailState === 'error' && <p role="alert">Conversation access is unavailable. Check your account and try again. <button className="button button-secondary" onClick={() => setGeneration((value) => value + 1)}>Retry</button></p>}
    {detailState === 'support' && <p className="help-card" role="alert">{support}</p>}
    {detail && <><section className="help-card" aria-label="Request context"><h2>{detail.request.title}</h2><p>{role === 'student' ? detail.request.mentorDisplayName : detail.request.studentDisplayName} · {detail.request.moduleId}</p><p className="chat-body">{detail.request.description}</p></section>
      {historyState === 'loading' && <p role="status">Loading messages…</p>}
      {historyState === 'stale' && <p role="alert">Messages may be out of date. <button className="button button-secondary" onClick={() => setGeneration((value) => value + 1)}>Retry</button></p>}
      {historyState === 'ready' && messages.length === 0 && unresolved.length === 0 && <p>No messages yet.</p>}
      {next && <button className="button button-secondary" onClick={() => more.current?.(next)}>Load earlier messages</button>}
      <div className="chat-history" ref={historyRef} role="log" aria-label="Messages">{messages.map((message) => <div className={`chat-bubble ${message.senderId === uid ? 'mine' : 'theirs'}`} key={message.id} data-message-id={message.id}>
        <p className="chat-body">{message.body}</p><small>{new Date(message.createdAt).toLocaleString('en-SG')}</small>
        {message.senderId === uid && <span className="chat-status">{message.readAt ? '✓✓ Read' : '✓✓ Sent'}</span>}
      </div>)}{unresolved.map((item) => <div className="chat-bubble mine" key={item.messageId}><p className="chat-body">{item.normalizedBody}</p><span className="chat-status">{item.state === 'sending' ? '✓ Sending' : item.state === 'uncertain' ? '? Save uncertain' : 'Failed'}</span>{item.state !== 'sending' && <button className="button button-secondary" onClick={() => void retry(item)}>Retry</button>}{item.note && <small>{item.note}</small>}</div>)}</div>
      <p className="visually-hidden" aria-live="polite">{announcement}</p>
      {notice && <p role="alert">{notice}</p>}
      <form className="chat-compose" onSubmit={submit}><label htmlFor="chat-message">Message</label><textarea id="chat-message" value={body} onChange={(event) => setBody(event.target.value)} rows={3} /><button className="button button-primary" type="submit">Send message</button></form>
    </>}
  </section>
}
