import { z } from 'zod'

export const applicationErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'EMAIL_NOT_VERIFIED',
  'PROFILE_NOT_FOUND',
  'ACCOUNT_NOT_ACTIVE',
  'PERMISSION_DENIED',
  'INVALID_ARGUMENT',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
])

export type ApplicationErrorCode = z.infer<typeof applicationErrorCodeSchema>

export const applicationErrorSchema = z.object({
  code: applicationErrorCodeSchema,
  message: z.string().min(1).max(300),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
})

export type ApplicationError = z.infer<typeof applicationErrorSchema>
