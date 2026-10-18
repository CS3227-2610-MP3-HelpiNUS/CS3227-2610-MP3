import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Appointment, AvailabilitySlot, User } from '@helpinus/shared'
import { MentorConsultationsPage, StudentConsultationsPage } from '../pages/ConsultationPages'
import { validateAvailabilityForm } from '../utils/consultationTime'
import { ServiceProvider } from '../services/ServiceProvider'
import type { HelpiNUSServices } from '../services/contracts'
import { mockDashboard, mockServices } from '../services/mockServices'

const fullDate = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' })

function dayKey(daysAhead: number) {
  const parts = dateParts.formatToParts(new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000))
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function dayInNextMonth(day: string) {
  const [year, month, dayNumber] = day.split('-').map(Number)
  const next = new Date(Date.UTC(year, month, 1))
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(dayNumber, lastDay)).padStart(2, '0')}`
}

function pageServices(user: User, slots: AvailabilitySlot[], appointments: Appointment[], invoke: HelpiNUSServices['callables']['invoke']): HelpiNUSServices {
  return {
    ...mockServices,
    session: { ...mockServices.session, getCurrent: async () => ({ user }), subscribe: (listener) => { listener({ user }); return () => {} } },
    scheduling: {
      subscribeOpenSlots(_range, onData) { onData(slots); return () => {} },
      subscribeMentorSlots(_uid, _range, onData) { onData(slots); return () => {} },
      subscribeAppointments(_uid, _role, onData) { onData(appointments); return () => {} },
    },
    callables: { invoke },
  }
}

function renderPage(path: string, element: ReactNode, services: HelpiNUSServices) {
  const router = createMemoryRouter([{ path, element }], { initialEntries: [path] })
  return render(<ServiceProvider servicesOverride={services}><RouterProvider router={router} /></ServiceProvider>)
}

describe('consultation scheduling UI', () => {
  it('rejects invalid Mentor time ranges with precise field errors', () => {
    const now = Date.parse('2026-10-18T00:00:00.000Z')
    expect(validateAvailabilityForm('2026-10-18', '09:00', '09:00', now)).toEqual({ endTime: 'End time must be later than start time.' })
    expect(validateAvailabilityForm('2026-10-18', '09:00', '09:29', now)).toEqual({ endTime: 'Availability must be at least 30 minutes.' })
    expect(validateAvailabilityForm('2026-10-18', '09:15', '09:45', now)).toEqual({ startTime: 'Use a start time ending in :00 or :30.' })
    expect(validateAvailabilityForm('2026-10-18', '09:00', '11:30', now)).toEqual({ endTime: 'Availability cannot exceed 120 minutes.' })
    expect(validateAvailabilityForm('2026-10-17', '09:00', '09:30', now)).toEqual({ startTime: 'Past dates cannot be selected.' })
  })

  it('makes past calendar dates unavailable to pointer and keyboard users', async () => {
    const yesterday = dayKey(-1)
    renderPage('/student/consultations', <StudentConsultationsPage />, pageServices(mockDashboard.user, [], [], vi.fn() as unknown as HelpiNUSServices['callables']['invoke']))

    const date = await screen.findByRole('button', { name: `Unavailable, past date, ${fullDate.format(new Date(`${yesterday}T12:00:00+08:00`))}` })
    expect(date).toBeDisabled()
    expect(date).toHaveClass('is-past')
  })

  it('lets a Student select an available day, provide a topic, and request an immediate booking', async () => {
    const user = userEvent.setup()
    const day = dayKey(1)
    const startsAt = new Date(`${day}T09:00:00+08:00`).toISOString()
    const endsAt = new Date(`${day}T09:30:00+08:00`).toISOString()
    const slot: AvailabilitySlot = { id: 'slot-open', mentorId: 'mentor-1', mentorDisplayName: 'Mentor One', startsAt, endsAt, status: 'OPEN', appointmentId: null, createdAt: startsAt, updatedAt: startsAt }
    const invoke = vi.fn(async (name: string, input: { topic?: string }) => {
      expect(name).toBe('reserveAppointment')
      const appointment: Appointment = { id: 'appointment-1', slotId: slot.id, studentId: mockDashboard.user.id, studentDisplayName: mockDashboard.user.displayName, mentorId: slot.mentorId, mentorDisplayName: slot.mentorDisplayName, helpRequestId: null, topic: input.topic ?? '', status: 'CONFIRMED', startsAt, endsAt, cancelledBy: null, createdAt: startsAt, updatedAt: startsAt }
      return { appointment }
    }) as unknown as HelpiNUSServices['callables']['invoke']
    renderPage('/student/consultations', <StudentConsultationsPage />, pageServices(mockDashboard.user, [slot], [], invoke))

    await user.click(await screen.findByRole('button', { name: `${fullDate.format(new Date(`${day}T12:00:00+08:00`))}, 1 slot` }))
    await user.click(screen.getByRole('button', { name: 'Choose' }))
    await user.type(screen.getByLabelText('What would you like help with?'), 'Review my sequence diagram')
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Booked')
    expect(invoke).toHaveBeenCalledWith('reserveAppointment', expect.objectContaining({ slotId: slot.id, helpRequestId: null, topic: 'Review my sequence diagram' }))
  })

  it('explains a stale-slot race without showing a false confirmation', async () => {
    const user = userEvent.setup()
    const day = dayKey(1)
    const startsAt = new Date(`${day}T10:00:00+08:00`).toISOString()
    const endsAt = new Date(`${day}T10:30:00+08:00`).toISOString()
    const slot: AvailabilitySlot = { id: 'slot-raced', mentorId: 'mentor-1', mentorDisplayName: 'Mentor One', startsAt, endsAt, status: 'OPEN', appointmentId: null, createdAt: startsAt, updatedAt: startsAt }
    const invoke = vi.fn(async () => { throw Object.assign(new Error('taken'), { code: 'functions/already-exists', details: { reason: 'SLOT_TAKEN' } }) }) as unknown as HelpiNUSServices['callables']['invoke']
    renderPage('/student/consultations', <StudentConsultationsPage />, pageServices(mockDashboard.user, [slot], [], invoke))

    await user.click(await screen.findByRole('button', { name: `${fullDate.format(new Date(`${day}T12:00:00+08:00`))}, 1 slot` }))
    await user.click(screen.getByRole('button', { name: 'Choose' }))
    await user.type(screen.getByLabelText('What would you like help with?'), 'Concurrency question')
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('just booked')
    expect(screen.queryByText(/^Booked /)).not.toBeInTheDocument()
  })

  it('explains a Student overlap and preserves the topic for another choice', async () => {
    const user = userEvent.setup()
    const day = dayKey(1)
    const startsAt = new Date(`${day}T10:00:00+08:00`).toISOString()
    const endsAt = new Date(`${day}T10:30:00+08:00`).toISOString()
    const slot: AvailabilitySlot = { id: 'slot-overlap', mentorId: 'mentor-1', mentorDisplayName: 'Mentor One', startsAt, endsAt, status: 'OPEN', appointmentId: null, createdAt: startsAt, updatedAt: startsAt }
    const invoke = vi.fn(async () => { throw Object.assign(new Error('overlap'), { code: 'functions/already-exists', details: { reason: 'STUDENT_OVERLAP' } }) }) as unknown as HelpiNUSServices['callables']['invoke']
    renderPage('/student/consultations', <StudentConsultationsPage />, pageServices(mockDashboard.user, [slot], [], invoke))

    await user.click(await screen.findByRole('button', { name: `${fullDate.format(new Date(`${day}T12:00:00+08:00`))}, 1 slot` }))
    await user.click(screen.getByRole('button', { name: 'Choose' }))
    await user.type(screen.getByLabelText('What would you like help with?'), 'Keep this topic')
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already have another consultation')
    await user.click(screen.getByRole('button', { name: 'Choose' }))
    expect(screen.getByLabelText('What would you like help with?')).toHaveValue('Keep this topic')
  })

  it('moves a confirmed appointment from upcoming to in progress as time advances', async () => {
    vi.useFakeTimers()
    try {
      const now = new Date('2026-10-18T00:00:00.000Z')
      vi.setSystemTime(now)
      const mentor = mockDashboard.mentors[0].user
      const startsAt = new Date(now.getTime() + 30_000).toISOString()
      const endsAt = new Date(now.getTime() + 90_000).toISOString()
      const appointment: Appointment = { id: 'clock-appointment', slotId: 'clock-slot', studentId: mockDashboard.user.id, studentDisplayName: mockDashboard.user.displayName, mentorId: mentor.id, mentorDisplayName: mentor.displayName, helpRequestId: null, topic: 'Clock transition', status: 'CONFIRMED', startsAt, endsAt, cancelledBy: null, createdAt: now.toISOString(), updatedAt: now.toISOString() }
      renderPage('/mentor/consultations', <MentorConsultationsPage />, pageServices(mentor, [], [appointment], vi.fn() as unknown as HelpiNUSServices['callables']['invoke']))
      await act(async () => { await Promise.resolve() })

      expect(screen.getByText('Upcoming')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(screen.getByText('In progress', { selector: '.consultation-state' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets a Mentor publish a future half-hour opening', async () => {
    const user = userEvent.setup()
    const mentor = mockDashboard.mentors[0].user
    const day = dayKey(1)
    const invoke = vi.fn(async (name: string, input: { startsAt?: string; endsAt?: string }) => {
      expect(name).toBe('createAvailabilitySlot')
      const slot: AvailabilitySlot = { id: 'slot-new', mentorId: mentor.id, mentorDisplayName: mentor.displayName, startsAt: input.startsAt ?? '', endsAt: input.endsAt ?? '', status: 'OPEN', appointmentId: null, createdAt: input.startsAt ?? '', updatedAt: input.startsAt ?? '' }
      return { slot }
    }) as unknown as HelpiNUSServices['callables']['invoke']
    renderPage('/mentor/consultations', <MentorConsultationsPage />, pageServices(mentor, [], [], invoke))

    await user.click(await screen.findByRole('button', { name: fullDate.format(new Date(`${day}T12:00:00+08:00`)) }))
    await user.click(screen.getByRole('button', { name: 'Add availability' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Availability added')
    expect(invoke).toHaveBeenCalledWith('createAvailabilitySlot', expect.objectContaining({ startsAt: new Date(`${day}T09:00:00+08:00`).toISOString(), endsAt: new Date(`${day}T09:30:00+08:00`).toISOString() }))
  })

  it('keeps the selected day and Mentor form in the month being viewed', async () => {
    const user = userEvent.setup()
    const mentor = mockDashboard.mentors[0].user
    const expectedDay = dayInNextMonth(dayKey(0))
    const invoke = vi.fn(async (_name: string, input: { startsAt?: string; endsAt?: string }) => ({ slot: { id: 'slot-next-month', mentorId: mentor.id, mentorDisplayName: mentor.displayName, startsAt: input.startsAt ?? '', endsAt: input.endsAt ?? '', status: 'OPEN', appointmentId: null, createdAt: input.startsAt ?? '', updatedAt: input.startsAt ?? '' } })) as unknown as HelpiNUSServices['callables']['invoke']
    renderPage('/mentor/consultations', <MentorConsultationsPage />, pageServices(mentor, [], [], invoke))

    await user.click(screen.getByRole('button', { name: 'Next month' }))

    expect(screen.getByRole('heading', { name: fullDate.format(new Date(`${expectedDay}T12:00:00+08:00`)) })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add availability' }))
    expect(invoke).toHaveBeenCalledWith('createAvailabilitySlot', expect.objectContaining({ startsAt: new Date(`${expectedDay}T09:00:00+08:00`).toISOString() }))
  })
})
