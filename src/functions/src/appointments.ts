import { createHash } from 'node:crypto'
import { Timestamp, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import {
  appointmentSchema,
  availabilitySlotSchema,
  userSchema,
  type Appointment,
  type AvailabilitySlot,
  type CancelAppointmentInput,
  type CompleteAppointmentInput,
  type CreateAvailabilitySlotInput,
  type ReserveAppointmentInput,
  type WithdrawAvailabilitySlotInput,
} from '@helpinus/shared'
import { requireActiveUser, requireCurrentMentor, requireCurrentStudent, type AuthorizedUser } from './auth.js'

type StoredSlot = Omit<AvailabilitySlot, 'startsAt' | 'endsAt' | 'createdAt' | 'updatedAt'> & {
  startsAt: Timestamp
  endsAt: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}
type StoredAppointment = Omit<Appointment, 'startsAt' | 'endsAt' | 'createdAt' | 'updatedAt'> & {
  startsAt: Timestamp
  endsAt: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}

const halfHourMs = 30 * 60 * 1000
const maximumDurationMs = 120 * 60 * 1000

const failIntegrity = (): never => {
  throw new HttpsError('failed-precondition', 'Consultation data needs support review.', { reason: 'INTEGRITY_ERROR' })
}
const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : value
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const operationRef = (db: Firestore, uid: string, requestId: string) => db.collection('appointmentOperations').doc(uid).collection('operations').doc(requestId)
const lockId = (mentorId: string, bucket: number) => digest([mentorId, bucket])
const bucketStarts = (startsAt: number, endsAt: number) => {
  const result: number[] = []
  for (let value = startsAt; value < endsAt; value += halfHourMs) result.push(value)
  return result
}

export function availabilityWindowIssue(startsAt: string, endsAt: string, nowMs: number): string | null {
  const start = Date.parse(startsAt)
  const end = Date.parse(endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'INVALID_WINDOW'
  if (start <= nowMs) return 'PAST_SLOT'
  if (start % halfHourMs !== 0 || end % halfHourMs !== 0) return 'UNALIGNED_SLOT'
  const duration = end - start
  if (duration < halfHourMs || duration > maximumDurationMs || duration % halfHourMs !== 0) return 'INVALID_DURATION'
  return null
}

function validateWindow(startsAt: string, endsAt: string, nowMs: number) {
  const issue = availabilityWindowIssue(startsAt, endsAt, nowMs)
  if (issue === 'PAST_SLOT') throw new HttpsError('failed-precondition', 'Choose a future consultation time.', { reason: issue })
  if (issue === 'UNALIGNED_SLOT') throw new HttpsError('invalid-argument', 'Consultations must start and end on a 30-minute boundary.', { reason: issue })
  if (issue === 'INVALID_DURATION') throw new HttpsError('invalid-argument', 'Consultations must last between 30 and 120 minutes in 30-minute increments.', { reason: issue })
  if (issue) throw new HttpsError('invalid-argument', 'The consultation time is invalid.', { reason: issue })
}

function parseUser(snapshot: DocumentSnapshot, expected: AuthorizedUser) {
  const raw = snapshot.data()
  const parsed = userSchema.safeParse({ ...raw, createdAt: iso(raw?.createdAt) })
  if (!parsed.success || parsed.data.id !== expected.uid || parsed.data.email !== expected.email || parsed.data.role !== expected.role || parsed.data.status !== 'ACTIVE') {
    throw new HttpsError('permission-denied', 'Account access has changed.')
  }
  return parsed.data
}

function parseSlot(snapshot: DocumentSnapshot): { stored: StoredSlot; public: AvailabilitySlot } {
  if (!snapshot.exists) throw new HttpsError('not-found', 'This availability slot is no longer available.', { reason: 'SLOT_UNAVAILABLE' })
  const raw = snapshot.data()
  const parsed = availabilitySlotSchema.safeParse({
    ...raw,
    id: snapshot.id,
    startsAt: iso(raw?.startsAt),
    endsAt: iso(raw?.endsAt),
    createdAt: iso(raw?.createdAt),
    updatedAt: iso(raw?.updatedAt),
  })
  const timestamps = raw?.startsAt instanceof Timestamp && raw?.endsAt instanceof Timestamp && raw?.createdAt instanceof Timestamp && raw?.updatedAt instanceof Timestamp
  const linkValid = parsed.success && ((parsed.data.status === 'OPEN' && parsed.data.appointmentId === null) || (parsed.data.status === 'BOOKED' && parsed.data.appointmentId !== null) || parsed.data.status === 'WITHDRAWN')
  if (!parsed.success || !timestamps || parsed.data.id !== snapshot.id || !linkValid) return failIntegrity()
  return { stored: raw as StoredSlot, public: parsed.data }
}

function parseAppointment(snapshot: DocumentSnapshot): { stored: StoredAppointment; public: Appointment } {
  if (!snapshot.exists) throw new HttpsError('not-found', 'This consultation is no longer available.', { reason: 'APPOINTMENT_UNAVAILABLE' })
  const raw = snapshot.data()
  const parsed = appointmentSchema.safeParse({
    ...raw,
    id: snapshot.id,
    startsAt: iso(raw?.startsAt),
    endsAt: iso(raw?.endsAt),
    createdAt: iso(raw?.createdAt),
    updatedAt: iso(raw?.updatedAt),
  })
  const timestamps = raw?.startsAt instanceof Timestamp && raw?.endsAt instanceof Timestamp && raw?.createdAt instanceof Timestamp && raw?.updatedAt instanceof Timestamp
  const cancellationValid = parsed.success && (parsed.data.status === 'CANCELLED' ? parsed.data.cancelledBy !== null : parsed.data.cancelledBy === null)
  if (!parsed.success || !timestamps || parsed.data.id !== snapshot.id || !cancellationValid) return failIntegrity()
  return { stored: raw as StoredAppointment, public: parsed.data }
}

function receiptResult(receipt: DocumentSnapshot, action: string, actorId: string, fingerprint: string) {
  if (!receipt.exists) return null
  const data = receipt.data()
  if (data?.action !== action || data.actorId !== actorId || data.fingerprint !== fingerprint || typeof data.resultId !== 'string') {
    throw new HttpsError('invalid-argument', 'Request ID was reused with different content.', { reason: 'OPERATION_ID_REUSED' })
  }
  return data.resultId as string
}

export async function createAvailabilitySlotHandler(input: CreateAvailabilitySlotInput, request: CallableRequest<unknown>, db: Firestore) {
  const actor = await requireCurrentMentor(request)
  validateWindow(input.startsAt, input.endsAt, Date.now())
  const fingerprint = digest(['CREATE_SLOT', input.startsAt, input.endsAt])
  const receiptRef = operationRef(db, actor.uid, input.requestId)
  const mentorRef = db.collection('users').doc(actor.uid)
  const profileRef = db.collection('mentorProfiles').doc(actor.uid)
  const slotRef = db.collection('availabilitySlots').doc()
  const startMs = Date.parse(input.startsAt)
  const endMs = Date.parse(input.endsAt)
  const locks = bucketStarts(startMs, endMs).map((bucket) => db.collection('availabilitySlotLocks').doc(lockId(actor.uid, bucket)))

  return db.runTransaction(async (tx) => {
    const [receipt, mentor, profile] = await Promise.all([tx.get(receiptRef), tx.get(mentorRef), tx.get(profileRef)])
    const mentorUser = parseUser(mentor, actor)
    if (!profile.exists || profile.data()?.userId !== actor.uid || profile.data()?.active !== true) {
      throw new HttpsError('failed-precondition', 'Your Mentor profile is not available for consultation scheduling.', { reason: 'MENTOR_INACTIVE' })
    }
    const priorId = receiptResult(receipt, 'CREATE_SLOT', actor.uid, fingerprint)
    if (priorId) return { slot: parseSlot(await tx.get(db.collection('availabilitySlots').doc(priorId))).public }
    const lockSnapshots = await Promise.all(locks.map((ref) => tx.get(ref)))
    if (lockSnapshots.some((item) => item.exists)) throw new HttpsError('already-exists', 'This time overlaps existing availability.', { reason: 'SLOT_OVERLAP' })
    const now = Timestamp.now()
    if (startMs <= now.toMillis()) throw new HttpsError('failed-precondition', 'Choose a future consultation time.', { reason: 'PAST_SLOT' })
    const stored: StoredSlot = {
      id: slotRef.id,
      mentorId: actor.uid,
      mentorDisplayName: mentorUser.displayName,
      startsAt: Timestamp.fromMillis(startMs),
      endsAt: Timestamp.fromMillis(endMs),
      status: 'OPEN',
      appointmentId: null,
      createdAt: now,
      updatedAt: now,
    }
    tx.create(slotRef, stored)
    locks.forEach((ref, index) => tx.create(ref, { mentorId: actor.uid, slotId: slotRef.id, bucketStartsAt: Timestamp.fromMillis(startMs + index * halfHourMs) }))
    tx.create(receiptRef, { action: 'CREATE_SLOT', actorId: actor.uid, fingerprint, resultId: slotRef.id })
    return { slot: availabilitySlotSchema.parse({ ...stored, startsAt: iso(stored.startsAt), endsAt: iso(stored.endsAt), createdAt: iso(now), updatedAt: iso(now) }) }
  })
}

export async function withdrawAvailabilitySlotHandler(input: WithdrawAvailabilitySlotInput, request: CallableRequest<unknown>, db: Firestore) {
  const actor = await requireCurrentMentor(request)
  const fingerprint = digest(['WITHDRAW_SLOT', input.slotId])
  const receiptRef = operationRef(db, actor.uid, input.requestId)
  const mentorRef = db.collection('users').doc(actor.uid)
  const slotRef = db.collection('availabilitySlots').doc(input.slotId)
  return db.runTransaction(async (tx) => {
    const [receipt, mentor, slotSnapshot] = await Promise.all([tx.get(receiptRef), tx.get(mentorRef), tx.get(slotRef)])
    parseUser(mentor, actor)
    const slot = parseSlot(slotSnapshot)
    if (slot.public.mentorId !== actor.uid) throw new HttpsError('permission-denied', 'You can only change your own availability.')
    const priorId = receiptResult(receipt, 'WITHDRAW_SLOT', actor.uid, fingerprint)
    if (priorId) {
      if (priorId !== slot.public.id) return failIntegrity()
      return { slot: slot.public }
    }
    if (slot.public.status === 'BOOKED') throw new HttpsError('failed-precondition', 'Cancel the booked consultation instead.', { reason: 'SLOT_BOOKED' })
    if (slot.public.status === 'WITHDRAWN') return { slot: slot.public }
    if (Date.parse(slot.public.startsAt) <= Date.now()) throw new HttpsError('failed-precondition', 'Elapsed availability cannot be withdrawn.', { reason: 'SLOT_ELAPSED' })
    const lockRefs = bucketStarts(Date.parse(slot.public.startsAt), Date.parse(slot.public.endsAt)).map((bucket) => db.collection('availabilitySlotLocks').doc(lockId(actor.uid, bucket)))
    const lockSnapshots = await Promise.all(lockRefs.map((ref) => tx.get(ref)))
    if (lockSnapshots.some((item) => !item.exists || item.data()?.slotId !== slot.public.id || item.data()?.mentorId !== actor.uid)) return failIntegrity()
    const now = Timestamp.now()
    tx.update(slotRef, { status: 'WITHDRAWN', appointmentId: null, updatedAt: now })
    lockRefs.forEach((ref) => tx.delete(ref))
    tx.create(receiptRef, { action: 'WITHDRAW_SLOT', actorId: actor.uid, fingerprint, resultId: slot.public.id })
    return { slot: availabilitySlotSchema.parse({ ...slot.public, status: 'WITHDRAWN', appointmentId: null, updatedAt: iso(now) }) }
  })
}

export async function reserveAppointmentHandler(input: ReserveAppointmentInput, request: CallableRequest<unknown>, db: Firestore) {
  const actor = await requireCurrentStudent(request)
  const fingerprint = digest(['RESERVE_APPOINTMENT', input.slotId, input.helpRequestId, input.topic])
  const receiptRef = operationRef(db, actor.uid, input.requestId)
  const studentRef = db.collection('users').doc(actor.uid)
  const slotRef = db.collection('availabilitySlots').doc(input.slotId)
  const appointmentRef = db.collection('appointments').doc()
  return db.runTransaction(async (tx) => {
    const [receipt, student, slotSnapshot] = await Promise.all([tx.get(receiptRef), tx.get(studentRef), tx.get(slotRef)])
    const studentUser = parseUser(student, actor)
    const priorId = receiptResult(receipt, 'RESERVE_APPOINTMENT', actor.uid, fingerprint)
    if (priorId) {
      const prior = parseAppointment(await tx.get(db.collection('appointments').doc(priorId))).public
      if (prior.studentId !== actor.uid || prior.slotId !== input.slotId) return failIntegrity()
      return { appointment: prior }
    }
    const slot = parseSlot(slotSnapshot)
    const mentorRef = db.collection('users').doc(slot.public.mentorId)
    const profileRef = db.collection('mentorProfiles').doc(slot.public.mentorId)
    const helpRequestRef = input.helpRequestId ? db.collection('helpRequests').doc(input.helpRequestId) : null
    const [mentor, profile, helpRequest] = await Promise.all([
      tx.get(mentorRef),
      tx.get(profileRef),
      helpRequestRef ? tx.get(helpRequestRef) : Promise.resolve(null),
    ])
    const mentorRaw = mentor.data()
    const mentorParsed = userSchema.safeParse({ ...mentorRaw, createdAt: iso(mentorRaw?.createdAt) })
    if (!mentorParsed.success || mentorParsed.data.id !== slot.public.mentorId || mentorParsed.data.role !== 'MENTOR' || mentorParsed.data.status !== 'ACTIVE' || !profile.exists || profile.data()?.userId !== slot.public.mentorId || profile.data()?.active !== true) {
      throw new HttpsError('failed-precondition', 'This Mentor is no longer available.', { reason: 'MENTOR_INACTIVE' })
    }
    if (helpRequest && (!helpRequest.exists || helpRequest.data()?.studentId !== actor.uid || helpRequest.data()?.mentorId !== slot.public.mentorId || helpRequest.data()?.status !== 'ACCEPTED')) {
      throw new HttpsError('failed-precondition', 'The linked help request is not eligible.', { reason: 'HELP_REQUEST_INELIGIBLE' })
    }
    if (slot.public.status !== 'OPEN' || slot.public.appointmentId !== null) throw new HttpsError('already-exists', 'Someone else booked this time. Choose another slot.', { reason: 'SLOT_TAKEN' })
    if (Date.parse(slot.public.startsAt) <= Date.now()) throw new HttpsError('failed-precondition', 'This time has already passed.', { reason: 'SLOT_ELAPSED' })
    const now = Timestamp.now()
    const stored: StoredAppointment = {
      id: appointmentRef.id,
      slotId: slot.public.id,
      studentId: actor.uid,
      studentDisplayName: studentUser.displayName,
      mentorId: slot.public.mentorId,
      mentorDisplayName: mentorParsed.data.displayName,
      helpRequestId: input.helpRequestId,
      topic: input.topic,
      status: 'CONFIRMED',
      startsAt: slot.stored.startsAt,
      endsAt: slot.stored.endsAt,
      cancelledBy: null,
      createdAt: now,
      updatedAt: now,
    }
    tx.create(appointmentRef, stored)
    tx.update(slotRef, { status: 'BOOKED', appointmentId: appointmentRef.id, updatedAt: now })
    tx.create(receiptRef, { action: 'RESERVE_APPOINTMENT', actorId: actor.uid, fingerprint, resultId: appointmentRef.id })
    return { appointment: appointmentSchema.parse({ ...stored, startsAt: iso(stored.startsAt), endsAt: iso(stored.endsAt), createdAt: iso(now), updatedAt: iso(now) }) }
  })
}

export async function cancelAppointmentHandler(input: CancelAppointmentInput, request: CallableRequest<unknown>, db: Firestore) {
  const actor = await requireActiveUser(request)
  const fingerprint = digest(['CANCEL_APPOINTMENT', input.appointmentId])
  const receiptRef = operationRef(db, actor.uid, input.requestId)
  const actorRef = db.collection('users').doc(actor.uid)
  const appointmentRef = db.collection('appointments').doc(input.appointmentId)
  return db.runTransaction(async (tx) => {
    const [receipt, actorSnapshot, appointmentSnapshot] = await Promise.all([tx.get(receiptRef), tx.get(actorRef), tx.get(appointmentRef)])
    parseUser(actorSnapshot, actor)
    const priorId = receiptResult(receipt, 'CANCEL_APPOINTMENT', actor.uid, fingerprint)
    if (priorId) return { appointment: parseAppointment(await tx.get(db.collection('appointments').doc(priorId))).public }
    const appointment = parseAppointment(appointmentSnapshot)
    const ownsAppointment = actor.role === 'STUDENT' ? appointment.public.studentId === actor.uid : appointment.public.mentorId === actor.uid
    if (!ownsAppointment) throw new HttpsError('permission-denied', 'You can only cancel your own consultation.')
    if (appointment.public.status !== 'CONFIRMED') throw new HttpsError('failed-precondition', 'Only a confirmed consultation can be cancelled.', { reason: 'APPOINTMENT_NOT_CONFIRMED' })
    if (Date.parse(appointment.public.startsAt) <= Date.now()) throw new HttpsError('failed-precondition', 'Elapsed consultations cannot be cancelled.', { reason: 'APPOINTMENT_ELAPSED' })
    const slotRef = db.collection('availabilitySlots').doc(appointment.public.slotId)
    const slot = parseSlot(await tx.get(slotRef))
    if (slot.public.status !== 'BOOKED' || slot.public.appointmentId !== appointment.public.id || slot.public.mentorId !== appointment.public.mentorId) return failIntegrity()
    const lockRefs = actor.role === 'MENTOR' ? bucketStarts(Date.parse(slot.public.startsAt), Date.parse(slot.public.endsAt)).map((bucket) => db.collection('availabilitySlotLocks').doc(lockId(actor.uid, bucket))) : []
    const lockSnapshots = await Promise.all(lockRefs.map((ref) => tx.get(ref)))
    if (lockSnapshots.some((item) => !item.exists || item.data()?.slotId !== slot.public.id || item.data()?.mentorId !== actor.uid)) return failIntegrity()
    const now = Timestamp.now()
    tx.update(appointmentRef, { status: 'CANCELLED', cancelledBy: actor.role, updatedAt: now })
    tx.update(slotRef, actor.role === 'STUDENT'
      ? { status: 'OPEN', appointmentId: null, updatedAt: now }
      : { status: 'WITHDRAWN', appointmentId: appointment.public.id, updatedAt: now })
    lockRefs.forEach((ref) => tx.delete(ref))
    tx.create(receiptRef, { action: 'CANCEL_APPOINTMENT', actorId: actor.uid, fingerprint, resultId: appointment.public.id })
    return { appointment: appointmentSchema.parse({ ...appointment.public, status: 'CANCELLED', cancelledBy: actor.role, updatedAt: iso(now) }) }
  })
}

export async function completeAppointmentHandler(input: CompleteAppointmentInput, request: CallableRequest<unknown>, db: Firestore) {
  const actor = await requireCurrentMentor(request)
  const fingerprint = digest(['COMPLETE_APPOINTMENT', input.appointmentId])
  const receiptRef = operationRef(db, actor.uid, input.requestId)
  const actorRef = db.collection('users').doc(actor.uid)
  const appointmentRef = db.collection('appointments').doc(input.appointmentId)
  return db.runTransaction(async (tx) => {
    const [receipt, actorSnapshot, appointmentSnapshot] = await Promise.all([tx.get(receiptRef), tx.get(actorRef), tx.get(appointmentRef)])
    parseUser(actorSnapshot, actor)
    const priorId = receiptResult(receipt, 'COMPLETE_APPOINTMENT', actor.uid, fingerprint)
    if (priorId) return { appointment: parseAppointment(await tx.get(db.collection('appointments').doc(priorId))).public }
    const appointment = parseAppointment(appointmentSnapshot)
    if (appointment.public.mentorId !== actor.uid) throw new HttpsError('permission-denied', 'You can only complete your own consultation.')
    if (appointment.public.status !== 'CONFIRMED') throw new HttpsError('failed-precondition', 'Only a confirmed consultation can be completed.', { reason: 'APPOINTMENT_NOT_CONFIRMED' })
    if (Date.parse(appointment.public.startsAt) > Date.now()) throw new HttpsError('failed-precondition', 'A consultation cannot be completed before it starts.', { reason: 'APPOINTMENT_NOT_STARTED' })
    const now = Timestamp.now()
    tx.update(appointmentRef, { status: 'COMPLETED', updatedAt: now })
    tx.create(receiptRef, { action: 'COMPLETE_APPOINTMENT', actorId: actor.uid, fingerprint, resultId: appointment.public.id })
    return { appointment: appointmentSchema.parse({ ...appointment.public, status: 'COMPLETED', updatedAt: iso(now) }) }
  })
}
