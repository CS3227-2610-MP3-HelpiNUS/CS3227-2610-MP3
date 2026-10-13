import { z } from 'zod'

import {
  appointmentSchema,
  helpRequestSchema,
  userSchema,
} from './domain.js'

const identifierSchema = z.string().trim().min(1).max(128)
const nonEmptyInputSchema = z.object({ requestId: z.string().uuid() })

export const initializeStudentProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
})
export const initializeStudentProfileOutputSchema = z.object({ user: userSchema })

export const createHelpRequestInputSchema = nonEmptyInputSchema.extend({
  mentorId: identifierSchema.nullable().default(null),
  moduleId: identifierSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
})
export const createHelpRequestOutputSchema = z.object({ helpRequest: helpRequestSchema })

export const respondToHelpRequestInputSchema = nonEmptyInputSchema.extend({
  helpRequestId: identifierSchema,
  response: z.enum(['ACCEPTED', 'REJECTED']),
})
export const respondToHelpRequestOutputSchema = z.object({ helpRequest: helpRequestSchema })

export const closeHelpRequestInputSchema = nonEmptyInputSchema.extend({
  helpRequestId: identifierSchema,
})
export const closeHelpRequestOutputSchema = z.object({ helpRequest: helpRequestSchema })

export const createAvailabilitySlotInputSchema = nonEmptyInputSchema
  .extend({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .refine(({ startsAt, endsAt }) => Date.parse(endsAt) > Date.parse(startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })
export const createAvailabilitySlotOutputSchema = z.object({ slotId: identifierSchema })

export const withdrawAvailabilitySlotInputSchema = nonEmptyInputSchema.extend({
  slotId: identifierSchema,
})
export const withdrawAvailabilitySlotOutputSchema = z.object({ slotId: identifierSchema })

export const reserveAppointmentInputSchema = nonEmptyInputSchema.extend({
  slotId: identifierSchema,
  helpRequestId: identifierSchema.nullable().default(null),
  topic: z.string().trim().min(1).max(240),
})
export const reserveAppointmentOutputSchema = z.object({ appointment: appointmentSchema })

export const respondToAppointmentInputSchema = nonEmptyInputSchema.extend({
  appointmentId: identifierSchema,
  response: z.enum(['CONFIRMED', 'REJECTED']),
})
export const respondToAppointmentOutputSchema = z.object({ appointment: appointmentSchema })

export const cancelAppointmentInputSchema = nonEmptyInputSchema.extend({
  appointmentId: identifierSchema,
})
export const cancelAppointmentOutputSchema = z.object({ appointment: appointmentSchema })

export const completeAppointmentInputSchema = nonEmptyInputSchema.extend({
  appointmentId: identifierSchema,
})
export const completeAppointmentOutputSchema = z.object({ appointment: appointmentSchema })

const aiPromptSchema = z.string().trim().min(1).max(4000)
export const studentStudyAssistInputSchema = nonEmptyInputSchema.extend({
  prompt: aiPromptSchema,
})
export const studentStudyAssistOutputSchema = z.object({ response: z.string().max(8000) })

export const mentorConsultationSummaryInputSchema = nonEmptyInputSchema.extend({
  appointmentId: identifierSchema,
  notes: z.string().trim().min(1).max(8000),
})
export const mentorConsultationSummaryOutputSchema = z.object({
  summary: z.string().max(8000),
})

export const callableSchemas = {
  initializeStudentProfile: {
    input: initializeStudentProfileInputSchema,
    output: initializeStudentProfileOutputSchema,
  },
  createHelpRequest: {
    input: createHelpRequestInputSchema,
    output: createHelpRequestOutputSchema,
  },
  respondToHelpRequest: {
    input: respondToHelpRequestInputSchema,
    output: respondToHelpRequestOutputSchema,
  },
  closeHelpRequest: {
    input: closeHelpRequestInputSchema,
    output: closeHelpRequestOutputSchema,
  },
  createAvailabilitySlot: {
    input: createAvailabilitySlotInputSchema,
    output: createAvailabilitySlotOutputSchema,
  },
  withdrawAvailabilitySlot: {
    input: withdrawAvailabilitySlotInputSchema,
    output: withdrawAvailabilitySlotOutputSchema,
  },
  reserveAppointment: {
    input: reserveAppointmentInputSchema,
    output: reserveAppointmentOutputSchema,
  },
  respondToAppointment: {
    input: respondToAppointmentInputSchema,
    output: respondToAppointmentOutputSchema,
  },
  cancelAppointment: {
    input: cancelAppointmentInputSchema,
    output: cancelAppointmentOutputSchema,
  },
  completeAppointment: {
    input: completeAppointmentInputSchema,
    output: completeAppointmentOutputSchema,
  },
  studentStudyAssist: {
    input: studentStudyAssistInputSchema,
    output: studentStudyAssistOutputSchema,
  },
  mentorConsultationSummary: {
    input: mentorConsultationSummaryInputSchema,
    output: mentorConsultationSummaryOutputSchema,
  },
} as const

export type CallableName = keyof typeof callableSchemas

export type InitializeStudentProfileInput = z.infer<
  typeof initializeStudentProfileInputSchema
>
export type CreateHelpRequestInput = z.infer<typeof createHelpRequestInputSchema>
export type RespondToHelpRequestInput = z.infer<
  typeof respondToHelpRequestInputSchema
>
export type ReserveAppointmentInput = z.infer<typeof reserveAppointmentInputSchema>
