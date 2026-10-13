import { z } from 'zod'

export const userRoleSchema = z.enum(['STUDENT', 'MENTOR'])
export type UserRole = z.infer<typeof userRoleSchema>

export const accountStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED'])
export type AccountStatus = z.infer<typeof accountStatusSchema>

export const helpRequestStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'CLOSED',
])
export type HelpRequestStatus = z.infer<typeof helpRequestStatusSchema>

export const appointmentStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'COMPLETED',
])
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>

const identifierSchema = z.string().trim().min(1).max(128)
const timestampSchema = z.string().datetime({ offset: true })

export const userSchema = z.object({
  id: identifierSchema,
  displayName: z.string().trim().min(1).max(100),
  email: z.string().email().max(254),
  role: userRoleSchema,
  status: accountStatusSchema,
  createdAt: timestampSchema,
})
export type User = z.infer<typeof userSchema>

export const mentorProfileSchema = z.object({
  userId: identifierSchema,
  biography: z.string().trim().max(1000),
  moduleIds: z.array(identifierSchema).max(30),
  active: z.boolean(),
})
export type MentorProfile = z.infer<typeof mentorProfileSchema>

export const moduleSchema = z.object({
  id: identifierSchema,
  code: z.string().trim().min(2).max(16),
  title: z.string().trim().min(1).max(160),
  active: z.boolean(),
})
export type Module = z.infer<typeof moduleSchema>

export const helpRequestSchema = z.object({
  id: identifierSchema,
  studentId: identifierSchema,
  mentorId: identifierSchema.nullable(),
  moduleId: identifierSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  status: helpRequestStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type HelpRequest = z.infer<typeof helpRequestSchema>

export const conversationSchema = z.object({
  id: identifierSchema,
  participantIds: z.array(identifierSchema).min(2).max(2),
  helpRequestId: identifierSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type Conversation = z.infer<typeof conversationSchema>

export const messageSchema = z.object({
  id: identifierSchema,
  conversationId: identifierSchema,
  senderId: identifierSchema,
  body: z.string().trim().min(1).max(4000),
  createdAt: timestampSchema,
})
export type Message = z.infer<typeof messageSchema>

export const availabilitySlotSchema = z
  .object({
    id: identifierSchema,
    mentorId: identifierSchema,
    startsAt: timestampSchema,
    endsAt: timestampSchema,
    withdrawn: z.boolean(),
    createdAt: timestampSchema,
  })
  .refine(({ startsAt, endsAt }) => Date.parse(endsAt) > Date.parse(startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>

export const appointmentSchema = z.object({
  id: identifierSchema,
  slotId: identifierSchema,
  studentId: identifierSchema,
  mentorId: identifierSchema,
  helpRequestId: identifierSchema.nullable(),
  topic: z.string().trim().min(1).max(240),
  status: appointmentStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type Appointment = z.infer<typeof appointmentSchema>

export const aiAuditEventSchema = z.object({
  id: identifierSchema,
  actorId: identifierSchema,
  actorRole: userRoleSchema,
  feature: z.enum(['STUDENT_STUDY_ASSIST', 'MENTOR_CONSULTATION_SUMMARY']),
  outcome: z.enum(['ALLOWED', 'REJECTED', 'FAILED']),
  promptHash: z.string().min(32).max(128),
  createdAt: timestampSchema,
})
export type AIAuditEvent = z.infer<typeof aiAuditEventSchema>
