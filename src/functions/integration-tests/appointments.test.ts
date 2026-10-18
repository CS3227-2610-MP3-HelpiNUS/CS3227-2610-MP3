import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
const roles = ['studentA', 'studentB', 'mentor'] as const
type Client = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `appointments-${role}` }, `appointments-${role}`)])) as Record<Client, ReturnType<typeof initializeApp>>
const admin = initializeAdminApp({ projectId }, 'appointments-admin')
const adminAuth = getAdminAuth(admin)
const db = getFirestore(admin)
const ids = {} as Record<Client, string>

const callable = <Input>(client: Client, name: string) => httpsCallable<Input, unknown>(getFunctions(apps[client], 'asia-southeast1'), name)
const createSlot = callable<CreateAvailabilitySlotInput>('mentor', 'createAvailabilitySlot')
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
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `appointments-${role.toLowerCase()}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await db.collection('users').doc(user.uid).set({ id: user.uid, email, displayName: role === 'mentor' ? 'Calendar Mentor' : `Calendar ${role}`, role: role === 'mentor' ? 'MENTOR' : 'STUDENT', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [], active: true })
})

afterAll(async () => {
  for (const collection of ['availabilitySlots', 'appointments', 'availabilitySlotLocks']) {
    const snapshot = await db.collection(collection).get()
    for (const row of snapshot.docs) {
      const data = row.data()
      if (data.mentorId === ids.mentor || data.studentId === ids.studentA || data.studentId === ids.studentB) await row.ref.delete()
    }
  }
  for (const uid of Object.values(ids)) {
    const receipts = await db.collection('appointmentOperations').doc(uid).collection('operations').get()
    for (const row of receipts.docs) await row.ref.delete()
    await db.collection('appointmentOperations').doc(uid).delete().catch(() => {})
  }
  if (ids.mentor) await db.collection('mentorProfiles').doc(ids.mentor).delete()
  for (const role of roles) {
    if (ids[role]) {
      await db.collection('users').doc(ids[role]).delete()
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
    const startsMs = Math.ceil((Date.now() + 48 * 60 * 60 * 1000) / halfHour) * halfHour
    const startsAt = new Date(startsMs).toISOString()
    const endsAt = new Date(startsMs + 60 * 60 * 1000).toISOString()
    const createInput = { requestId: crypto.randomUUID(), startsAt, endsAt }
    const created = createAvailabilitySlotOutputSchema.parse((await createSlot(createInput)).data).slot
    expect(created).toMatchObject({ mentorId: ids.mentor, status: 'OPEN', appointmentId: null, startsAt, endsAt })
    expect(createAvailabilitySlotOutputSchema.parse((await createSlot(createInput)).data).slot.id).toBe(created.id)
    await expect(createSlot({ requestId: createInput.requestId, startsAt: new Date(startsMs + halfHour).toISOString(), endsAt: new Date(startsMs + 90 * 60 * 1000).toISOString() })).rejects.toMatchObject({ code: 'functions/invalid-argument' })

    await expect(createSlot({ requestId: crypto.randomUUID(), startsAt: new Date(startsMs + halfHour).toISOString(), endsAt: new Date(startsMs + 90 * 60 * 1000).toISOString() })).rejects.toMatchObject({ code: 'functions/already-exists' })
    const adjacentInput = { requestId: crypto.randomUUID(), startsAt: endsAt, endsAt: new Date(startsMs + 90 * 60 * 1000).toISOString() }
    const adjacent = createAvailabilitySlotOutputSchema.parse((await createSlot(adjacentInput)).data).slot
    expect(adjacent.status).toBe('OPEN')
    await expect(callable<CreateAvailabilitySlotInput>('studentA', 'createAvailabilitySlot')({ ...createInput, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'functions/permission-denied' })
    await expect(callable<ReserveAppointmentInput>('mentor', 'reserveAppointment')({ requestId: crypto.randomUUID(), slotId: created.id, helpRequestId: null, topic: 'Forged booking' })).rejects.toMatchObject({ code: 'functions/permission-denied' })

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
    const withdrawn = withdrawAvailabilitySlotOutputSchema.parse((await withdrawSlot({ requestId: crypto.randomUUID(), slotId: adjacent.id })).data).slot
    expect(withdrawn.status).toBe('WITHDRAWN')
    expect(createAvailabilitySlotOutputSchema.parse((await createSlot({ ...adjacentInput, requestId: crypto.randomUUID() })).data).slot.status).toBe('OPEN')

    const elapsedId = `elapsed-${crypto.randomUUID()}`
    const elapsedStart = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000)
    const elapsedEnd = Timestamp.fromMillis(Date.now() - halfHour)
    const timestamp = Timestamp.now()
    await db.collection('appointments').doc(elapsedId).set({ id: elapsedId, slotId: `slot-${elapsedId}`, studentId: ids.studentA, studentDisplayName: 'Calendar studentA', mentorId: ids.mentor, mentorDisplayName: 'Calendar Mentor', helpRequestId: null, topic: 'Past consultation', status: 'CONFIRMED', startsAt: elapsedStart, endsAt: elapsedEnd, cancelledBy: null, createdAt: timestamp, updatedAt: timestamp })
    await expect(callable<CompleteAppointmentInput>('studentA', 'completeAppointment')({ requestId: crypto.randomUUID(), appointmentId: elapsedId })).rejects.toMatchObject({ code: 'functions/permission-denied' })
    const completed = completeAppointmentOutputSchema.parse((await completeMentor({ requestId: crypto.randomUUID(), appointmentId: elapsedId })).data).appointment
    expect(completed.status).toBe('COMPLETED')
  })
})
