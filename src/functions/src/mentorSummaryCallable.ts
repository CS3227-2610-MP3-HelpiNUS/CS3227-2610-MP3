import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { callableSchemas, type CallableInput } from '@helpinus/shared'
import { callable } from './callable.js'
import { AiGatewayError, createAiGateway, createSoclaasProvider, loadAiGatewayConfig, type AiResponseDiagnostic, type AiTimingStage } from './aiGateway.js'
import { B3_FUNCTION_TIMEOUT_SECONDS, createB3TestCapacity } from './aiTestCapacity.js'
import { mentorConsultationSummaryHandler } from './mentorConsultationSummary.js'

export const soclaasB3Secret = defineSecret('SOCLAAS_API_KEY')
const supportedProjectIds = new Set(['helpinus-dev', 'helpinus-prod'])

export function assertB3TestScope(uid: string | undefined, environment: NodeJS.ProcessEnv, expectedProjectId?: string): void {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to continue.')
  const projectId = expectedProjectId ?? environment.GCLOUD_PROJECT
  if (!projectId || (expectedProjectId === undefined && !supportedProjectIds.has(projectId)) ||
    environment.GCLOUD_PROJECT !== projectId || environment.SOCLAAS_B3_APPROVED_PROJECT_ID !== projectId ||
    environment.SOCLAAS_B3_ENABLED !== 'true' || environment.SOCLAAS_B3_ISOLATION_VERIFIED !== 'true') {
    throw new HttpsError('unavailable', 'The consultation draft is unavailable.', { reason: 'AI_CONFIG' })
  }
  const configured = environment.SOCLAAS_B3_ALLOWED_UIDS ?? ''
  const allowed = configured.split(',')
  if (!allowed.length || allowed.some((value) => !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) ||
    new Set(allowed).size !== allowed.length) {
    throw new HttpsError('unavailable', 'The consultation draft is unavailable.', { reason: 'AI_CONFIG' })
  }
  if (!allowed.includes(uid)) {
    throw new HttpsError('permission-denied', 'Conversation access is unavailable.', { reason: 'ACCESS_UNAVAILABLE' })
  }
}

export type B3CallDeps = {
  environment(): NodeJS.ProcessEnv
  secret(): string
  firestore(): Firestore
  fetchImpl: typeof fetch
  now?: () => number
  /** Synthetic Emulator tests supply their project; deployed entries accept only the two HelpiNUS projects. */
  expectedProjectId?: string
}

export async function mentorSummaryCallableHandler(
  input: CallableInput<'mentorConsultationSummary'>,
  request: CallableRequest<unknown>,
  deps: B3CallDeps,
) {
  const started = performance.now()
  const stages: Partial<Record<AiTimingStage | 'handlerPreProviderMs' | 'handlerPostProviderMs', number>> = {}
  const diagnostics: AiResponseDiagnostic = {}
  const observeTiming = (stage: AiTimingStage | 'handlerPreProviderMs' | 'handlerPostProviderMs', elapsedMs: number) => {
    stages[stage] = Math.max(0, Math.round(elapsedMs))
  }
  const observeDiagnostic = (diagnostic: AiResponseDiagnostic) => { Object.assign(diagnostics, diagnostic) }
  let outcome = 'success'
  try {
    const environment = deps.environment()
    const expectedProjectId = deps.expectedProjectId
    assertB3TestScope(request.auth?.uid, environment, expectedProjectId)
    const config = loadAiGatewayConfig(environment, deps.secret())
    const outputTokens = Number(environment.SOCLAAS_B3_MAX_OUTPUT_TOKENS)
    if (!Number.isSafeInteger(outputTokens) || outputTokens < 1 || outputTokens > config.verifiedOutputTokens) {
      throw new AiGatewayError('AI_CONFIG')
    }
    const db = deps.firestore()
    const gateway = createAiGateway(config, createSoclaasProvider(config, deps.fetchImpl, deps.now, observeTiming, observeDiagnostic), createB3TestCapacity(db, deps.now), deps.now, observeTiming, observeDiagnostic)
    return await mentorConsultationSummaryHandler(input, request, {
      db, gateway, authorizeInvocation: async (uid) => assertB3TestScope(uid, environment, expectedProjectId),
      modelId: config.modelId, verifiedContextTokens: config.verifiedContextTokens,
      verifiedOutputTokens: config.verifiedOutputTokens, maxOutputTokens: outputTokens, now: deps.now, observeTiming, observeDiagnostic,
    })
  } catch (error) {
    if (error instanceof HttpsError) {
      const reason = (error.details as { reason?: unknown } | undefined)?.reason
      outcome = typeof reason === 'string' && ['AI_CONFIG', 'AI_CAPACITY', 'AI_TIMEOUT', 'AI_PROVIDER_LIMIT', 'AI_PROVIDER', 'AI_RESPONSE'].includes(reason)
        ? reason : error.code
    } else outcome = error instanceof AiGatewayError ? error.reason : 'AI_PROVIDER'
    if (error instanceof HttpsError) throw error
    if (error instanceof AiGatewayError) {
      throw new HttpsError('unavailable', 'The consultation draft is unavailable.', { reason: error.reason })
    }
    throw new HttpsError('unavailable', 'The consultation draft is unavailable.', { reason: 'AI_PROVIDER' })
  } finally {
    logger.info('mentor-summary-timing', { outcome, totalMs: Math.max(0, Math.round(performance.now() - started)), stages, diagnostics })
  }
}

export const mentorConsultationSummary = callable(
  callableSchemas.mentorConsultationSummary.input,
  (input, request) => mentorSummaryCallableHandler(input, request, {
    environment: () => process.env,
    secret: () => soclaasB3Secret.value(),
    firestore: () => getFirestore(),
    fetchImpl: fetch,
  }),
  { secrets: [soclaasB3Secret], timeoutSeconds: B3_FUNCTION_TIMEOUT_SECONDS, maxInstances: 5, concurrency: 1 },
)
