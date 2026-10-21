import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import type {
  StudentStudyAssistInput,
  StudentStudyAssistOutput,
  StudentStudyAssistantConversation,
  StudentStudyAssistantMessage,
} from '@helpinus/shared'
import { Icon } from '../components/Icon'
import type { HelpiNUSServices } from '../services/contracts'
import {
  clearStudentStudyAssistantRetry,
  loadStudentStudyAssistantRetry,
  saveStudentStudyAssistantRetry,
} from '../services/studentStudyAssistantRetryStore'
import { useServices } from '../services/useServices'
import './StudentStudyAssistantPage.css'

type LoadState = 'loading' | 'ready' | 'error'
type SendState = 'idle' | 'sending' | 'uncertain'

const PAGE_SIZE = 20
const MESSAGE_PAGE_SIZE = 100
const serviceKeys = new WeakMap<HelpiNUSServices, number>()
let nextServiceKey = 0

function mergeConversations(current: StudentStudyAssistantConversation[], incoming: StudentStudyAssistantConversation[]) {
  const byId = new Map(current.map((conversation) => [conversation.id, conversation]))
  for (const conversation of incoming) byId.set(conversation.id, conversation)
  return [...byId.values()].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt) || b.id.localeCompare(a.id))
}

function mergeMessages(current: StudentStudyAssistantMessage[], incoming: StudentStudyAssistantMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) ||
    (a.role === b.role ? a.id.localeCompare(b.id) : a.role === 'STUDENT' ? -1 : 1))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function sendFailure(error: unknown): { message: string; uncertain: boolean } {
  const code = String((error as { code?: unknown })?.code ?? '').toLocaleLowerCase()
  if (code.includes('invalid-argument')) return { message: 'This question could not be accepted. Review the text and send a new message.', uncertain: false }
  if (code.includes('permission-denied') || code.includes('unauthenticated')) return { message: 'Your Study assistant access may have changed. Refresh your account before trying again.', uncertain: false }
  if (code.includes('failed-precondition')) return { message: 'The Study assistant is not available for this request. Try a new message later.', uncertain: false }
  if (code.includes('not-found') || code.includes('already-exists') || code.includes('conflict')) return { message: 'This conversation changed before the message could be accepted. Reload it before sending again.', uncertain: false }
  if (code.includes('resource-exhausted') || code.includes('rate-limited')) return { message: 'The Study assistant is receiving too many requests. Wait a moment, then send a new request.', uncertain: false }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { message: 'You appear to be offline. Reconnect, then retry this message.', uncertain: true }
  return { message: 'We could not confirm whether this message was answered. Retry to safely check the same request.', uncertain: true }
}

export function StudentStudyAssistantPage() {
  const { services, session } = useServices()
  const uid = session?.user?.id ?? ''
  let serviceKey = serviceKeys.get(services)
  if (serviceKey === undefined) {
    serviceKey = ++nextServiceKey
    serviceKeys.set(services, serviceKey)
  }
  return <StudentStudyAssistantContent key={`${serviceKey}:${uid}`} services={services} uid={uid} />
}

function StudentStudyAssistantContent({ services, uid }: { services: HelpiNUSServices; uid: string }) {
  const [conversations, setConversations] = useState<StudentStudyAssistantConversation[]>([])
  const [historyState, setHistoryState] = useState<LoadState>('loading')
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false)
  const [selected, setSelected] = useState<StudentStudyAssistantConversation | null>(null)
  const [messages, setMessages] = useState<StudentStudyAssistantMessage[]>([])
  const [conversationState, setConversationState] = useState<LoadState>('ready')
  const [messageCursor, setMessageCursor] = useState<string | null>(null)
  const [earlierLoading, setEarlierLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [pendingRequest, setPendingRequest] = useState<StudentStudyAssistInput | null>(() => loadStudentStudyAssistantRetry(uid)?.request ?? null)
  const [sendState, setSendState] = useState<SendState>(pendingRequest ? 'uncertain' : 'idle')
  const [sendError, setSendError] = useState(pendingRequest ? 'A previous message may not have completed. Retry to safely check the same request.' : '')
  const [announcement, setAnnouncement] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const generation = useRef(0)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const newConversationRef = useRef<HTMLButtonElement>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)
  const cancelDeleteRef = useRef<HTMLButtonElement>(null)
  const retryButtonRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    const field = composerRef.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 48), 180)}px`
  }, [draft])

  async function loadConversationPage(cursor?: string) {
    if (cursor) setHistoryLoadingMore(true)
    else setHistoryState('loading')
    try {
      const result = await services.callables.invoke('listStudentStudyAssistantConversations', cursor
        ? { cursor, limit: PAGE_SIZE }
        : { limit: PAGE_SIZE })
      setConversations((current) => mergeConversations(cursor ? current : [], result.conversations))
      setHistoryCursor(result.nextCursor)
      setHistoryState('ready')
    } catch {
      if (!cursor) setHistoryState('error')
      else setAnnouncement('Older conversations could not be loaded. Try again.')
    } finally {
      setHistoryLoadingMore(false)
    }
  }

  useEffect(() => {
    const request = ++generation.current
    queueMicrotask(() => {
      if (generation.current !== request) return
      void loadConversationPage()
    })
    return () => { generation.current = request + 1 }
    // Service and account changes remount this component through its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openConversation(conversation: StudentStudyAssistantConversation) {
    const request = ++generation.current
    setSelected(conversation)
    setMessages([])
    setDeleteConfirm(false)
    setDeleteError('')
    setConversationState('loading')
    try {
      const result = await services.callables.invoke('readStudentStudyAssistantConversation', {
        conversationId: conversation.id,
        limit: MESSAGE_PAGE_SIZE,
      })
      if (generation.current !== request) return
      setSelected(result.conversation)
      setMessages(result.messages)
      setMessageCursor(result.nextCursor)
      setConversationState('ready')
      setAnnouncement(`${result.messages.length} messages loaded.`)
    } catch {
      if (generation.current !== request) return
      setConversationState('error')
      setAnnouncement('This conversation could not be loaded.')
    }
  }

  async function loadEarlierMessages() {
    if (!selected || !messageCursor || earlierLoading) return
    setEarlierLoading(true)
    try {
      const result = await services.callables.invoke('readStudentStudyAssistantConversation', {
        conversationId: selected.id,
        cursor: messageCursor,
        limit: MESSAGE_PAGE_SIZE,
      })
      if (selected.id !== result.conversation.id) return
      setMessages((current) => mergeMessages(result.messages, current))
      setMessageCursor(result.nextCursor)
      setSelected(result.conversation)
      setAnnouncement('Earlier messages loaded.')
    } catch {
      setAnnouncement('Earlier messages could not be loaded. Try again.')
    } finally {
      setEarlierLoading(false)
    }
  }

  function startNewConversation() {
    if (pendingRequest && sendState === 'uncertain') {
      setSendError('Resolve or discard the pending message before starting another conversation.')
      setAnnouncement('A message still needs recovery. Retry it or discard its recovery before starting a new conversation.')
      queueMicrotask(() => retryButtonRef.current?.focus())
      return
    }
    ++generation.current
    setSelected(null)
    setMessages([])
    setMessageCursor(null)
    setConversationState('ready')
    setSendError('')
    setDeleteConfirm(false)
    setDeleteError('')
    setAnnouncement('New local conversation ready. It will not be saved until you send a message.')
    queueMicrotask(() => composerRef.current?.focus())
  }

  function acceptSend(result: StudentStudyAssistOutput) {
    setSelected(result.conversation)
    setConversations((current) => mergeConversations(current, [result.conversation]))
    setMessages((current) => mergeMessages(current, [result.userMessage, result.assistantMessage]))
    setDraft('')
    setPendingRequest(null)
    setSendState('idle')
    setSendError('')
    clearStudentStudyAssistantRetry()
    setAnnouncement(result.kind === 'grounded'
      ? `Answer received with ${result.assistantMessage.citations.length} ${result.assistantMessage.citations.length === 1 ? 'source' : 'sources'}.`
      : 'The approved sources did not contain enough information to answer this question.')
    queueMicrotask(() => composerRef.current?.focus())
  }

  async function dispatch(request: StudentStudyAssistInput) {
    setSendState('sending')
    setSendError('')
    try {
      const result = await services.callables.invoke('studentStudyAssist', request)
      acceptSend(result)
    } catch (error) {
      const failure = sendFailure(error)
      setSendError(failure.message)
      if (failure.uncertain) {
        setSendState('uncertain')
        setAnnouncement('Message delivery is uncertain. Use Retry message to safely retry the same request.')
      } else {
        setSendState('idle')
        setPendingRequest(null)
        clearStudentStudyAssistantRetry()
        setAnnouncement('Message not accepted. Review the guidance before sending a new request.')
      }
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const userMessage = draft.trim()
    if (!userMessage || sendState !== 'idle' || pendingRequest) return
    const request: StudentStudyAssistInput = {
      requestId: crypto.randomUUID(),
      conversationId: selected?.id ?? null,
      userMessage,
    }
    try {
      saveStudentStudyAssistantRetry({ version: 1, uid, request })
      setPendingRequest(request)
      void dispatch(request)
    } catch {
      setSendError('This message cannot be sent because safe retry recovery is unavailable. Check private browser storage and try again.')
      setAnnouncement('Message not sent because retry recovery could not be saved.')
    }
  }

  function retryPending() {
    if (!pendingRequest || sendState === 'sending') return
    void dispatch(pendingRequest)
  }

  function discardPending() {
    clearStudentStudyAssistantRetry()
    setPendingRequest(null)
    setSendState('idle')
    setSendError('')
    setAnnouncement('Pending message recovery discarded. The message may not appear in this conversation.')
    queueMicrotask(() => composerRef.current?.focus())
  }

  async function deleteConversation() {
    if (!selected || deletePending) return
    setDeletePending(true)
    setDeleteError('')
    try {
      await services.callables.invoke('deleteStudentStudyAssistantConversation', {
        requestId: crypto.randomUUID(),
        conversationId: selected.id,
      })
      setConversations((current) => current.filter((conversation) => conversation.id !== selected.id))
      setDeletePending(false)
      startNewConversation()
      setAnnouncement('Conversation deleted. Focus returned to New conversation.')
      queueMicrotask(() => newConversationRef.current?.focus())
    } catch {
      setDeleteError('This conversation could not be deleted. Try again.')
      setDeletePending(false)
      queueMicrotask(() => cancelDeleteRef.current?.focus())
    }
  }

  const activeTitle = selected?.title ?? 'New conversation'

  return <section className="study-assistant-page">
    <header className="study-assistant-heading">
      <div>
        <h1>Study assistant</h1>
        <p>Work through NUS computing concepts with answers grounded in approved sources.</p>
      </div>
    </header>

    <p className="study-assistant-live" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>

    <div className="study-assistant-trust" role="note">
      <strong>Check before you rely on an answer.</strong>
      <span>The assistant uses approved sources when available and will say when it lacks enough context.</span>
    </div>

    <div className="study-assistant-layout">
      <aside className="study-assistant-history" aria-labelledby="study-history-title">
        <div className="study-assistant-history-heading">
          <h2 id="study-history-title">History</h2>
          <p>Conversations expire 14 days after their latest activity.</p>
        </div>
        <button ref={newConversationRef} className="button button-primary study-assistant-new" type="button" disabled={sendState === 'sending'} onClick={startNewConversation}>New conversation</button>
        {historyState === 'loading' && <div className="study-assistant-history-loading" role="status"><span /><span /><span /></div>}
        {historyState === 'error' && <div className="study-assistant-history-state" role="alert"><p>Conversation history is unavailable.</p><button className="button button-secondary" type="button" onClick={() => void loadConversationPage()}>Try again</button></div>}
        {historyState === 'ready' && conversations.length === 0 && <p className="study-assistant-history-empty">Your saved conversations will appear here after you send your first message.</p>}
        {historyState === 'ready' && conversations.length > 0 && <ul className="study-assistant-history-list">{conversations.map((conversation) => <li key={conversation.id}>
          <button type="button" className={selected?.id === conversation.id ? 'is-active' : ''} aria-current={selected?.id === conversation.id ? 'page' : undefined} onClick={() => void openConversation(conversation)}>
            <strong>{conversation.title}</strong>
            <span>{conversation.preview || 'No preview available'}</span>
            <time dateTime={conversation.lastActivityAt}>{formatDate(conversation.lastActivityAt)}</time>
          </button>
        </li>)}</ul>}
        {historyCursor && <button className="button button-secondary study-assistant-load-more" type="button" disabled={historyLoadingMore} onClick={() => void loadConversationPage(historyCursor)}>{historyLoadingMore ? 'Loading…' : 'Load more'}</button>}
      </aside>

      <div className="study-assistant-workspace">
        <header className="study-assistant-conversation-heading">
          <div>
            <h2>{activeTitle}</h2>
            <p>{selected ? `Available until ${formatDate(selected.expiresAt)}` : 'Local only until your first message is sent'}</p>
          </div>
          {selected && !deleteConfirm && <button ref={deleteTriggerRef} className="study-assistant-delete-trigger" type="button" disabled={sendState !== 'idle'} onClick={() => { setDeleteConfirm(true); queueMicrotask(() => cancelDeleteRef.current?.focus()) }}>Delete conversation</button>}
        </header>

        {deleteConfirm && selected && <div className="study-assistant-delete-confirm" role="alert">
          <div><strong>Delete this conversation?</strong><p>This removes its saved messages and cannot be undone.</p>{deleteError && <p>{deleteError}</p>}</div>
          <div>
            <button ref={cancelDeleteRef} className="button button-secondary" type="button" disabled={deletePending} onClick={() => { setDeleteConfirm(false); setDeleteError(''); queueMicrotask(() => deleteTriggerRef.current?.focus()) }}>Cancel</button>
            <button className="button study-assistant-delete-button" type="button" disabled={deletePending} onClick={() => void deleteConversation()}>{deletePending ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>}

        {conversationState === 'loading' && <div className="study-assistant-conversation-state" role="status"><span className="study-assistant-pulse" />Loading conversation…</div>}
        {conversationState === 'error' && selected && <div className="study-assistant-conversation-state is-error" role="alert"><p>We could not load this conversation.</p><button className="button button-secondary" type="button" onClick={() => void openConversation(selected)}>Try again</button></div>}

        {conversationState === 'ready' && <>
          <div className="study-assistant-message-region" role="region" aria-label="Study assistant messages">
            {messageCursor && <button className="button button-secondary study-assistant-earlier" type="button" disabled={earlierLoading} onClick={() => void loadEarlierMessages()}>{earlierLoading ? 'Loading…' : 'Load earlier messages'}</button>}
            {messages.length === 0 && <div className="study-assistant-empty">
              <span className="study-assistant-empty-icon"><Icon name="study" /></span>
              <h3>What would you like to understand?</h3>
              <p>Ask about a concept or work through a question. A saved conversation begins only after you send.</p>
            </div>}
            {messages.map((message) => <article key={message.id} className={`study-assistant-message ${message.role === 'STUDENT' ? 'is-student' : 'is-assistant'}`} aria-label={`${message.role === 'STUDENT' ? 'You' : 'Study assistant'} at ${formatDate(message.createdAt)}`}>
              <div className="study-assistant-message-meta"><strong>{message.role === 'STUDENT' ? 'You' : 'Study assistant'}</strong><time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time></div>
              <p>{message.content}</p>
              {message.role === 'ASSISTANT' && message.citations.length > 0 && <section className="study-assistant-citations" aria-label="Sources for this answer">
                <h3>Sources</h3>
                <ol>{message.citations.map((citation) => <li key={`${citation.sourceId}:${citation.section ?? ''}`}>
                  <a href={citation.canonicalUrl} target="_blank" rel="noreferrer noopener">{citation.title}</a>
                  <span>{citation.section ? `${citation.section} · ` : ''}Version {citation.version}</span>
                </li>)}</ol>
              </section>}
              {message.role === 'ASSISTANT' && message.grounding === 'INSUFFICIENT_CONTEXT' && <div className="study-assistant-grounding-note" role="note"><strong>Not enough approved context</strong><p>Try narrowing your question or check your course materials. The assistant will not fill gaps with uncited information.</p></div>}
            </article>)}
          </div>

          {sendError && <div className="study-assistant-send-error" role="alert"><p>{sendError}</p>{pendingRequest && sendState === 'uncertain' && <div className="study-assistant-retry-actions"><button ref={retryButtonRef} className="button button-secondary" type="button" onClick={retryPending}>Retry message</button><button className="study-assistant-discard" type="button" onClick={discardPending}>Discard recovery</button></div>}</div>}

          <form className="study-assistant-composer" onSubmit={submit}>
            <label htmlFor="study-assistant-message">Ask a question</label>
            <div className="study-assistant-composer-row">
              <textarea ref={composerRef} id="study-assistant-message" value={draft} maxLength={4000} rows={1} disabled={sendState !== 'idle'} placeholder="Ask about a computing concept…" onChange={(event) => setDraft(event.target.value)} />
              <button className="study-assistant-send" type="submit" disabled={!draft.trim() || sendState !== 'idle'} aria-label={sendState === 'sending' ? 'Sending message' : 'Send message'}><Icon name="send" /></button>
            </div>
            <div className="study-assistant-composer-notes"><span>{draft.length.toLocaleString()} / 4,000</span><span>Answers may be inaccurate. Check the cited sources.</span></div>
          </form>
        </>}
      </div>
    </div>

    <aside className="study-assistant-integrity" aria-label="Academic integrity guidance">
      <strong>Learn with it, do not submit it.</strong>
      <p>Use the Study assistant to understand concepts and work through questions. Check its answers against the cited sources and your course requirements. Do not submit generated work as your own.</p>
    </aside>
  </section>
}

