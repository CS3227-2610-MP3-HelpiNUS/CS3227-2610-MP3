import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Appointment, AvailabilitySlot } from '@helpinus/shared'
import { Icon } from '../components/Icon'
import { useServices } from '../services/useServices'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { validateAvailabilityForm, type AvailabilityErrors } from '../utils/consultationTime'
import './ConsultationPages.css'

const singaporeOffset = '+08:00'
const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' })
const fullDate = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const monthName = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', month: 'long', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit' })
const dateTimeFormat = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function dateKey(value: Date | string) {
  const parts = dateParts.formatToParts(typeof value === 'string' ? new Date(value) : value)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const nextYear = monthNumber === 12 ? year + 1 : year
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1
  return {
    startsAt: `${month}-01T00:00:00${singaporeOffset}`,
    endsAt: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00${singaporeOffset}`,
  }
}

function moveMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  const value = new Date(Date.UTC(year, monthNumber - 1 + amount, 1))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`
}

function dayInMonth(month: string, preferredDay: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const day = Math.min(Number(preferredDay.slice(-2)), new Date(Date.UTC(year, monthNumber, 0)).getUTCDate())
  return `${month}-${String(day).padStart(2, '0')}`
}

function moveDay(day: string, amount: number) {
  const [year, monthNumber, dayNumber] = day.split('-').map(Number)
  const value = new Date(Date.UTC(year, monthNumber - 1, dayNumber + amount))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

function calendarDays(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
  const first = Date.UTC(year, monthNumber - 1, 1 - firstWeekday)
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(first + index * 24 * 60 * 60 * 1000)
    const key = `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
    return { key, day: value.getUTCDate(), inMonth: value.getUTCMonth() === monthNumber - 1 }
  })
}

function localIso(day: string, time: string) {
  return new Date(`${day}T${time}:00${singaporeOffset}`).toISOString()
}

function errorReason(error: unknown) {
  const candidate = error as { code?: unknown; details?: { reason?: unknown } }
  return { code: String(candidate?.code ?? ''), reason: String(candidate?.details?.reason ?? '') }
}

function bookingError(error: unknown) {
  const { code, reason } = errorReason(error)
  if (reason === 'STUDENT_OVERLAP') return 'You already have another consultation during this time. Choose a different time.'
  if (reason === 'SLOT_TAKEN' || code.endsWith('already-exists')) return 'That time was just booked. Choose another available slot.'
  if (reason === 'SLOT_ELAPSED') return 'That time has already passed. Choose another available slot.'
  if (code.endsWith('permission-denied') || code.endsWith('unauthenticated')) return 'Your account can no longer make this booking. Sign in again or contact support.'
  return 'We could not save this booking. Check your connection and try again.'
}

function slotError(error: unknown) {
  const { code, reason } = errorReason(error)
  if (reason === 'SLOT_OVERLAP' || code.endsWith('already-exists')) return 'That time overlaps availability you already created.'
  if (reason === 'PAST_SLOT') return 'Choose a time later than the current Singapore time.'
  if (reason === 'END_NOT_AFTER_START') return 'End time must be later than start time.'
  if (reason === 'CROSSES_DAY') return 'Start and end time must be on the same date.'
  if (reason === 'UNALIGNED_SLOT') return 'Use times ending in :00 or :30.'
  if (reason === 'DURATION_TOO_SHORT') return 'Availability must be at least 30 minutes.'
  if (reason === 'DURATION_TOO_LONG') return 'Availability cannot exceed 120 minutes.'
  if (reason === 'INVALID_TIMESTAMP') return 'Enter valid start and end times.'
  if (code.endsWith('permission-denied') || code.endsWith('unauthenticated')) return 'Your account can no longer manage Mentor availability.'
  return 'We could not save this availability. Check your connection and try again.'
}

function useAppointments(role: 'STUDENT' | 'MENTOR') {
  const { services, session } = useServices()
  const [state, setState] = useState<{ key: string; kind: 'ready'; items: Appointment[] } | { key: string; kind: 'error' } | null>(null)
  const [retry, setRetry] = useState(0)
  const uid = session?.user?.id
  const key = `${uid ?? ''}:${role}:${retry}`
  useEffect(() => {
    if (!uid) return
    return services.scheduling.subscribeAppointments(uid, role, (items) => setState({ key, kind: 'ready', items }), () => setState({ key, kind: 'error' }))
  }, [key, role, services, uid])
  const current = state?.key === key ? state : null
  return { appointments: current?.kind === 'ready' ? current.items : [], loading: current === null, error: current?.kind === 'error', retry: () => setRetry((value) => value + 1) }
}

function Calendar({ month, selected, counts, now, onMonth, onSelect }: { month: string; selected: string; counts: Map<string, number>; now: number; onMonth: (month: string) => void; onSelect: (day: string) => void }) {
  const today = dateKey(new Date(now))
  const days = calendarDays(month)
  function select(day: string) {
    if (day < today) return
    onSelect(day)
    if (day.slice(0, 7) !== month) onMonth(day.slice(0, 7))
  }
  function navigateMonth(amount: number) {
    const nextMonth = moveMonth(month, amount)
    if (nextMonth < today.slice(0, 7)) return
    onMonth(nextMonth)
    const nextDay = dayInMonth(nextMonth, selected)
    onSelect(nextDay < today ? today : nextDay)
  }
  function navigateByKeyboard(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const amount = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : event.key === 'ArrowDown' ? 7 : null
    if (amount === null) return
    event.preventDefault()
    const candidate = moveDay(day, amount)
    const nextDay = candidate < today ? today : candidate
    select(nextDay)
    window.requestAnimationFrame(() => document.getElementById(`consultation-day-${nextDay}`)?.focus())
  }
  return <section className="consultation-calendar" aria-label="Consultation calendar">
    <div className="consultation-month-controls">
      <button type="button" disabled={month <= today.slice(0, 7)} onClick={() => navigateMonth(-1)} aria-label="Previous month"><Icon name="arrow" /></button>
      <h2>{monthName.format(new Date(`${month}-01T12:00:00${singaporeOffset}`))}</h2>
      <button type="button" onClick={() => navigateMonth(1)} aria-label="Next month"><Icon name="arrow" /></button>
    </div>
    <div className="consultation-weekdays" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="consultation-days">
      {days.map((item) => {
        const count = counts.get(item.key) ?? 0
        const past = item.key < today
        const label = `${past ? 'Unavailable, past date, ' : ''}${fullDate.format(new Date(`${item.key}T12:00:00${singaporeOffset}`))}${count && !past ? `, ${count} ${count === 1 ? 'slot' : 'slots'}` : ''}`
        return <button id={`consultation-day-${item.key}`} key={item.key} type="button" disabled={past} tabIndex={item.key === selected ? 0 : -1} className={`${item.inMonth ? '' : 'is-outside'}${item.key === selected ? ' is-selected' : ''}${count && !past ? ' has-slots' : ''}${past ? ' is-past' : ''}`} aria-label={label} aria-pressed={item.key === selected} aria-current={item.key === today ? 'date' : undefined} onKeyDown={(event) => navigateByKeyboard(event, item.key)} onClick={() => select(item.key)}><span>{item.day}</span>{count > 0 && !past && <i aria-hidden="true" />}</button>
      })}
    </div>
    <button type="button" className="consultation-today" onClick={() => { onMonth(today.slice(0, 7)); onSelect(today) }}>Return to today</button>
  </section>
}

function TimeRange({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const minutes = Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60000)
  return <span className="consultation-time"><strong>{timeFormat.format(new Date(startsAt))}</strong><span>– {timeFormat.format(new Date(endsAt))}</span><small>{minutes} min</small></span>
}

function AppointmentList({ appointments, role, busyId, confirmId, now, onCancel, onComplete, onConfirm }: { appointments: Appointment[]; role: 'STUDENT' | 'MENTOR'; busyId: string | null; confirmId: string | null; now: number; onCancel: (id: string) => void; onComplete?: (id: string) => void; onConfirm: (id: string | null) => void }) {
  const upcoming = appointments.filter((item) => item.status === 'CONFIRMED' && Date.parse(item.startsAt) > now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const inProgress = appointments.filter((item) => item.status === 'CONFIRMED' && Date.parse(item.startsAt) <= now && Date.parse(item.endsAt) > now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const history = appointments.filter((item) => !upcoming.includes(item) && !inProgress.includes(item)).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
  const row = (appointment: Appointment, phase: 'upcoming' | 'in-progress' | 'history') => {
    const awaitingOutcome = phase === 'history' && appointment.status === 'CONFIRMED'
    const label = phase === 'upcoming' ? 'Upcoming' : phase === 'in-progress' ? 'In progress' : awaitingOutcome ? 'Awaiting Mentor outcome' : appointment.status === 'COMPLETED' ? 'Completed' : 'Cancelled'
    return <li key={appointment.id} className="consultation-appointment-row">
    <div><span className={`consultation-state state-${awaitingOutcome ? 'awaiting' : phase === 'in-progress' ? 'in-progress' : appointment.status.toLowerCase()}`}>{label}</span><h3>{appointment.topic}</h3><p>{dateTimeFormat.format(new Date(appointment.startsAt))} · {role === 'STUDENT' ? appointment.mentorDisplayName : appointment.studentDisplayName}</p></div>
    {awaitingOutcome && role === 'MENTOR' && onComplete && <button type="button" className="button button-secondary" disabled={busyId === appointment.id} onClick={() => onComplete(appointment.id)}>{busyId === appointment.id ? 'Completing…' : 'Mark completed'}</button>}
    {phase === 'upcoming' && (confirmId === appointment.id ? <div className="consultation-confirm" role="group" aria-label={`Confirm cancellation of ${appointment.topic}`}><span>Cancel this consultation?</span><button type="button" className="button consultation-danger" disabled={busyId === appointment.id} onClick={() => onCancel(appointment.id)}>{busyId === appointment.id ? 'Cancelling…' : 'Yes, cancel'}</button><button type="button" className="button button-secondary" onClick={() => onConfirm(null)}>Keep it</button></div> : <button type="button" className="button button-secondary" onClick={() => onConfirm(appointment.id)}>Cancel</button>)}
  </li>
  }
  return <section className="consultation-records" aria-labelledby="consultation-upcoming-title">
    <div className="consultation-record-section"><div className="consultation-section-heading"><h2 id="consultation-upcoming-title">Upcoming consultations</h2><span>{upcoming.length}</span></div>{upcoming.length ? <ul>{upcoming.map((item) => row(item, 'upcoming'))}</ul> : <p className="consultation-empty">No upcoming consultations.</p>}</div>
    <div className="consultation-record-section"><div className="consultation-section-heading"><h2>In progress</h2><span>{inProgress.length}</span></div>{inProgress.length ? <ul>{inProgress.map((item) => row(item, 'in-progress'))}</ul> : <p className="consultation-empty">Current consultations appear here until they end.</p>}</div>
    <div className="consultation-record-section"><div className="consultation-section-heading"><h2>History</h2><span>{history.length}</span></div>{history.length ? <ul>{history.map((item) => row(item, 'history'))}</ul> : <p className="consultation-empty">Completed, cancelled, and ended consultations will appear here.</p>}</div>
  </section>
}

export function StudentConsultationsPage() {
  const { services } = useServices()
  const now = useCurrentTime()
  const today = dateKey(new Date(now))
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selectedDay, setSelectedDay] = useState(today)
  const [slotState, setSlotState] = useState<{ key: string; kind: 'ready'; items: AvailabilitySlot[] } | { key: string; kind: 'error' } | null>(null)
  const [slotRetry, setSlotRetry] = useState(0)
  const [chosenSlot, setChosenSlot] = useState<string | null>(null)
  const [topic, setTopic] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const appointmentState = useAppointments('STUDENT')
  const range = useMemo(() => monthRange(month), [month])
  const slotKey = `${range.startsAt}:${range.endsAt}:${slotRetry}`

  useEffect(() => {
    return services.scheduling.subscribeOpenSlots(range, (items) => setSlotState({ key: slotKey, kind: 'ready', items }), () => setSlotState({ key: slotKey, kind: 'error' }))
  }, [range, services, slotKey])

  const currentSlots = slotState?.key === slotKey ? slotState : null
  const slots = useMemo(() => currentSlots?.kind === 'ready' ? currentSlots.items.filter((slot) => slot.status === 'OPEN' && Date.parse(slot.startsAt) > now) : [], [currentSlots, now])
  const slotsLoading = currentSlots === null
  const slotsError = currentSlots?.kind === 'error'
  const counts = useMemo(() => { const result = new Map<string, number>(); slots.forEach((slot) => result.set(dateKey(slot.startsAt), (result.get(dateKey(slot.startsAt)) ?? 0) + 1)); return result }, [slots])
  const selectedSlots = slots.filter((slot) => dateKey(slot.startsAt) === selectedDay).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))

  useEffect(() => {
    if (!chosenSlot || currentSlots?.kind !== 'ready') return
    const selected = currentSlots.items.find((slot) => slot.id === chosenSlot)
    if (selected && selected.status === 'OPEN' && Date.parse(selected.startsAt) > now) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setChosenSlot(null)
      setFeedback({ kind: 'error', message: 'That selected time is no longer available. Choose another time.' })
    })
    return () => { active = false }
  }, [chosenSlot, currentSlots, now])

  async function book(event: FormEvent, slot: AvailabilitySlot) {
    event.preventDefault()
    if (!topic.trim()) { setFeedback({ kind: 'error', message: 'Add a short topic so your Mentor knows what to prepare.' }); return }
    setBusyId(slot.id); setFeedback(null)
    try {
      await services.callables.invoke('reserveAppointment', { requestId: crypto.randomUUID(), slotId: slot.id, helpRequestId: null, topic: topic.trim() })
      setFeedback({ kind: 'success', message: `Booked ${fullDate.format(new Date(slot.startsAt))} at ${timeFormat.format(new Date(slot.startsAt))} with ${slot.mentorDisplayName}.` }); setChosenSlot(null); setTopic('')
    } catch (error) {
      const { code, reason } = errorReason(error)
      if (reason === 'SLOT_TAKEN' || reason === 'SLOT_ELAPSED' || code.endsWith('already-exists')) setChosenSlot(null)
      setFeedback({ kind: 'error', message: bookingError(error) })
    }
    finally { setBusyId(null) }
  }

  async function cancel(appointmentId: string) {
    setBusyId(appointmentId); setFeedback(null)
    try { await services.callables.invoke('cancelAppointment', { requestId: crypto.randomUUID(), appointmentId }); setFeedback({ kind: 'success', message: 'The consultation was cancelled and the time is available again.' }); setConfirmId(null) }
    catch { setFeedback({ kind: 'error', message: 'We could not cancel this consultation. Refresh and try again.' }) }
    finally { setBusyId(null) }
  }

  return <section className="consultation-page">
    <header className="consultation-header"><div><h1>Consultations</h1><p>Choose an open time to learn with a Mentor.</p></div><div className="consultation-zone"><Icon name="calendar"/><span>Singapore time<strong>GMT+8</strong></span></div></header>
    {feedback && <p className={`consultation-feedback is-${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}
    <div className="consultation-scheduler">
      <Calendar month={month} selected={selectedDay} counts={counts} now={now} onMonth={setMonth} onSelect={(day) => { setSelectedDay(day); setChosenSlot(null); setFeedback(null) }} />
      <section className="consultation-agenda" aria-labelledby="student-agenda-title"><div className="consultation-agenda-heading"><div><h2 id="student-agenda-title">{fullDate.format(new Date(`${selectedDay}T12:00:00${singaporeOffset}`))}</h2><p>{selectedSlots.length ? `${selectedSlots.length} ${selectedSlots.length === 1 ? 'time is' : 'times are'} available` : 'Available times from active Mentors'}</p></div></div>
        {slotsLoading ? <p className="consultation-loading" role="status">Loading available times…</p> : slotsError ? <div className="consultation-error" role="alert"><p>Availability could not be loaded.</p><button className="button button-secondary" onClick={() => setSlotRetry((value) => value + 1)}>Try again</button></div> : selectedSlots.length ? <ol className="consultation-slot-list">{selectedSlots.map((slot) => <li key={slot.id} className={chosenSlot === slot.id ? 'is-active' : ''}><div className="consultation-slot-main"><TimeRange startsAt={slot.startsAt} endsAt={slot.endsAt}/><span className="consultation-mentor"><strong>{slot.mentorDisplayName}</strong><small>Available Mentor</small></span>{chosenSlot !== slot.id && <button type="button" className="button button-primary" onClick={() => { setChosenSlot(slot.id); setFeedback(null) }}>Choose</button>}</div>{chosenSlot === slot.id && <form className="consultation-book-form" onSubmit={(event) => void book(event, slot)}><label htmlFor={`topic-${slot.id}`}>What would you like help with?</label><input id={`topic-${slot.id}`} value={topic} maxLength={240} autoFocus onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Review my sequence diagram"/><div><button className="button button-primary" disabled={busyId === slot.id}>{busyId === slot.id ? 'Booking…' : 'Confirm booking'}</button><button type="button" className="button button-secondary" onClick={() => { setChosenSlot(null); setTopic('') }}>Choose another time</button></div></form>}</li>)}</ol> : <div className="consultation-empty-day"><Icon name="calendar"/><h3>No availability on this day</h3><p>Choose another highlighted date or check the next month.</p></div>}
      </section>
    </div>
    {appointmentState.loading ? <p className="consultation-loading" role="status">Loading your consultations…</p> : appointmentState.error ? <div className="consultation-error" role="alert"><p>Your consultations could not be loaded.</p><button className="button button-secondary" onClick={appointmentState.retry}>Try again</button></div> : <AppointmentList appointments={appointmentState.appointments} role="STUDENT" busyId={busyId} confirmId={confirmId} now={now} onCancel={(id) => void cancel(id)} onConfirm={setConfirmId}/>}
  </section>
}

export function MentorConsultationsPage() {
  const { services, session } = useServices()
  const now = useCurrentTime()
  const today = dateKey(new Date(now))
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selectedDay, setSelectedDay] = useState(today)
  const [slotState, setSlotState] = useState<{ key: string; kind: 'ready'; items: AvailabilitySlot[] } | { key: string; kind: 'error' } | null>(null)
  const [slotRetry, setSlotRetry] = useState(0)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('09:30')
  const [formErrors, setFormErrors] = useState<AvailabilityErrors>({})
  const startTimeRef = useRef<HTMLInputElement>(null)
  const endTimeRef = useRef<HTMLInputElement>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const appointmentState = useAppointments('MENTOR')
  const range = useMemo(() => monthRange(month), [month])
  const uid = session?.user?.id
  const slotKey = `${uid ?? ''}:${range.startsAt}:${range.endsAt}:${slotRetry}`

  useEffect(() => {
    if (!uid) return
    return services.scheduling.subscribeMentorSlots(uid, range, (items) => setSlotState({ key: slotKey, kind: 'ready', items }), () => setSlotState({ key: slotKey, kind: 'error' }))
  }, [range, services, slotKey, uid])

  const currentSlots = slotState?.key === slotKey ? slotState : null
  const slots = useMemo(() => currentSlots?.kind === 'ready' ? currentSlots.items : [], [currentSlots])
  const slotsLoading = currentSlots === null
  const slotsError = currentSlots?.kind === 'error'
  const counts = useMemo(() => { const result = new Map<string, number>(); slots.forEach((slot) => result.set(dateKey(slot.startsAt), (result.get(dateKey(slot.startsAt)) ?? 0) + 1)); return result }, [slots])
  const selectedSlots = slots.filter((slot) => dateKey(slot.startsAt) === selectedDay).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const appointmentById = useMemo(() => new Map(appointmentState.appointments.map((item) => [item.id, item])), [appointmentState.appointments])

  async function createSlot(event: FormEvent) {
    event.preventDefault(); setFeedback(null)
    const errors = validateAvailabilityForm(selectedDay, startTime, endTime, now)
    setFormErrors(errors)
    if (errors.startTime || errors.endTime) {
      setFeedback({ kind: 'error', message: 'Review the highlighted time and try again.' })
      window.requestAnimationFrame(() => (errors.startTime ? startTimeRef.current : endTimeRef.current)?.focus())
      return
    }
    const startsAt = localIso(selectedDay, startTime); const endsAt = localIso(selectedDay, endTime)
    setBusyId('create')
    try { await services.callables.invoke('createAvailabilitySlot', { requestId: crypto.randomUUID(), startsAt, endsAt }); setFeedback({ kind: 'success', message: `Availability added for ${fullDate.format(new Date(startsAt))} at ${timeFormat.format(new Date(startsAt))}.` }) }
    catch (error) { setFeedback({ kind: 'error', message: slotError(error) }) }
    finally { setBusyId(null) }
  }

  async function withdraw(slotId: string) {
    setBusyId(slotId); setFeedback(null)
    try { await services.callables.invoke('withdrawAvailabilitySlot', { requestId: crypto.randomUUID(), slotId }); setFeedback({ kind: 'success', message: 'The open time was withdrawn.' }) }
    catch { setFeedback({ kind: 'error', message: 'We could not withdraw this time. Refresh and try again.' }) }
    finally { setBusyId(null) }
  }

  async function cancel(appointmentId: string) {
    setBusyId(appointmentId); setFeedback(null)
    try { await services.callables.invoke('cancelAppointment', { requestId: crypto.randomUUID(), appointmentId }); setFeedback({ kind: 'success', message: 'The consultation was cancelled and the time was withdrawn.' }); setConfirmId(null) }
    catch { setFeedback({ kind: 'error', message: 'We could not cancel this consultation. Refresh and try again.' }) }
    finally { setBusyId(null) }
  }

  async function complete(appointmentId: string) {
    setBusyId(appointmentId); setFeedback(null)
    try { await services.callables.invoke('completeAppointment', { requestId: crypto.randomUUID(), appointmentId }); setFeedback({ kind: 'success', message: 'The consultation was marked completed.' }) }
    catch (error) {
      const { code, reason } = errorReason(error)
      setFeedback({ kind: 'error', message: reason === 'APPOINTMENT_NOT_ENDED' ? 'This consultation can only be completed after its end time.' : code.endsWith('permission-denied') || code.endsWith('unauthenticated') ? 'Your account can no longer complete this consultation.' : 'We could not complete this consultation. Refresh and try again.' })
    } finally { setBusyId(null) }
  }

  return <section className="consultation-page consultation-mentor-page">
    <header className="consultation-header"><div><h1>Consultation availability</h1><p>Publish the times when Students can meet with you.</p></div><div className="consultation-zone"><Icon name="calendar"/><span>Singapore time<strong>GMT+8</strong></span></div></header>
    {feedback && <p className={`consultation-feedback is-${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}
    <div className="consultation-scheduler">
      <Calendar month={month} selected={selectedDay} counts={counts} now={now} onMonth={setMonth} onSelect={(day) => { setSelectedDay(day); setConfirmId(null); setFormErrors({}); setFeedback(null) }}/>
      <section className="consultation-agenda" aria-labelledby="mentor-agenda-title"><div className="consultation-agenda-heading"><div><h2 id="mentor-agenda-title">{fullDate.format(new Date(`${selectedDay}T12:00:00${singaporeOffset}`))}</h2><p>Create 30–120 minute openings on half-hour boundaries.</p></div></div>
        <form className="consultation-create-form" noValidate onSubmit={(event) => void createSlot(event)}><label htmlFor="consultation-start-time">Starts</label><div className="consultation-time-field"><input ref={startTimeRef} id="consultation-start-time" type="time" step="1800" value={startTime} aria-invalid={Boolean(formErrors.startTime)} aria-describedby={`consultation-start-hint${formErrors.startTime ? ' consultation-start-error' : ''}`} onChange={(event) => { setStartTime(event.target.value); setFormErrors((value) => ({ ...value, startTime: undefined })) }}/><small id="consultation-start-hint">Singapore time, on :00 or :30</small>{formErrors.startTime && <span id="consultation-start-error" className="consultation-field-error">{formErrors.startTime}</span>}</div><label htmlFor="consultation-end-time">Ends</label><div className="consultation-time-field"><input ref={endTimeRef} id="consultation-end-time" type="time" step="1800" value={endTime} aria-invalid={Boolean(formErrors.endTime)} aria-describedby={`consultation-end-hint${formErrors.endTime ? ' consultation-end-error' : ''}`} onChange={(event) => { setEndTime(event.target.value); setFormErrors((value) => ({ ...value, endTime: undefined })) }}/><small id="consultation-end-hint">30–120 minutes after start</small>{formErrors.endTime && <span id="consultation-end-error" className="consultation-field-error">{formErrors.endTime}</span>}</div><button className="button button-primary" disabled={busyId === 'create' || selectedDay < today}>{busyId === 'create' ? 'Adding…' : 'Add availability'}</button></form>
        {slotsLoading ? <p className="consultation-loading" role="status">Loading your availability…</p> : slotsError ? <div className="consultation-error" role="alert"><p>Your availability could not be loaded.</p><button className="button button-secondary" onClick={() => setSlotRetry((value) => value + 1)}>Try again</button></div> : selectedSlots.length ? <ol className="consultation-slot-list mentor-slot-list">{selectedSlots.map((slot) => { const appointment = slot.appointmentId ? appointmentById.get(slot.appointmentId) : undefined; const elapsed = Date.parse(slot.endsAt) <= now; const state = elapsed ? 'ELAPSED' : slot.status; return <li key={slot.id}><div className="consultation-slot-main"><TimeRange startsAt={slot.startsAt} endsAt={slot.endsAt}/><span className={`consultation-state state-${state.toLowerCase()}`}>{state.toLowerCase()}</span>{state === 'OPEN' && <button className="button button-secondary" disabled={busyId === slot.id} onClick={() => void withdraw(slot.id)}>{busyId === slot.id ? 'Withdrawing…' : 'Withdraw'}</button>}</div>{appointment && <div className="consultation-booking-detail"><div><strong>{appointment.studentDisplayName}</strong><p>{appointment.topic}</p></div>{appointment.status === 'CONFIRMED' && Date.parse(appointment.startsAt) > now && (confirmId === appointment.id ? <div className="consultation-confirm" role="group" aria-label={`Confirm cancellation of ${appointment.topic}`}><span>Cancel and withdraw this time?</span><button className="button consultation-danger" disabled={busyId === appointment.id} onClick={() => void cancel(appointment.id)}>{busyId === appointment.id ? 'Cancelling…' : 'Yes, cancel'}</button><button className="button button-secondary" onClick={() => setConfirmId(null)}>Keep it</button></div> : <button className="button button-secondary" onClick={() => setConfirmId(appointment.id)}>Cancel consultation</button>)}</div>}</li> })}</ol> : <div className="consultation-empty-day"><Icon name="calendar"/><h3>No availability on this day</h3><p>Choose a future date and add the times that suit you.</p></div>}
      </section>
    </div>
    {appointmentState.loading ? <p className="consultation-loading" role="status">Loading your consultations…</p> : appointmentState.error ? <div className="consultation-error" role="alert"><p>Your consultations could not be loaded.</p><button className="button button-secondary" onClick={appointmentState.retry}>Try again</button></div> : <AppointmentList appointments={appointmentState.appointments} role="MENTOR" busyId={busyId} confirmId={confirmId} now={now} onCancel={(id) => void cancel(id)} onComplete={(id) => void complete(id)} onConfirm={setConfirmId}/>}
  </section>
}
