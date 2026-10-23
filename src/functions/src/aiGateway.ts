import { SOC_ORIGIN } from './soclaasConnectivity.js'

export type AiFeature = 'STUDENT_STUDY_ASSIST' | 'MENTOR_CONSULTATION_SUMMARY'
export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type AiUsage = { promptTokens: number; completionTokens: number; totalTokens: number }
export type AiResult = { text: string; usage?: AiUsage }
export type AiFailureReason = 'AI_CONFIG' | 'AI_CAPACITY' | 'AI_TIMEOUT' | 'AI_PROVIDER_LIMIT' | 'AI_PROVIDER' | 'AI_RESPONSE'
export type AiTimingStage = 'capacityAdmissionMs' | 'capacitySettlementMs' | 'providerHeadersMs' | 'providerBodyMs'
export type AiTimingObserver = (stage: AiTimingStage, elapsedMs: number) => void
export type AiResponseDiagnostic = {
  gatewayRejectionStage?: 'providerJson' | 'choiceEnvelope' | 'messageContent' | 'usage' | 'gatewayResult' | 'gatewayResultUsage'
  providerFinishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'other' | 'missing'
  providerOutputChars?: number
  providerOutputBytes?: number
  mentorRejectionStage?: 'textSize' | 'wrapper' | 'jsonParse' | 'objectShape' | 'fieldShape' | 'schema'
  mentorJsonParse?: 'success' | 'failure'
  mentorWrapper?: 'bare' | 'fenced' | 'invalid'
  mentorFields?: Record<'summary' | 'unresolvedQuestions' | 'teachingApproaches' | 'limitations', 'string' | 'missing' | 'array' | 'null' | 'object' | 'number' | 'boolean'>
  mentorUnknownFieldCount?: number
  mentorOutputChars?: number
  mentorOutputBytes?: number
}
export type AiDiagnosticObserver = (diagnostic: AiResponseDiagnostic) => void

/** This error deliberately contains no provider text, request content, or secret. */
export class AiGatewayError extends Error {
  constructor(readonly reason: AiFailureReason) {
    super(reason)
    this.name = 'AiGatewayError'
  }
}

export type AiGatewayConfig = {
  approvedOrigin: string
  modelId: string
  secret: string
  verifiedContextTokens: number
  verifiedOutputTokens: number
}

export type AiGenerateRequest = {
  actorId: string
  feature: AiFeature
  messages: readonly AiMessage[]
  maxOutputTokens: number
  /** Absolute epoch milliseconds, set by the trusted handler. */
  deadline: number
}

export type AiProviderRequest = Pick<AiGenerateRequest, 'messages' | 'maxOutputTokens' | 'deadline'> & {
  /** The exact body whose UTF-8 size was checked before capacity admission. */
  serializedBody: string
}
export interface AiProvider {
  complete(request: AiProviderRequest): Promise<AiResult>
}

/** A durable admission implementation is mandatory for every provider attempt. */
export type AiCapacity = {
  withAiCapacity<T>(actorId: string, feature: AiFeature, runAttempt: () => Promise<T>): Promise<T>
}

const MAX_MESSAGES = 32
const MAX_MESSAGE_CHARS = 12_000
const MAX_INPUT_BYTES = 48_000
const MAX_OUTPUT_TOKENS = 4_096 // Application safety ceiling, not a provider entitlement.
const MAX_REPLY_BYTES = 32_768
// Allows four brief fields totaling 8,000 characters plus JSON field names.
const MAX_RESULT_CHARS = 10_000
const MAX_DEADLINE_MS = 30_000
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

export function validateAiGatewayConfig(config: AiGatewayConfig): void {
  if (config.approvedOrigin !== SOC_ORIGIN || !MODEL_ID.test(config.modelId) || config.modelId === 'default' ||
    !config.secret || config.secret.trim() !== config.secret || /[\r\n]/u.test(config.secret) ||
    !positiveInteger(config.verifiedContextTokens) || !positiveInteger(config.verifiedOutputTokens) ||
    config.verifiedOutputTokens > MAX_OUTPUT_TOKENS || config.verifiedContextTokens <= config.verifiedOutputTokens + 128) {
    throw new AiGatewayError('AI_CONFIG')
  }
}

/** Read server configuration only; the caller supplies a Firebase-bound secret value. */
export function loadAiGatewayConfig(environment: NodeJS.ProcessEnv, secret: string): AiGatewayConfig {
  const config = {
    approvedOrigin: environment.SOCLAAS_APPROVED_ORIGIN ?? '',
    modelId: environment.SOCLAAS_APPROVED_MODEL_ID ?? '',
    secret,
    verifiedContextTokens: Number(environment.SOCLAAS_VERIFIED_CONTEXT_TOKENS),
    verifiedOutputTokens: Number(environment.SOCLAAS_VERIFIED_OUTPUT_TOKENS),
  }
  validateAiGatewayConfig(config)
  return config
}

function serializeCompletion(config: AiGatewayConfig, request: Pick<AiGenerateRequest, 'messages' | 'maxOutputTokens'>): string {
  return JSON.stringify({
    model: config.modelId,
    messages: request.messages.map(({ role, content }) => ({ role, content })),
    max_tokens: request.maxOutputTokens,
    reasoning_effort: 'none',
  })
}

function validateGenerate(request: AiGenerateRequest, config: AiGatewayConfig, now: number): string {
  if (!request.actorId || request.actorId.trim() !== request.actorId || request.actorId.length > 128 ||
    !['STUDENT_STUDY_ASSIST', 'MENTOR_CONSULTATION_SUMMARY'].includes(request.feature) ||
    !Array.isArray(request.messages) || request.messages.length < 1 || request.messages.length > MAX_MESSAGES ||
    !positiveInteger(request.maxOutputTokens) || request.maxOutputTokens > config.verifiedOutputTokens ||
    !Number.isSafeInteger(request.deadline) || request.deadline <= now || request.deadline - now > MAX_DEADLINE_MS) {
    throw new AiGatewayError('AI_CONFIG')
  }
  for (const message of request.messages) {
    if (!message || typeof message !== 'object' || Object.keys(message).length !== 2 ||
      !Object.hasOwn(message, 'role') || !Object.hasOwn(message, 'content') ||
      !['system', 'user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' || !message.content.trim() ||
      [...message.content].length > MAX_MESSAGE_CHARS) throw new AiGatewayError('AI_CONFIG')
  }
  // Measure the exact outbound JSON, including escaping and framing, before admission.
  const serializedBody = serializeCompletion(config, request)
  const bytes = Buffer.byteLength(serializedBody, 'utf8')
  // One serialized UTF-8 byte per potential token is a conservative model-independent bound.
  const contextBytes = config.verifiedContextTokens - request.maxOutputTokens - 128
  if (bytes > MAX_INPUT_BYTES || bytes > contextBytes) throw new AiGatewayError('AI_CONFIG')
  return serializedBody
}

function validUsage(value: unknown): AiUsage | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object') throw new AiGatewayError('AI_RESPONSE')
  const data = value as Record<string, unknown>
  const fields = [data.prompt_tokens, data.completion_tokens, data.total_tokens]
  if (!fields.every((field) => typeof field === 'number' && Number.isSafeInteger(field) && field >= 0) ||
    (fields[0] as number) + (fields[1] as number) !== fields[2]) throw new AiGatewayError('AI_RESPONSE')
  return { promptTokens: fields[0] as number, completionTokens: fields[1] as number, totalTokens: fields[2] as number }
}

function validateResultUsage(value: unknown): AiUsage | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AiGatewayError('AI_RESPONSE')
  const data = value as Record<string, unknown>
  const fields = [data.promptTokens, data.completionTokens, data.totalTokens]
  if (Object.keys(data).length !== 3 || !fields.every((field) => typeof field === 'number' && Number.isSafeInteger(field) && field >= 0) ||
    (fields[0] as number) + (fields[1] as number) !== fields[2]) throw new AiGatewayError('AI_RESPONSE')
  return { promptTokens: fields[0] as number, completionTokens: fields[1] as number, totalTokens: fields[2] as number }
}

function timeoutLike(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new AiGatewayError('AI_RESPONSE')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      if (signal.aborted) throw new AiGatewayError('AI_TIMEOUT')
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_REPLY_BYTES) throw new AiGatewayError('AI_RESPONSE')
      chunks.push(value)
    }
    if (signal.aborted) throw new AiGatewayError('AI_TIMEOUT')
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown
  } catch (error) {
    if (error instanceof AiGatewayError) throw error
    throw new AiGatewayError(signal.aborted || timeoutLike(error) ? 'AI_TIMEOUT' : 'AI_RESPONSE')
  } finally {
    void reader.cancel().catch(() => {})
  }
}

export function createSoclaasProvider(config: AiGatewayConfig, fetchImpl: typeof fetch = fetch, now = Date.now, observeTiming?: AiTimingObserver, observeDiagnostic?: AiDiagnosticObserver): AiProvider {
  validateAiGatewayConfig(config)
  return {
    async complete(request) {
      const remaining = request.deadline - now()
      if (remaining <= 0) throw new AiGatewayError('AI_TIMEOUT')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), remaining)
      let rejectionStage: AiResponseDiagnostic['gatewayRejectionStage'] = 'providerJson'
      try {
        const headersStart = performance.now()
        let response: Response
        try {
          response = await fetchImpl(`${SOC_ORIGIN}/v1/chat/completions`, {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
            body: request.serializedBody,
          })
        } finally {
          observeTiming?.('providerHeadersMs', performance.now() - headersStart)
        }
        if (controller.signal.aborted) throw new AiGatewayError('AI_TIMEOUT')
        if (response.status === 429) throw new AiGatewayError('AI_PROVIDER_LIMIT')
        if (response.status === 401 || response.status === 403) throw new AiGatewayError('AI_CONFIG')
        if (!response.ok) throw new AiGatewayError('AI_PROVIDER')
        const bodyStart = performance.now()
        let body: unknown
        try { body = await readBoundedJson(response, controller.signal) }
        finally { observeTiming?.('providerBodyMs', performance.now() - bodyStart) }
        rejectionStage = 'choiceEnvelope'
        if (!body || typeof body !== 'object') throw new AiGatewayError('AI_RESPONSE')
        const record = body as Record<string, unknown>
        if (!Array.isArray(record.choices) || record.choices.length !== 1) throw new AiGatewayError('AI_RESPONSE')
        const choice = record.choices[0] as Record<string, unknown> | null
        const finishReason = choice?.finish_reason
        observeDiagnostic?.({ providerFinishReason: finishReason === undefined ? 'missing' :
          finishReason === 'stop' || finishReason === 'length' || finishReason === 'content_filter' || finishReason === 'tool_calls'
            ? finishReason : 'other' })
        const message = choice?.message as Record<string, unknown> | undefined
        rejectionStage = 'messageContent'
        if (typeof message?.content === 'string') observeDiagnostic?.({
          providerOutputChars: [...message.content].length, providerOutputBytes: Buffer.byteLength(message.content, 'utf8'),
        })
        if (!message || message.tool_calls !== undefined || message.function_call !== undefined ||
          typeof message.content !== 'string' || !message.content.trim() ||
          Buffer.byteLength(message.content, 'utf8') > MAX_REPLY_BYTES) throw new AiGatewayError('AI_RESPONSE')
        rejectionStage = 'usage'
        return { text: message.content, usage: validUsage(record.usage) }
      } catch (error) {
        if (error instanceof AiGatewayError && error.reason === 'AI_RESPONSE') observeDiagnostic?.({ gatewayRejectionStage: rejectionStage })
        if (error instanceof AiGatewayError) throw error
        throw new AiGatewayError(controller.signal.aborted || timeoutLike(error) ? 'AI_TIMEOUT' : 'AI_PROVIDER')
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

/** Deterministic provider test double with the same success and safe-error surface. */
export class MockAiProvider implements AiProvider {
  readonly calls: AiProviderRequest[] = []
  constructor(private readonly outcome: AiResult | AiFailureReason, private readonly delayMs = 0) {}
  async complete(request: AiProviderRequest): Promise<AiResult> {
    this.calls.push(request)
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    if (Date.now() >= request.deadline) throw new AiGatewayError('AI_TIMEOUT')
    if (typeof this.outcome === 'string') throw new AiGatewayError(this.outcome)
    return this.outcome
  }
}

export function createAiGateway(config: AiGatewayConfig, provider: AiProvider, capacity: AiCapacity, now = Date.now, observeTiming?: AiTimingObserver, observeDiagnostic?: AiDiagnosticObserver) {
  validateAiGatewayConfig(config)
  if (!capacity || typeof capacity.withAiCapacity !== 'function') throw new AiGatewayError('AI_CONFIG')
  return {
    async generate(request: AiGenerateRequest): Promise<AiResult> {
      const serializedBody = validateGenerate(request, config, now())
      const admissionStart = performance.now()
      let providerEnd: number | undefined
      try {
        const result = await capacity.withAiCapacity(request.actorId, request.feature,
          async () => {
            observeTiming?.('capacityAdmissionMs', performance.now() - admissionStart)
            try {
              return await provider.complete({ messages: request.messages, maxOutputTokens: request.maxOutputTokens, deadline: request.deadline, serializedBody })
            } finally { providerEnd = performance.now() }
          })
        if (now() >= request.deadline) throw new AiGatewayError('AI_TIMEOUT')
        if (!result || typeof result.text !== 'string' || !result.text.trim() ||
          Buffer.byteLength(result.text, 'utf8') > MAX_REPLY_BYTES || [...result.text].length > MAX_RESULT_CHARS) {
          observeDiagnostic?.({ gatewayRejectionStage: 'gatewayResult' })
          throw new AiGatewayError('AI_RESPONSE')
        }
        try {
        const usage = validateResultUsage(result.usage)
        return usage ? { text: result.text, usage } : { text: result.text }
        } catch (error) {
          if (error instanceof AiGatewayError && error.reason === 'AI_RESPONSE') observeDiagnostic?.({ gatewayRejectionStage: 'gatewayResultUsage' })
          throw error
        }
      } catch (error) {
        if (error instanceof AiGatewayError) throw error
        throw new AiGatewayError('AI_PROVIDER')
      } finally {
        if (providerEnd !== undefined) observeTiming?.('capacitySettlementMs', performance.now() - providerEnd)
      }
    },
  }
}
