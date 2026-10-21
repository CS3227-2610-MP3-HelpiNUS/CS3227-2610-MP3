import { describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { firestoreAMarker, soclaasACallHandler, type ACallDeps } from './soclaasConnectivityPrivate.js'
import type { AEvidence } from './soclaasConnectivity.js'

const evidence: AEvidence = {
  operator: 'synthetic-operator', projectId: 'synthetic-project', modelId: 'catalog-model',
  at: '2026-10-20T00:00:00.000Z', attemptsUsed: 1, outcome: 'attempted',
}

describe('Milestone A durable marker adapter', () => {
  it('persists one admission across reconstructed handlers and records only a safe outcome', async () => {
    let stored: AEvidence | undefined
    const ref = { update: vi.fn(async (patch: Partial<AEvidence>) => { stored = { ...stored!, ...patch } }) }
    const db = {
      doc: vi.fn(() => ref),
      runTransaction: vi.fn(async (work: (tx: {
        get: () => Promise<{ exists: boolean }>
        create: (_ref: unknown, entry: AEvidence) => void
      }) => Promise<boolean>) => work({
        get: async () => ({ exists: !!stored }),
        create: (_ref, entry) => { stored = entry },
      })),
    } as unknown as Firestore
    const first = firestoreAMarker(db)
    expect(await first.consume(evidence)).toBe(true)
    expect(stored).toEqual(evidence)
    const reconstructed = firestoreAMarker(db)
    expect(await reconstructed.consume(evidence)).toBe(false)
    await first.recordOutcome('timeout')
    expect(stored).toEqual({ ...evidence, outcome: 'timeout' })
    expect(ref.update).toHaveBeenCalledWith({ outcome: 'timeout' })
    expect((db.doc as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('soclaasVerification/milestoneA')
  })
})

const environment: NodeJS.ProcessEnv = {
  GCLOUD_PROJECT: 'helpinus-dev',
  SOCLAAS_MODEL: 'default',
}
const request = (uid: string | undefined, action: unknown = 'models') => ({
  data: { action }, auth: uid ? { uid } : undefined,
}) as CallableRequest<unknown>
const catalog = new Response(JSON.stringify({ data: [{ id: 'synthetic-model' }] }))
const dependencies = (overrides: Partial<ACallDeps> = {}): ACallDeps => ({
  environment: () => environment,
  secret: vi.fn(() => 'synthetic-secret'),
  firestore: vi.fn(() => { throw new Error('Firestore should not be reached') }),
  fetchImpl: vi.fn(async () => catalog),
  ...overrides,
})

describe('Milestone A onCall authorization and catalog', () => {
  it('denies unauthenticated requests before secret, marker, or provider access', async () => {
    const deps = dependencies()
    await expect(soclaasACallHandler(request(undefined), deps)).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(deps.secret).not.toHaveBeenCalled()
    expect(deps.firestore).not.toHaveBeenCalled()
    expect(deps.fetchImpl).not.toHaveBeenCalled()
  })

  it('fails closed when the runtime project is missing or is not helpinus-dev', async () => {
    for (const env of [{ ...environment, GCLOUD_PROJECT: undefined }, { ...environment, GCLOUD_PROJECT: 'helpinus-prod' },
      { ...environment, GCLOUD_PROJECT: 'other-project' }]) {
      const deps = dependencies({ environment: () => env })
      await expect(soclaasACallHandler(request('developer-uid'), deps)).rejects.toMatchObject({ code: 'failed-precondition' })
      expect(deps.secret).not.toHaveBeenCalled()
      expect(deps.firestore).not.toHaveBeenCalled()
      expect(deps.fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('rejects extra client fields before reading the secret', async () => {
    const deps = dependencies()
    await expect(soclaasACallHandler({ data: { action: 'models', prompt: 'private text' }, auth: { uid: 'approved-uid' } } as CallableRequest<unknown>, deps))
      .rejects.toMatchObject({ code: 'invalid-argument' })
    expect(deps.secret).not.toHaveBeenCalled()
    expect(deps.fetchImpl).not.toHaveBeenCalled()
  })

  it('returns only key-visible IDs to any authenticated UID without touching the marker', async () => {
    const deps = dependencies()
    await expect(soclaasACallHandler(request('developer-uid'), deps)).resolves.toEqual({ models: ['synthetic-model'] })
    expect(deps.secret).toHaveBeenCalledTimes(1)
    expect(deps.firestore).not.toHaveBeenCalled()
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not use the portal default selector as an approved inference model', async () => {
    const deps = dependencies({ environment: () => ({ ...environment, SOCLAAS_A_INFERENCE_ENABLED: 'true', SOCLAAS_A_APPROVED_MODEL_ID: 'default' }) })
    await expect(soclaasACallHandler(request('developer-uid', 'infer'), deps)).rejects.toMatchObject({ code: 'failed-precondition' })
    expect(deps.fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps inference closed for an authenticated UID during catalog-only deployment', async () => {
    const deps = dependencies()
    await expect(soclaasACallHandler(request('developer-uid', 'infer'), deps)).rejects.toMatchObject({ code: 'failed-precondition' })
    expect(deps.secret).not.toHaveBeenCalled()
    expect(deps.firestore).not.toHaveBeenCalled()
    expect(deps.fetchImpl).not.toHaveBeenCalled()
  })

  it('wires an enabled synthetic inference through the callable and consumes one attempt', async () => {
    let stored: AEvidence | undefined
    const ref = { update: vi.fn(async (patch: Partial<AEvidence>) => { stored = { ...stored!, ...patch } }) }
    const db = {
      doc: vi.fn(() => ref),
      runTransaction: vi.fn(async (work: (tx: {
        get: () => Promise<{ exists: boolean }>
        create: (_ref: unknown, entry: AEvidence) => void
      }) => Promise<boolean>) => work({
        get: async () => ({ exists: !!stored }),
        create: (_ref, entry) => { stored = entry },
      })),
    } as unknown as Firestore
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'synthetic-model' }] }))
      expect(url).toBe('https://soclaas-api.comp.nus.edu.sg/v1/chat/completions')
      expect(init?.method).toBe('POST')
      expect(stored).toMatchObject({ modelId: 'synthetic-model', outcome: 'attempted', attemptsUsed: 1 })
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }))
    })
    const deps = dependencies({
      environment: () => ({ ...environment, SOCLAAS_A_INFERENCE_ENABLED: 'true',
        SOCLAAS_A_APPROVED_MODEL_ID: 'synthetic-model', SOCLAAS_A_VERIFIED_CONTEXT_TOKENS: '4096',
        SOCLAAS_A_VERIFIED_OUTPUT_TOKENS: '128' }),
      firestore: () => db, fetchImpl: fetchMock as typeof fetch,
    })

    await expect(soclaasACallHandler(request('developer-uid', 'infer'), deps))
      .resolves.toEqual({ outcome: 'success', attemptsUsed: 1 })
    expect(stored).toMatchObject({ operator: 'developer-uid', outcome: 'success' })
    await expect(soclaasACallHandler(request('developer-uid', 'infer'), deps))
      .rejects.toMatchObject({ code: 'resource-exhausted' })
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/chat/completions'))).toHaveLength(1)
  })
})
