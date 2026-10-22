// Milestone A only. This module has no callable export and accepts no user text.
export const SOC_ORIGIN = 'https://soclaas-api.comp.nus.edu.sg'
const MAX_CATALOG_BYTES = 32_768
const MAX_REPLY_BYTES = 8_192
const MAX_OUTPUT_TOKENS = 128 // Local smoke cap, not a claim about any model's limits.
const DEADLINE_MS = 10_000

export type AConfig = {
  projectId: string
  approvedProjectId: string
  approvedOrigin: string
  approvedModelId?: string
  verifiedContextTokens?: number
  verifiedOutputTokens?: number
  operator: string
  secret: string
}

export type AEvidence = {
  operator: string
  projectId: string
  modelId: string
  at: string
  attemptsUsed: 1
  outcome: 'attempted' | 'success' | 'rejected' | 'timeout' | 'error'
}

export type AMarker = {
  consume(evidence: AEvidence): Promise<boolean>
  recordOutcome(outcome: AEvidence['outcome']): Promise<void>
}

export class ASafeError extends Error {
  constructor(readonly code: 'CONFIG' | 'CATALOG' | 'MODEL' | 'USED' | 'TIMEOUT' | 'PROVIDER') {
    super(`SoCLaaS verification ${code.toLowerCase()}.`)
  }
}

function requireBase(config: AConfig) {
  if (!config.projectId || !config.approvedProjectId || config.projectId !== config.approvedProjectId ||
    config.approvedOrigin !== SOC_ORIGIN || !config.operator || !config.secret ||
    config.secret.trim() !== config.secret) throw new ASafeError('CONFIG')
}

export function validateAInferenceConfig(config: AConfig) {
  requireBase(config)
  if (!config.approvedModelId || config.approvedModelId === 'default' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(config.approvedModelId) ||
    !Number.isSafeInteger(config.verifiedContextTokens) || (config.verifiedContextTokens ?? 0) < 512 ||
    !Number.isSafeInteger(config.verifiedOutputTokens) || (config.verifiedOutputTokens ?? 0) < 1 ||
    (config.verifiedOutputTokens ?? Infinity) > MAX_OUTPUT_TOKENS ||
    (config.verifiedContextTokens ?? 0) <= (config.verifiedOutputTokens ?? Infinity) + 128) {
    throw new ASafeError('CONFIG')
  }
}

async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new ASafeError('PROVIDER')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) throw new ASafeError('PROVIDER')
      chunks.push(value)
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new ASafeError('TIMEOUT')
    throw new ASafeError('PROVIDER')
  } finally {
    await reader.cancel().catch(() => {})
  }
}

async function request(url: string, init: RequestInit, fetchImpl: typeof fetch, timeoutMs = DEADLINE_MS) {
  try {
    return await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new ASafeError('TIMEOUT')
    throw new ASafeError('PROVIDER')
  }
}

export async function listKeyVisibleModels(config: AConfig, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  requireBase(config)
  const response = await request(`${SOC_ORIGIN}/v1/models`, {
    method: 'GET', headers: { Authorization: `Bearer ${config.secret}` },
  }, fetchImpl)
  if (!response.ok) throw new ASafeError('CATALOG')
  const body = await boundedJson(response, MAX_CATALOG_BYTES).catch(() => { throw new ASafeError('CATALOG') })
  if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data)) throw new ASafeError('CATALOG')
  const ids = body.data.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('id' in entry) || typeof entry.id !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(entry.id)) throw new ASafeError('CATALOG')
    return entry.id
  })
  return [...new Set<string>(ids)].sort()
}

export async function verifyOneInference(config: AConfig, marker: AMarker, fetchImpl: typeof fetch = fetch, now = () => new Date()) {
  validateAInferenceConfig(config)
  const catalog = await listKeyVisibleModels(config, fetchImpl)
  if (!catalog.includes(config.approvedModelId!)) throw new ASafeError('MODEL')
  const evidence: AEvidence = {
    operator: config.operator, projectId: config.projectId, modelId: config.approvedModelId!,
    at: now().toISOString(), attemptsUsed: 1, outcome: 'attempted',
  }
  if (!await marker.consume(evidence)) throw new ASafeError('USED')
  let failureOutcome: AEvidence['outcome'] = 'error'
  let validReply = false
  try {
    const response = await request(`${SOC_ORIGIN}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.approvedModelId, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: config.verifiedOutputTokens }),
    }, fetchImpl)
    if (!response.ok) {
      failureOutcome = 'rejected'
      throw new ASafeError('PROVIDER')
    }
    const body = await boundedJson(response, MAX_REPLY_BYTES)
    if (!body || typeof body !== 'object' || !('choices' in body) || !Array.isArray(body.choices) ||
      body.choices.length !== 1 || typeof body.choices[0]?.message?.content !== 'string' ||
      !body.choices[0].message.content.trim()) throw new ASafeError('PROVIDER')
    validReply = true
    await marker.recordOutcome('success')
    return { outcome: 'success' as const, attemptsUsed: 1 }
  } catch (error) {
    if (error instanceof ASafeError && error.code === 'TIMEOUT') failureOutcome = 'timeout'
    if (!validReply) await marker.recordOutcome(failureOutcome).catch(() => { throw new ASafeError('PROVIDER') })
    throw error instanceof ASafeError ? error : new ASafeError('PROVIDER')
  }
}
