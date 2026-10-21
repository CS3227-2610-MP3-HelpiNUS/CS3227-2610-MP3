import { describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  ContractPendingSoclaasStudentStudyAssistantProvider,
  FakeStudentStudyAssistantProvider,
  studentStudyAssistantProviderResultSchema,
} from './studentStudyAssistantProvider.js'

describe('Student Study Assistant providers', () => {
  it('returns a deterministic grounded answer from supplied synthetic context', async () => {
    const provider = new FakeStudentStudyAssistantProvider()
    await expect(provider.answer({
      userMessage: 'What is BFS?',
      history: [],
      context: [{
        chunkId: 'chunk-1', sourceId: 'source-1', title: 'Synthetic Notes', version: 'v1',
        section: 'BFS', content: 'BFS uses a queue.',
      }],
    })).resolves.toEqual({
      kind: 'grounded',
      content: 'Based on the approved source Synthetic Notes: BFS uses a queue.',
      citationChunkIds: ['chunk-1'],
    })
  })

  it('returns insufficient context without attempting to invent an answer', async () => {
    const provider = new FakeStudentStudyAssistantProvider()
    const result = await provider.answer({ userMessage: 'Unknown', history: [], context: [] })
    expect(result.kind).toBe('insufficient_context')
    expect(result.citationChunkIds).toEqual([])
    expect(studentStudyAssistantProviderResultSchema.safeParse(result).success).toBe(true)
  })

  it('keeps production SoCLaaS unavailable while its official contract is missing', async () => {
    const provider = new ContractPendingSoclaasStudentStudyAssistantProvider()
    const error = await provider.answer({ userMessage: 'Question', history: [], context: [] })
      .then(() => null, (reason: unknown) => reason) as HttpsError | null
    expect(provider.baseUrl).toBe('https://soclaas-api.comp.nus.edu.sg/v1')
    expect(error?.code).toBe('unavailable')
    expect(error?.details).toEqual({ reason: 'PROVIDER_CONTRACT_PENDING' })
  })
})
