import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { Timestamp, getFirestore } from 'firebase-admin/firestore'
import {
  cancelAppointmentOutputSchema,
  completeAppointmentOutputSchema,
  createAvailabilitySlotOutputSchema,
  reserveAppointmentOutputSchema,
  withdrawAvailabilitySlotOutputSchema,
  type CancelAppointmentInput,
  type CompleteAppointmentInput,
  type CreateAvailabilitySlotInput,
  type ReserveAppointmentInput,
  type WithdrawAvailabilitySlotInput,
} from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const roles = ['studentA', 'studentB', 'mentor', 'mentorB'] as const
type Client = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `appointments-${role}` }, `appointments-${role}`)])) as Record<Client, ReturnType<typeof initializeApp>>
const admin = initializeAdminApp({ projectId }, 'appointments-admin')
const adminAuth = getAdminAuth(admin)
const db = getFirestore(admin)
const ids = {} as Record<Client, string>

function emulatorAddress(environmentName: string, fallback: string) {
  const value = process.env[environmentName] ?? fallback
  const separator = value.lastIndexOf(':')
  return { host: value.slice(0, separator), port: Number(value.slice(separator + 1)) }
}

const authEmulator = emulatorAddress('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')
const functionsEmulator = emulatorAddress('FUNCTIONS_EMULATOR_HOST', '127.0.0.1:5001')

const callable = <Input>(client: Client, name: string) => httpsCallable<Input, unknown>(getFunctions(apps[client], 'asia-southeast1'), name)
const createSlot = callable<CreateAvailabilitySlotInput>('mentor', 'createAvailabilitySlot')
const createSlotB = callable<CreateAvailabilitySlotInput>('mentorB', 'createAvailabilitySlot')
const withdrawSlot = callable<WithdrawAvailabilitySlotInput>('mentor', 'withdrawAvailabilitySlot')
const reserveA = callable<ReserveAppointmentInput>('studentA', 'reserveAppointment')
const reserveB = callable<ReserveAppointmentInput>('studentB', 'reserveAppointment')
const cancelA = callable<CancelAppointmentInput>('studentA', 'cancelAppointment')
const cancelB = callable<CancelAppointmentInput>('studentB', 'cancelAppointment')
const cancelMentor = callable<CancelAppointmentInput>('mentor', 'cancelAppointment')
const completeMentor = callable<CompleteAppointmentInput>('mentor', 'completeAppointment')

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, `http://${authEmulator.host}:${authEmulator.port}`, { disableWarnings: true })
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), functionsEmulator.host, functionsEmulator.port)
    const email = `appointments-${role.toLowerCase()}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    const isMentor = role.startsWith('mentor')
    await db.collection(isMentor ? 'mentors' : 'users').doc(user.uid).set({ id: user.uid, email, displayName: `Calendar ${role}`, role: isMentor ? 'MENTOR' : 'STUDENT', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [], active: true })
  await db.collection('mentorProfiles').doc(ids.mentorB).set({ userId: ids.mentorB, biography: '', moduleIds: [], active: true })
})

afterAll(async () => {
  for (const collection of ['availabilitySlots', 'appointments', 'availabilitySlotLocks', 'studentAppointmentLocks']) {
    const snapshot = await db.collection(collection).get()
    for (const row of snapshot.docs) {
      const data = row.data()
      if (data.mentorId === ids.mentor || data.mentorId === ids.mentorB || data.studentId === ids.studentA || data.studentId === ids.studentB) await row.ref.delete()
    }
  }
  for (const uid of Object.values(ids)) {
    const receipts = await db.collection('appointmentOperations').doc(uid).collection('operations').get()
    for (const row of receipts.docs) await row.ref.delete()
    await db.collection('appointmentOperations').doc(uid).delete().catch(() => {})
  }
  if (ids.mentor) await db.collection('mentorProfiles').doc(ids.mentor).delete()
  if (ids.mentorB) await db.collection('mentorProfiles').doc(ids.mentorB).delete()
  for (const role of roles) {
    if (ids[role]) {
      await db.collection(role.startsWith('mentor') ? 'mentors' : 'users').doc(ids[role]).delete()
      await adminAuth.deleteUser(ids[role])
    }
    await signOut(getAuth(apps[role]))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
})

describe('consultation scheduling callable integration', () => {
  it('enforces overlap locks, atomic one-student booking, idempotency, and both cancellation policies', async () => {
    const halfHour = 30 * 60 * 1000
    const futureDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 72 * 60 * 60 * 1000))
    const startsMs = Date.parse(`${futureDay}T10:00:00+08:00`)
    const startsAt = new Date(startsMs).toISOString()
    const endsAt = new Date(startsMs + 60 * 60 * 1000).toISOString()
    const createInput = { requestId: crypto.randomUUID(), startsAt, endsAt }
    const created = createAvailabilitySlotOutputSchema.parse((await createSlot(createInput)).data).slot
    expect(created).toMatchObject({ mentorId: ids.mentor, status: 'OPEN', appointmentId: null, startsAt, endsAt })
    expect(createAvailabilitySlotOutputSchema.parse((await createSlot(createInput)).data).slot.id).toBe(created.id)
    await expect(createSlot({ requestId: createInput.requestId, startsAt: new Date(startsMs + halfHour).toISOString(), endsAt: new Date(startsMs + 90 * 60 * 1000).toISOString() })).rejects.toMatchObject({ code: 'functions/invalid-argument' })

    const delayedRequestId = crypto.randomUUID()
    const delayedSlotId = `delayed-${crypto.randomUUID()}`
    const delayedEndsMs = Math.floor(Date.now() / halfHour) * halfHour
    const delayedStartsAt = new Date(delayedEndsMs - halfHour).toISOString()
    const delayedEndsAt = new Date(delayedEndsMs).toISOString()
    const delayedTimestamp = Timestamp.now()
    await db.collection('availabilitySlots').doc(delayedSlotId).set({ id: delayedSlotId, mentorId: ids.mentor, mentorDisplayName: 'Calendar mentor', startsAt: Timestamp.fromDate(new Date(delayedStartsAt)), endsAt: Timestamp.fromDate(new Date(delayedEndsAt)), status: 'OPEN', appointmentId: null, createdAt: delayedTimestamp, updatedAt: delayedTimestamp })
    const delayedFingerprint = createHash('sha256').update(JSON.stringify(['CREATE_SLOT', delayedStartsAt, delayedEndsAt])).digest('hex')
    await db.collection('appointmentOperations').doc(ids.mentor).collection('operations').doc(delayedRequestId).set({ action: 'CREATE_SLOT', actorId: ids.mentor, fingerprint: delayedFingerprint, resultId: delayedSlotId })
    const delayedReplay = createAvailabilitySlotOutputSchema.parse((await createSlot({ requestId: delayedRequestId, startsAt: delayedStartsAt, endsAt: delayedEndsAt })).data).slot
    expect(delayedReplay.id).toBe(delayedSlotId)

    await expect(createSlot({ requestId: crypto.randomUUID(), startsAt: new Date(startsMs + halfHour).toISOString(), endsAt: new Date(startsMs + 90 * 60 * 1000).toISOString() })).rejects.toMatchObject({ code: 'functions/already-exists' })
    const adjacentInput = { requestId: crypto.randomUUID(), startsAt: endsAt, endsAt: new Date(startsMs + 90 * 60 * 1000).toISOString() }
    const adjacent = createAvailabilitySlotOutputSchema.parse((await createSlot(adjacentInput)).data).slot
    expect(adjacent.status).toBe('OPEN')
    await expect(callable<CreateAvailabilitySlotInput>('studentA', 'createAvailabilitySlot')({ ...createInput, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'functions/failed-precondition' })
    await expect(callable<ReserveAppointmentInput>('mentor', 'reserveAppointment')({ requestId: crypto.randomUUID(), slotId: created.id, helpRequestId: null, topic: 'Forged booking' })).rejects.toMatchObject({ code: 'functions/failed-precondition' })

    const reserveInputs: [ReserveAppointmentInput, ReserveAppointmentInput] = [
      { requestId: crypto.randomUUID(), slotId: created.id, helpRequestId: null, topic: 'Student A topic' },
      { requestId: crypto.randomUUID(), slotId: created.id, helpRequestId: null, topic: 'Student B topic' },
    ]
    const attempts = await Promise.allSettled([reserveA(reserveInputs[0]), reserveB(reserveInputs[1])])
    const fulfilled = attempts.flatMap((result, index) => result.status === 'fulfilled' ? [{ index, value: result.value }] : [])
    const rejected = attempts.filter((result) => result.status === 'rejected')
    expect(fulfilled, JSON.stringify(attempts.map((result) => result.status === 'fulfilled' ? 'fulfilled' : { code: result.reason?.code, message: result.reason?.message, details: result.reason?.details }))).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({ reason: { code: 'functions/already-exists' } })
    const winnerIndex = fulfilled[0].index
    const appointment = reserveAppointmentOutputSchema.parse(fulfilled[0].value.data).appointment
    expect(appointment).toMatchObject({ slotId: created.id, status: 'CONFIRMED', cancelledBy: null, studentId: winnerIndex === 0 ? ids.studentA : ids.studentB })
    const winnerReserve = winnerIndex === 0 ? reserveA : reserveB
    const winnerCancel = winnerIndex === 0 ? cancelA : cancelB
    const loserReserve = winnerIndex === 0 ? reserveB : reserveA
    expect(reserveAppointmentOutputSchema.parse((await winnerReserve(reserveInputs[winnerIndex])).data).appointment.id).toBe(appointment.id)
    await expect(winnerReserve({ ...reserveInputs[winnerIndex], topic: 'Changed replay payload' })).rejects.toMatchObject({ code: 'functions/invalid-argument' })

    const studentCancelled = cancelAppointmentOutputSchema.parse((await winnerCancel({ requestId: crypto.randomUUID(), appointmentId: appointment.id })).data).appointment
    expect(studentCancelled).toMatchObject({ status: 'CANCELLED', cancelledBy: 'STUDENT' })
    expect((await db.collection('availabilitySlots').doc(created.id).get()).data()).toMatchObject({ status: 'OPEN', appointmentId: null })

    const rebooked = reserveAppointmentOutputSchema.parse((await loserReserve({ requestId: crypto.randomUUID(), slotId: created.id, helpRequestId: null, topic: 'Rebooked after cancellation' })).data).appointment
    const mentorCancelled = cancelAppointmentOutputSchema.parse((await cancelMentor({ requestId: crypto.randomUUID(), appointmentId: rebooked.id })).data).appointment
    expect(mentorCancelled).toMatchObject({ status: 'CANCELLED', cancelledBy: 'MENTOR' })
    expect((await db.collection('availabilitySlots').doc(created.id).get()).data()).toMatchObject({ status: 'WITHDRAWN', appointmentId: rebooked.id })

    const replacement = createAvailabilitySlotOutputSchema.parse((await createSlot({ ...createInput, requestId: crypto.randomUUID() })).data).slot
    expect(replacement.status).toBe('OPEN')
    const competing = createAvailabilitySlotOutputSchema.parse((await createSlotB({ ...createInput, requestId: crypto.randomUUID() })).data).slot
    const overlapAttempts = await Promise.allSettled([
      reserveA({ requestId: crypto.randomUUID(), slotId: replacement.id, helpRequestId: null, topic: 'Same-student overlap A' }),
      reserveA({ requestId: crypto.randomUUID(), slotId: competing.id, helpRequestId: null, topic: 'Same-student overlap B' }),
    ])
    const overlapWinner = overlapAttempts.find((result) => result.status === 'fulfilled')
    const overlapLoser = overlapAttempts.find((result) => result.status === 'rejected')
    expect(overlapAttempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(overlapLoser).toMatchObject({ reason: { code: 'functions/already-exists', details: { reason: 'STUDENT_OVERLAP' } } })
    if (!overlapWinner || overlapWinner.status !== 'fulfilled') throw new Error('Expected exactly one overlapping reservation to win')
    const overlapAppointment = reserveAppointmentOutputSchema.parse(overlapWinner.value.data).appointment
    await cancelA({ requestId: crypto.randomUUID(), appointmentId: overlapAppointment.id })
    const withdrawn = withdrawAvailabilitySlotOutputSchema.parse((await withdrawSlot({ requestId: crypto.randomUUID(), slotId: adjacent.id })).data).slot
    expect(withdrawn.status).toBe('WITHDRAWN')
    expect(createAvailabilitySlotOutputSchema.parse((await createSlot({ ...adjacentInput, requestId: crypto.randomUUID() })).data).slot.status).toBe('OPEN')

    const activeId = `active-${crypto.randomUUID()}`
    const activeStart = Timestamp.fromMillis(startsMs + 10 * 60 * 60 * 1000)
    const activeEnd = Timestamp.fromMillis(activeStart.toMillis() + halfHour)
    const activeTimestamp = Timestamp.now()
    await db.collection('appointments').doc(activeId).set({ id: activeId, slotId: `slot-${activeId}`, studentId: ids.studentA, studentDisplayName: 'Calendar studentA', mentorId: ids.mentor, mentorDisplayName: 'Calendar Mentor', helpRequestId: null, topic: 'Not ended consultation', status: 'CONFIRMED', startsAt: activeStart, endsAt: activeEnd, cancelledBy: null, createdAt: activeTimestamp, updatedAt: activeTimestamp })
    const activeLockId = createHash('sha256').update(JSON.stringify([ids.studentA, activeStart.toMillis()])).digest('hex')
    await db.collection('studentAppointmentLocks').doc(activeLockId).set({ studentId: ids.studentA, slotId: `slot-${activeId}`, appointmentId: activeId, bucketStartsAt: activeStart })
    await expect(completeMentor({ requestId: crypto.randomUUID(), appointmentId: activeId })).rejects.toMatchObject({ code: 'functions/failed-precondition', details: { reason: 'APPOINTMENT_NOT_ENDED' } })

    const elapsedId = `elapsed-${crypto.randomUUID()}`
    const elapsedStart = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000)
    const elapsedEnd = Timestamp.fromMillis(Date.now() - halfHour)
    const timestamp = Timestamp.now()
    await db.collection('appointments').doc(elapsedId).set({ id: elapsedId, slotId: `slot-${elapsedId}`, studentId: ids.studentA, studentDisplayName: 'Calendar studentA', mentorId: ids.mentor, mentorDisplayName: 'Calendar Mentor', helpRequestId: null, topic: 'Past consultation', status: 'CONFIRMED', startsAt: elapsedStart, endsAt: elapsedEnd, cancelledBy: null, createdAt: timestamp, updatedAt: timestamp })
    const elapsedLockId = createHash('sha256').update(JSON.stringify([ids.studentA, elapsedStart.toMillis()])).digest('hex')
    await db.collection('studentAppointmentLocks').doc(elapsedLockId).set({ studentId: ids.studentA, slotId: `slot-${elapsedId}`, appointmentId: elapsedId, bucketStartsAt: elapsedStart })
    await expect(callable<CompleteAppointmentInput>('studentA', 'completeAppointment')({ requestId: crypto.randomUUID(), appointmentId: elapsedId })).rejects.toMatchObject({ code: 'functions/failed-precondition' })
    const completed = completeAppointmentOutputSchema.parse((await completeMentor({ requestId: crypto.randomUUID(), appointmentId: elapsedId })).data).appointment
    expect(completed.status).toBe('COMPLETED')
    expect((await db.collection('studentAppointmentLocks').doc(elapsedLockId).get()).exists).toBe(false)
  }, 15_000)
})
