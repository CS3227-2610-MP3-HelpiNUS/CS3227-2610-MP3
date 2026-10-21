import { HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'

export const studentStudyAssistantProviderResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('grounded'), content: z.string().trim().min(1).max(8000),
    citationChunkIds: z.array(z.string().trim().min(1).max(128)).min(1).max(8)
      .refine((ids) => new Set(ids).size === ids.length, 'Citation chunk IDs must be unique') }).strict(),
  z.object({ kind: z.literal('insufficient_context'), content: z.string().trim().min(1).max(8000),
    citationChunkIds: z.array(z.string()).length(0) }).strict(),
])

export type StudentStudyAssistantProviderResult = z.infer<typeof studentStudyAssistantProviderResultSchema>

export interface StudentStudyAssistantProviderInput {
  userMessage: string
  history: ReadonlyArray<{ role: 'STUDENT' | 'ASSISTANT'; content: string }>
  context: ReadonlyArray<{
    chunkId: string
    sourceId: string
    title: string
    version: string
    section: string | null
    content: string
  }>
}

export interface StudentStudyAssistantProvider {
  answer(input: StudentStudyAssistantProviderInput): Promise<StudentStudyAssistantProviderResult>
}

/**
 * Deterministic local provider. It is intentionally available only through the
 * emulator dependency factory and never contacts an external service.
 */
export class FakeStudentStudyAssistantProvider implements StudentStudyAssistantProvider {
  async answer(input: StudentStudyAssistantProviderInput): Promise<StudentStudyAssistantProviderResult> {
    const first = input.context[0]
    if (!first) {
      return {
        kind: 'insufficient_context',
        content: 'I could not find enough information in the approved sources to answer that question.',
        citationChunkIds: [],
      }
    }
    return studentStudyAssistantProviderResultSchema.parse({
      kind: 'grounded',
      content: `Based on the approved source ${first.title}: ${first.content}`,
      citationChunkIds: [first.chunkId],
    })
  }
}

/**
 * The SoCLaaS request and response contract has not been supplied. Keeping the
 * production boundary explicit prevents guessed endpoints, headers, model IDs,
 * or response fields from becoming a security-sensitive de facto contract.
 */
export class ContractPendingSoclaasStudentStudyAssistantProvider implements StudentStudyAssistantProvider {
  readonly baseUrl = 'https://soclaas-api.comp.nus.edu.sg/v1'

  async answer(input: StudentStudyAssistantProviderInput): Promise<StudentStudyAssistantProviderResult> {
    void input
    throw new HttpsError(
      'unavailable',
      'The Study assistant provider is not configured yet. Try again later.',
      { reason: 'PROVIDER_CONTRACT_PENDING' },
    )
  }
}

export function createStudentStudyAssistantProvider(emulator: boolean): StudentStudyAssistantProvider {
  return emulator
    ? new FakeStudentStudyAssistantProvider()
    : new ContractPendingSoclaasStudentStudyAssistantProvider()
}
