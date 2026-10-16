import { z } from 'zod'

import {
  appointmentSchema,
  helpRequestSchema,
  f01HelpRequestSchema,
  userSchema,
} from './domain.js'
import { sendMessageInputSchema, sendMessageOutputSchema, acknowledgeMessageInputSchema, acknowledgeMessageOutputSchema } from './conversations.js'

const identifierSchema = z.string().trim().min(1).max(128)
const nonEmptyInputSchema = z.object({ requestId: z.string().uuid() })

export const initializeStudentProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
})
export const initializeStudentProfileOutputSchema = z.object({ user: userSchema })

export const discoverMentorsInputSchema = z.object({
  cursor: identifierSchema.optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).strict()
export const publicMentorSchema = z.object({
  userId: identifierSchema,
  displayName: z.string().trim().min(1).max(100),
  biography: z.string().trim().max(1000),
  moduleIds: z.array(identifierSchema).max(30),
}).strict()
export const discoverMentorsOutputSchema = z.object({
  mentors: z.array(publicMentorSchema).max(50),
  nextCursor: identifierSchema.nullable(),
}).strict()

// Profile management accepts exact document IDs; trimming an ID would change
// which Firestore document is addressed.
export const canonicalDocumentIdSchema = z.string().min(1).max(128)
  .refine((value) => value === value.trim() && !/[\/\\\x00-\x1f]/u.test(value) && value !== '.' && value !== '..' && !/^__.*__$/u.test(value), 'Invalid document ID')
export const mentorProfileVersionSchema = z.object({
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  updateTime: z.string().regex(/^\d+:\d{9}$/u),
}).strict()
const mentorBiographySchema = z.string().trim().max(1000)
const mentorModuleIdsSchema = z.array(canonicalDocumentIdSchema).max(30)
  .refine((ids) => new Set(ids).size === ids.length, 'Module IDs must be unique')
const savedModuleSchema = z.discriminatedUnion('state', [
  z.object({ id: canonicalDocumentIdSchema, state: z.enum(['active', 'inactive']), code: z.string().min(2).max(16), title: z.string().min(1).max(160) }).strict(),
  z.object({ id: canonicalDocumentIdSchema, state: z.literal('missing') }).strict(),
])
export const readOwnMentorProfileInputSchema = z.object({}).strict()
export const readOwnMentorProfileOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready'), profile: z.object({ displayName: z.string().min(1).max(100), biography: mentorBiographySchema, moduleIds: mentorModuleIdsSchema, version: mentorProfileVersionSchema }).strict(), metadata: z.discriminatedUnion('kind', [z.object({ kind: z.literal('ready'), modules: z.array(savedModuleSchema).max(30) }).strict(), z.object({ kind: z.literal('unavailable') }).strict()]) }).strict(),
  z.object({ kind: z.literal('missing') }).strict(),
  z.object({ kind: z.literal('inactive') }).strict(),
  z.object({ kind: z.literal('invalid') }).strict(),
])
export const searchMentorModulesInputSchema = z.object({ query: z.string().trim().min(1).max(160), cursor: z.string().min(1).max(512).optional() }).strict()
export const searchMentorModulesOutputSchema = z.object({ modules: z.array(z.object({ id: canonicalDocumentIdSchema, code: z.string().min(2).max(16), title: z.string().min(1).max(160) }).strict()).max(20), nextCursor: z.string().max(512).nullable() }).strict()
export const updateOwnMentorProfileInputSchema = z.object({ requestId: z.string().uuid(), baseline: mentorProfileVersionSchema, biography: mentorBiographySchema, moduleIds: mentorModuleIdsSchema }).strict()
export const updateOwnMentorProfileOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('accepted'), stored: z.object({ biography: mentorBiographySchema, moduleIds: mentorModuleIdsSchema, revision: z.number().int().min(1) }).strict() }).strict(),
  z.object({ kind: z.literal('rejected'), reason: z.enum(['CONFLICT', 'MODULE_INELIGIBLE']), fieldErrors: z.record(z.string(), z.array(z.string())).optional() }).strict(),
])

export const createHelpRequestInputSchema = z.object({
  operationId: z.string().uuid(),
  mentorId: canonicalDocumentIdSchema,
  moduleId: canonicalDocumentIdSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
}).strict()
export const createHelpRequestOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('created'), helpRequest: f01HelpRequestSchema }).strict(),
  z.object({ kind: z.literal('duplicate'), existingHelpRequestId: canonicalDocumentIdSchema, currentStatus: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']) }).strict(),
])

export const respondToHelpRequestInputSchema = z.object({
  operationId: z.string().uuid(),
  helpRequestId: canonicalDocumentIdSchema,
  response: z.enum(['ACCEPTED', 'REJECTED']),
}).strict()
export const respondToHelpRequestOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['decided', 'already_decided']), helpRequest: f01HelpRequestSchema, conversationId: canonicalDocumentIdSchema.nullable() }).strict(),
  z.object({ kind: z.literal('conflict'), actualStatus: z.enum(['ACCEPTED', 'REJECTED']) }).strict(),
])

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
  discoverMentors: {
    input: discoverMentorsInputSchema,
    output: discoverMentorsOutputSchema,
  },
  readOwnMentorProfile: { input: readOwnMentorProfileInputSchema, output: readOwnMentorProfileOutputSchema },
  searchMentorModules: { input: searchMentorModulesInputSchema, output: searchMentorModulesOutputSchema },
  updateOwnMentorProfile: { input: updateOwnMentorProfileInputSchema, output: updateOwnMentorProfileOutputSchema },
  createHelpRequest: {
    input: createHelpRequestInputSchema,
    output: createHelpRequestOutputSchema,
  },
  respondToHelpRequest: {
    input: respondToHelpRequestInputSchema,
    output: respondToHelpRequestOutputSchema,
  },
  sendMessage: { input: sendMessageInputSchema, output: sendMessageOutputSchema },
  acknowledgeMessage: { input: acknowledgeMessageInputSchema, output: acknowledgeMessageOutputSchema },
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

export type CallableInput<Name extends CallableName> = z.input<
  (typeof callableSchemas)[Name]['input']
>

export type CallableOutput<Name extends CallableName> = z.output<
  (typeof callableSchemas)[Name]['output']
>

export type InitializeStudentProfileInput = z.infer<
  typeof initializeStudentProfileInputSchema
>
export type InitializeStudentProfileOutput = z.infer<
  typeof initializeStudentProfileOutputSchema
>
export type DiscoverMentorsInput = z.input<typeof discoverMentorsInputSchema>
export type DiscoverMentorsParsedInput = z.output<typeof discoverMentorsInputSchema>
export type DiscoverMentorsOutput = z.infer<typeof discoverMentorsOutputSchema>
export type ReadOwnMentorProfileOutput = z.infer<typeof readOwnMentorProfileOutputSchema>
export type SearchMentorModulesOutput = z.infer<typeof searchMentorModulesOutputSchema>
export type UpdateOwnMentorProfileInput = z.infer<typeof updateOwnMentorProfileInputSchema>
export type UpdateOwnMentorProfileOutput = z.infer<typeof updateOwnMentorProfileOutputSchema>
export type CreateHelpRequestInput = z.infer<typeof createHelpRequestInputSchema>
export type RespondToHelpRequestInput = z.infer<
  typeof respondToHelpRequestInputSchema
>
export type ReserveAppointmentInput = z.infer<typeof reserveAppointmentInputSchema>
