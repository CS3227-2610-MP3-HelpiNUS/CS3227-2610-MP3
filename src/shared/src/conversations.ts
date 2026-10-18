import { z } from 'zod'
const canonicalDocumentIdSchema = z.string().min(1).max(128)
  .refine((value) => value === value.trim() && !/[\/\\\x00-\x1f]/u.test(value) && value !== '.' && value !== '..' && !/^__.*__$/u.test(value), 'Invalid document ID')

export const messageIdSchema = z.string().uuid()

export function normalizeMessageBody(value: string): string {
  return value.trim()
}

export const messageBodySchema = z.string().transform(normalizeMessageBody)
  .refine((value) => Array.from(value).length >= 1 && Array.from(value).length <= 4000, 'Message must contain 1 to 4,000 characters')

export const f02ConversationSchema = z.object({
  id: canonicalDocumentIdSchema,
  helpRequestId: canonicalDocumentIdSchema,
  studentId: canonicalDocumentIdSchema,
  mentorId: canonicalDocumentIdSchema,
  participantIds: z.tuple([canonicalDocumentIdSchema, canonicalDocumentIdSchema]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict()

export const f02SavedMessageSchema = z.object({
  id: messageIdSchema,
  conversationId: canonicalDocumentIdSchema,
  senderId: canonicalDocumentIdSchema,
  body: messageBodySchema,
  createdAt: z.string().datetime({ offset: true }),
  readAt: z.string().datetime({ offset: true }).nullable(),
}).strict()

export const sendMessageInputSchema = z.object({
  requestId: canonicalDocumentIdSchema,
  messageId: messageIdSchema,
  body: messageBodySchema,
}).strict()
export const acknowledgeMessageInputSchema = z.object({ requestId: canonicalDocumentIdSchema, messageId: messageIdSchema }).strict()
export const sendMessageOutputSchema = z.object({ message: f02SavedMessageSchema }).strict()
export const acknowledgeMessageOutputSchema = z.object({ readAt: z.string().datetime({ offset: true }) }).strict()

export type F02Conversation = z.infer<typeof f02ConversationSchema>
export type F02SavedMessage = z.infer<typeof f02SavedMessageSchema>
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>
export type AcknowledgeMessageInput = z.infer<typeof acknowledgeMessageInputSchema>
