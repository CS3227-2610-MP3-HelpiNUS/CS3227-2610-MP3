import { describe, expect, it, vi } from 'vitest'
import { ASafeError, listKeyVisibleModels, verifyOneInference, type AConfig, type AEvidence, type AMarker } from './soclaasConnectivity.js'

const config: AConfig = {
  projectId: 'verified-isolated-project', approvedProjectId: 'verified-isolated-project',
  approvedOrigin: 'https://soclaas-api.comp.nus.edu.sg', approvedModelId: 'catalog-model',
  verifiedContextTokens: 1024, verifiedOutputTokens: 64, operator: 'approved-operator', secret: 'synthetic-secret',
}
const catalog = { data: [{ id: 'catalog-model' }, { id: 'other-model' }] }
const completion = { choices: [{ message: { content: 'OK' } }] }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

function marker() {
  let used: AEvidence | undefined
  const outcomes: string[] = []
  const value: AMarker = {
    consume: vi.fn(async (evidence) => { if (used) return false; used = evidence; return true }),
    recordOutcome: vi.fn(async (outcome) => { outcomes.push(outcome) }),
  }
  return { value, get used() { return used }, outcomes }
}

describe('S3-D2-01 Milestone A private connectivity', () => {
  it('lists only IDs from the key-visible catalog with bounded, redirect-free HTTPS', async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe('error')
      expect(init.headers).toEqual({ Authorization: 'Bearer synthetic-secret' })
      return json(catalog)
    }) as unknown as typeof fetch
    await expect(listKeyVisibleModels(config, fetcher)).resolves.toEqual(['catalog-model', 'other-model'])
    expect(fetcher).toHaveBeenCalledWith('https://soclaas-api.comp.nus.edu.sg/v1/models', expect.anything())
  })

  it.each([
    { approvedOrigin: 'http://soclaas-api.comp.nus.edu.sg' },
    { approvedOrigin: 'https://foreign.example.test' },
    { approvedProjectId: 'unverified-project' },
    { secret: '' },
    { approvedModelId: '' },
    { approvedModelId: 'default' },
    { verifiedContextTokens: undefined },
    { verifiedOutputTokens: 129 },
  ])('rejects invalid preflight before inference: %j', async (override) => {
    const fetcher = vi.fn() as unknown as typeof fetch
    const state = marker()
    await expect(verifyOneInference({ ...config, ...override }, state.value, fetcher)).rejects.toBeInstanceOf(ASafeError)
    expect(fetcher).not.toHaveBeenCalled()
    expect(state.value.consume).not.toHaveBeenCalled()
  })

  it('requires the exact approved model to appear in this key catalog', async () => {
    const fetcher = vi.fn(async () => json({ data: [{ id: 'different-model' }] })) as unknown as typeof fetch
    const state = marker()
    await expect(verifyOneInference(config, state.value, fetcher)).rejects.toMatchObject({ code: 'MODEL' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(state.value.consume).not.toHaveBeenCalled()
  })

  it('consumes one durable marker before POST and cannot retry an uncertain result', async () => {
    const state = marker()
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/models')) return json(catalog)
      expect(state.used).toMatchObject({ projectId: config.projectId, modelId: config.approvedModelId, attemptsUsed: 1, outcome: 'attempted' })
      expect(init.redirect).toBe('error')
      expect(JSON.parse(String(init.body))).toEqual({
        model: 'catalog-model', messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 64,
      })
      throw new Error('uncertain transport with private body')
    })
    const fetcher = fetchMock as unknown as typeof fetch
    await expect(verifyOneInference(config, state.value, fetcher)).rejects.toMatchObject({ code: 'PROVIDER' })
    await expect(verifyOneInference(config, state.value, fetcher)).rejects.toMatchObject({ code: 'USED' })
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/chat/completions'))).toHaveLength(1)
    expect(state.outcomes).toContain('error')
  })

  it('reports only sanitized success and does not expose provider text', async () => {
    const state = marker()
    const fetcher = vi.fn(async (url: string) => url.endsWith('/models') ? json(catalog) : json(completion)) as unknown as typeof fetch
    await expect(verifyOneInference(config, state.value, fetcher)).resolves.toEqual({ outcome: 'success', attemptsUsed: 1 })
    expect(state.outcomes).toEqual(['success'])
  })

  it('does not report success when durable outcome recording fails', async () => {
    const state = marker()
    state.value.recordOutcome = vi.fn(async () => { throw new Error('private write detail') })
    const fetcher = vi.fn(async (url: string) => url.endsWith('/models') ? json(catalog) : json(completion)) as unknown as typeof fetch
    await expect(verifyOneInference(config, state.value, fetcher)).rejects.toMatchObject({ code: 'PROVIDER' })
    expect(state.used?.outcome).toBe('attempted')
  })

  it.each(['headers', 'body'])('classifies a %s timeout and keeps the attempt consumed', async (where) => {
    const state = marker()
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/models')) return json(catalog)
      expect(init.signal).toBeInstanceOf(AbortSignal)
      if (where === 'headers') throw new DOMException('synthetic timeout', 'TimeoutError')
      return new Response(new ReadableStream({ start(controller) { controller.error(new DOMException('synthetic timeout', 'AbortError')) } }))
    }) as unknown as typeof fetch
    await expect(verifyOneInference(config, state.value, fetcher)).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(state.used).toBeDefined()
    expect(state.outcomes).toEqual(['timeout'])
  })

  it('rejects redirects, errors, malformed and oversized provider responses safely', async () => {
    for (const response of [json({}, 302), json({ private: 'body' }, 500), json({ choices: [] }), new Response('x'.repeat(8193))]) {
      const state = marker()
      const fetcher = vi.fn(async (url: string) => url.endsWith('/models') ? json(catalog) : response) as unknown as typeof fetch
      await expect(verifyOneInference(config, state.value, fetcher)).rejects.toMatchObject({ code: 'PROVIDER' })
      expect(state.used).toBeDefined()
    }
  })
})
