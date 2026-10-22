import { describe, expect, it, vi } from 'vitest'
import {
  AiGatewayError, createAiGateway, createSoclaasProvider, loadAiGatewayConfig, MockAiProvider,
  type AiCapacity, type AiFeature, type AiGatewayConfig, type AiGenerateRequest, type AiResponseDiagnostic, type AiTimingStage,
} from './aiGateway.js'
import { SOC_ORIGIN } from './soclaasConnectivity.js'

const config: AiGatewayConfig = {
  approvedOrigin: SOC_ORIGIN, modelId: 'approved-chat-model', secret: 'synthetic-secret',
  verifiedContextTokens: 20_000, verifiedOutputTokens: 512,
}
const messages = [{ role: 'system' as const, content: 'Give a short answer.' }, { role: 'user' as const, content: 'Synthetic question.' }]
const request = (feature: AiFeature): AiGenerateRequest => ({
  actorId: 'trusted-actor', feature, messages, maxOutputTokens: 128, deadline: Date.now() + 5000,
})
const admitted: AiCapacity = { withAiCapacity: async (_actor, _feature, run) => run() }
const safeReason = (error: unknown) => error instanceof AiGatewayError ? error.reason : undefined

describe('B1 shared SoCLaaS gateway', () => {
  it('lets independent Student-shaped and Mentor-shaped trusted consumers observe the same result', async () => {
    const success = { text: 'Synthetic answer.', usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } }
    const mock = new MockAiProvider(success)
    const gateway = createAiGateway(config, mock, admitted)
    const student = await gateway.generate(request('STUDENT_STUDY_ASSIST'))
    const mentor = await gateway.generate(request('MENTOR_CONSULTATION_SUMMARY'))
    expect(student).toEqual(success)
    expect(mentor).toEqual(success)
    expect(mock.calls).toHaveLength(2)
    expect(mock.calls[0]).toEqual({ messages, maxOutputTokens: 128, deadline: expect.any(Number), serializedBody: expect.any(String) })
  })

  it('admits every provider attempt and denies before provider access', async () => {
    const mock = new MockAiProvider({ text: 'Synthetic answer.' })
    const denied: AiCapacity = { withAiCapacity: async () => { throw new AiGatewayError('AI_CAPACITY') } }
    await expect(createAiGateway(config, mock, denied).generate(request('MENTOR_CONSULTATION_SUMMARY')))
      .rejects.toMatchObject({ reason: 'AI_CAPACITY' })
    expect(mock.calls).toHaveLength(0)
    expect(() => createAiGateway(config, mock, undefined as unknown as AiCapacity)).toThrowError(AiGatewayError)
  })

  it('fails closed on missing or unapproved config and rejects oversized trusted input before admission', async () => {
    expect(() => loadAiGatewayConfig({}, 'synthetic-secret')).toThrowError(AiGatewayError)
    expect(() => createAiGateway({ ...config, modelId: 'default' }, new MockAiProvider({ text: 'x' }), admitted)).toThrowError(AiGatewayError)
    expect(() => createAiGateway({ ...config, approvedOrigin: 'https://elsewhere.example' }, new MockAiProvider({ text: 'x' }), admitted)).toThrowError(AiGatewayError)
    let admissions = 0
    const capacity: AiCapacity = { withAiCapacity: async (_actor, _feature, run) => { admissions++; return run() } }
    const gateway = createAiGateway(config, new MockAiProvider({ text: 'x' }), capacity)
    await expect(gateway.generate({ ...request('STUDENT_STUDY_ASSIST'), messages: [{ role: 'user', content: 'x'.repeat(12_001) }] }))
      .rejects.toMatchObject({ reason: 'AI_CONFIG' })
    await expect(gateway.generate({ ...request('STUDENT_STUDY_ASSIST'), maxOutputTokens: 513 }))
      .rejects.toMatchObject({ reason: 'AI_CONFIG' })
    await expect(gateway.generate({ ...request('STUDENT_STUDY_ASSIST'), messages: [{ role: 'user', content: 'Safe', secret: 'forged' } as unknown as typeof messages[number]] }))
      .rejects.toMatchObject({ reason: 'AI_CONFIG' })
    expect(admissions).toBe(0)
  })

  it('uses only approved HTTPS chat completions, model, bearer secret, and no redirect', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'Synthetic answer.' } }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    }), { status: 200 }))
    const gateway = createAiGateway(config, createSoclaasProvider(config, fetchImpl), admitted)
    expect(await gateway.generate(request('MENTOR_CONSULTATION_SUMMARY'))).toEqual({
      text: 'Synthetic answer.', usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${SOC_ORIGIN}/v1/chat/completions`)
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer synthetic-secret', 'Content-Type': 'application/json' } })
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'approved-chat-model', messages, max_tokens: 128, reasoning_effort: 'none' })
    expect(String(init?.body)).toBe(JSON.stringify({ model: 'approved-chat-model', messages, max_tokens: 128, reasoning_effort: 'none' }))
  })

  it('rejects JSON-expanded control characters before capacity admission or HTTP', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    let admissions = 0
    const capacity: AiCapacity = { withAiCapacity: async (_actor, _feature, run) => { admissions++; return run() } }
    const roomyConfig = { ...config, verifiedContextTokens: 100_000 }
    const gateway = createAiGateway(roomyConfig, createSoclaasProvider(roomyConfig, fetchImpl), capacity)
    const expanded = Array.from({ length: 3 }, () => ({ role: 'user' as const, content: '\u0000'.repeat(4000) }))
    expect(expanded.reduce((size, message) => size + Buffer.byteLength(message.content), 0)).toBe(12_000)
    await expect(gateway.generate({ ...request('STUDENT_STUDY_ASSIST'), messages: expanded }))
      .rejects.toMatchObject({ reason: 'AI_CONFIG' })
    expect(admissions).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('counts lone-surrogate JSON escapes against the model context and sends the measured bytes', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic answer.' } }] }), { status: 200 }))
    const gateway = createAiGateway(config, createSoclaasProvider(config, fetchImpl), admitted)
    const allowed = { ...request('MENTOR_CONSULTATION_SUMMARY'), messages: [{ role: 'user' as const, content: '\ud800'.repeat(3200) }] }
    expect(await gateway.generate(allowed)).toEqual({ text: 'Synthetic answer.' })
    const body = String(fetchImpl.mock.calls[0]![1]?.body)
    expect(body).toContain('\\ud800')
    expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(config.verifiedContextTokens - allowed.maxOutputTokens - 128)
    await expect(gateway.generate({ ...allowed, messages: [{ role: 'user', content: '\ud800'.repeat(3300) }] }))
      .rejects.toMatchObject({ reason: 'AI_CONFIG' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each([
    [302, 'AI_PROVIDER'], [429, 'AI_PROVIDER_LIMIT'], [401, 'AI_CONFIG'], [403, 'AI_CONFIG'], [500, 'AI_PROVIDER'],
  ] as const)('normalizes HTTP %i without returning raw response text', async (status, reason) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('private provider body', { status }))
    const gateway = createAiGateway(config, createSoclaasProvider(config, fetchImpl), admitted)
    const error = await gateway.generate(request('STUDENT_STUDY_ASSIST')).catch((caught: unknown) => caught)
    expect(safeReason(error)).toBe(reason)
    expect(String(error)).not.toContain('private provider body')
  })

  it.each([
    ['malformed JSON', '{bad'],
    ['multiple choices', JSON.stringify({ choices: [{ message: { content: 'one' } }, { message: { content: 'two' } }] })],
    ['tool call', JSON.stringify({ choices: [{ message: { content: 'answer', tool_calls: [] } }] })],
    ['bad usage', JSON.stringify({ choices: [{ message: { content: 'answer' } }], usage: { prompt_tokens: -1, completion_tokens: 2, total_tokens: 1 } })],
    ['oversized body', 'x'.repeat(32_769)],
  ])('rejects %s with the safe response category', async (_label, body) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 }))
    const gateway = createAiGateway(config, createSoclaasProvider(config, fetchImpl), admitted)
    await expect(gateway.generate(request('MENTOR_CONSULTATION_SUMMARY'))).rejects.toMatchObject({ reason: 'AI_RESPONSE' })
  })

  it('normalizes a transport abort and delayed mock result as timeout', async () => {
    const abort = new Error('private request details')
    abort.name = 'AbortError'
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(abort)
    const real = createAiGateway(config, createSoclaasProvider(config, fetchImpl), admitted)
    const mock = createAiGateway(config, new MockAiProvider({ text: 'too late' }, 10), admitted)
    expect(safeReason(await real.generate(request('STUDENT_STUDY_ASSIST')).catch((error: unknown) => error))).toBe('AI_TIMEOUT')
    await expect(mock.generate({ ...request('MENTOR_CONSULTATION_SUMMARY'), deadline: Date.now() + 1 }))
      .rejects.toMatchObject({ reason: 'AI_TIMEOUT' })
  })

  it('reports fixed timing stages on a provider failure without exposing the transport error', async () => {
    const stages: AiTimingStage[] = []
    const observeTiming = (stage: AiTimingStage, elapsedMs: number) => {
      expect(Number.isFinite(elapsedMs) && elapsedMs >= 0).toBe(true)
      stages.push(stage)
    }
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('private transport details'))
    const gateway = createAiGateway(config, createSoclaasProvider(config, fetchImpl, Date.now, observeTiming), admitted, Date.now, observeTiming)
    const error = await gateway.generate(request('MENTOR_CONSULTATION_SUMMARY')).catch((caught: unknown) => caught)
    expect(safeReason(error)).toBe('AI_PROVIDER')
    expect(stages).toEqual(['capacityAdmissionMs', 'providerHeadersMs', 'capacitySettlementMs'])
    expect(String(error)).not.toContain('private transport details')
  })

  it('distinguishes gateway response rejection with mapped finish reason and no provider strings', async () => {
    const privateValue = 'private-provider-value'
    const diagnostics: AiResponseDiagnostic[] = []
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: privateValue, message: { content: { privateProviderKey: privateValue } } }],
    }), { status: 200 }))
    const gateway = createAiGateway(config, createSoclaasProvider(config, fetchImpl, Date.now, undefined,
      (item) => { diagnostics.push(item) }), admitted)
    await expect(gateway.generate(request('MENTOR_CONSULTATION_SUMMARY'))).rejects.toMatchObject({ reason: 'AI_RESPONSE' })
    expect(diagnostics).toContainEqual({ providerFinishReason: 'other' })
    expect(diagnostics).toContainEqual({ gatewayRejectionStage: 'messageContent' })
    expect(JSON.stringify(diagnostics)).not.toContain(privateValue)
    expect(JSON.stringify(diagnostics)).not.toContain('privateProviderKey')
  })

  it('keeps real and mock success without usage compatible', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic answer.' } }] }), { status: 200 }))
    const real = createAiGateway(config, createSoclaasProvider(config, fetchImpl), admitted)
    const mock = createAiGateway(config, new MockAiProvider({ text: 'Synthetic answer.' }), admitted)
    expect(await real.generate(request('STUDENT_STUDY_ASSIST'))).toEqual(await mock.generate(request('MENTOR_CONSULTATION_SUMMARY')))
  })

  it('maps malformed mock usage and real provider usage to the same safe response error', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Synthetic answer.' } }], usage: null,
    }), { status: 200 }))
    const real = createAiGateway(config, createSoclaasProvider(config, fetchImpl), admitted)
    const mock = createAiGateway(config, new MockAiProvider({ text: 'Synthetic answer.', usage: null } as unknown as { text: string }), admitted)
    await expect(real.generate(request('STUDENT_STUDY_ASSIST'))).rejects.toMatchObject({ reason: 'AI_RESPONSE' })
    await expect(mock.generate(request('MENTOR_CONSULTATION_SUMMARY'))).rejects.toMatchObject({ reason: 'AI_RESPONSE' })
  })

  it.each(['AI_CAPACITY', 'AI_TIMEOUT', 'AI_PROVIDER_LIMIT', 'AI_PROVIDER', 'AI_RESPONSE'] as const)(
    'preserves mock %s as the same normalized public failure class', async (reason) => {
      const gateway = createAiGateway(config, new MockAiProvider(reason), admitted)
      await expect(gateway.generate(request('MENTOR_CONSULTATION_SUMMARY'))).rejects.toMatchObject({ reason })
    },
  )
})
