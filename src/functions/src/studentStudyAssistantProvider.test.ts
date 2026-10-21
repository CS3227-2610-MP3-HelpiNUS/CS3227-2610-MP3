import { describe, expect, it, vi } from 'vitest'
import {
  FakeStudentStudyAssistantProvider,
  SoclaasStudentStudyAssistantProvider,
  studentStudyAssistantProviderResultSchema,
} from './studentStudyAssistantProvider.js'

const input = {
  userMessage: 'What is BFS?',
  history: [{ role: 'STUDENT' as const, content: 'Please use the approved notes.' }],
  context: [{
    chunkId: 'chunk-1', sourceId: 'source-1', title: 'Synthetic Notes', version: 'v1',
    section: 'BFS', content: 'BFS uses a queue.',
  }],
}

const completion = (content: unknown, status = 200) => new Response(JSON.stringify({
  choices: [{ message: { content } }],
}), { status, headers: { 'Content-Type': 'application/json' } })

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

  it('calls the documented SoCLaaS Chat Completions endpoint and validates grounded JSON', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => completion(JSON.stringify({
      kind: 'grounded', content: 'BFS uses a queue.', citationChunkIds: ['chunk-1'],
    })))
    const provider = new SoclaasStudentStudyAssistantProvider({
      apiKey: () => 'synthetic-test-key', fetchImplementation, retryDelayMs: 1,
    })

    await expect(provider.answer(input)).resolves.toEqual({
      kind: 'grounded', content: 'BFS uses a queue.', citationChunkIds: ['chunk-1'],
    })
    expect(provider.baseUrl).toBe('https://soclaas-api.comp.nus.edu.sg/v1')
    expect(provider.model).toBe('default')
    expect(fetchImplementation).toHaveBeenCalledOnce()
    const [url, request] = fetchImplementation.mock.calls[0]!
    expect(url).toBe('https://soclaas-api.comp.nus.edu.sg/v1/chat/completions')
    expect(request?.method).toBe('POST')
    expect(request?.redirect).toBe('error')
    expect(request?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer synthetic-test-key' }))
    const body = JSON.parse(String(request?.body)) as { model: string; reasoning_effort: string; messages: Array<{ role: string; content: string }> }
    expect(body.model).toBe('default')
    expect(body.reasoning_effort).toBe('none')
    expect(body.messages.filter(({ role }) => role === 'system')).toHaveLength(1)
    const untrusted = body.messages.at(-1)
    expect(untrusted?.role).toBe('user')
    expect(untrusted?.content).toContain('UNTRUSTED_STUDENT_STUDY_DATA')
    expect(untrusted?.content).toContain('BFS uses a queue.')
    expect(untrusted?.content).toContain('What is BFS?')
  })

  it('fails closed before a network call when the server-side secret is absent', async () => {
    const fetchImplementation = vi.fn<typeof fetch>()
    const provider = new SoclaasStudentStudyAssistantProvider({ apiKey: () => undefined, fetchImplementation })
    await expect(provider.answer(input)).rejects.toMatchObject({
      code: 'unavailable', details: { reason: 'PROVIDER_SECRET_MISSING' },
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('retries a transient provider failure and then returns the valid answer', async () => {
    let transientBodyCancelled = false
    const transientBody = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('temporary upstream detail')) },
      cancel() { transientBodyCancelled = true },
    })
    const fetchImplementation = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(transientBody, { status: 503 }))
      .mockResolvedValueOnce(completion(JSON.stringify({
        kind: 'grounded', content: 'BFS uses a queue.', citationChunkIds: ['chunk-1'],
      })))
    const provider = new SoclaasStudentStudyAssistantProvider({
      apiKey: () => 'synthetic-test-key', fetchImplementation, maximumAttempts: 2, retryDelayMs: 1,
    })
    await expect(provider.answer(input)).resolves.toMatchObject({ kind: 'grounded' })
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
    expect(transientBodyCancelled).toBe(true)
  })

  it.each([
    [401, 'unavailable', 'PROVIDER_AUTHENTICATION_FAILED'],
    [403, 'unavailable', 'PROVIDER_ACCESS_DENIED'],
    [429, 'resource-exhausted', 'PROVIDER_RATE_LIMITED'],
    [503, 'unavailable', 'PROVIDER_UNAVAILABLE'],
  ])('maps provider HTTP %i without exposing its response body', async (status, code, reason) => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => new Response('sensitive upstream detail', { status }))
    const provider = new SoclaasStudentStudyAssistantProvider({
      apiKey: () => 'synthetic-test-key', fetchImplementation, maximumAttempts: 1,
    })
    await expect(provider.answer(input)).rejects.toMatchObject({ code, details: { reason } })
  })

  it('rejects malformed or oversized provider output', async () => {
    const malformed = new SoclaasStudentStudyAssistantProvider({
      apiKey: () => 'synthetic-test-key',
      fetchImplementation: vi.fn<typeof fetch>(async () => completion('not-json')),
    })
    await expect(malformed.answer(input)).rejects.toMatchObject({ details: { reason: 'PROVIDER_OUTPUT_INVALID' } })

    const oversized = new SoclaasStudentStudyAssistantProvider({
      apiKey: () => 'synthetic-test-key',
      fetchImplementation: vi.fn<typeof fetch>(async () => completion('x'.repeat(64_001))),
    })
    await expect(oversized.answer(input)).rejects.toMatchObject({ details: { reason: 'PROVIDER_RESPONSE_INVALID' } })
  })

  it('aborts a provider request at the bounded deadline', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (_url, request) => new Promise<Response>((_resolve, reject) => {
      request?.signal?.addEventListener('abort', () => reject(request.signal?.reason), { once: true })
    }))
    const provider = new SoclaasStudentStudyAssistantProvider({
      apiKey: () => 'synthetic-test-key', fetchImplementation, requestTimeoutMs: 5,
    })
    await expect(provider.answer(input)).rejects.toMatchObject({
      code: 'deadline-exceeded', details: { reason: 'PROVIDER_TIMEOUT' },
    })
  })
})
