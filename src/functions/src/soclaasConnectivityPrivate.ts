// Milestone A environment-scoped callable. Auth and project checks run before
// reading the bound secret, Firestore marker, or SoCLaaS catalog.
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { ASafeError, SOC_ORIGIN, listKeyVisibleModels, validateAInferenceConfig, verifyOneInference, type AConfig, type AEvidence, type AMarker } from './soclaasConnectivity.js'

export const soclaasASecret = defineSecret('SOCLAAS_API_KEY')
export const soclaasAMarkerPath = 'soclaasVerification/milestoneA'
const supportedProjectIds = new Set(['helpinus-dev', 'helpinus-prod'])

export function firestoreAMarker(db: Firestore): AMarker {
  const ref = db.doc(soclaasAMarkerPath)
  return {
    consume: (evidence: AEvidence) => db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref)
      if (snapshot.exists) return false
      tx.create(ref, evidence)
      return true
    }),
    recordOutcome: async (outcome) => { await ref.update({ outcome }) },
  }
}

export type ACallDeps = {
  environment: () => NodeJS.ProcessEnv
  secret: () => string
  firestore: () => Firestore
  fetchImpl: typeof fetch
}

function authenticatedUid(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required.')
  return uid
}

function actionOf(data: unknown): 'models' | 'infer' {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 1 ||
    !('action' in data) || (data.action !== 'models' && data.action !== 'infer')) {
    throw new HttpsError('invalid-argument', 'The request is invalid.')
  }
  return data.action
}

function configFor(uid: string, environment: NodeJS.ProcessEnv, readSecret: () => string): AConfig {
  const projectId = environment.GCLOUD_PROJECT ?? ''
  if (!supportedProjectIds.has(projectId)) {
    throw new HttpsError('failed-precondition', 'Verification unavailable.')
  }
  return {
    projectId, approvedProjectId: projectId, operator: uid, secret: readSecret(),
    approvedOrigin: SOC_ORIGIN,
    approvedModelId: environment.SOCLAAS_A_APPROVED_MODEL_ID,
    verifiedContextTokens: Number(environment.SOCLAAS_A_VERIFIED_CONTEXT_TOKENS),
    verifiedOutputTokens: Number(environment.SOCLAAS_A_VERIFIED_OUTPUT_TOKENS),
  }
}

export async function soclaasACallHandler(request: CallableRequest<unknown>, deps: ACallDeps) {
  const environment = deps.environment()
  const uid = authenticatedUid(request)
  const action = actionOf(request.data)
  try {
    // Catalog deployment never enables inference by itself.
    if (action === 'infer' && environment.SOCLAAS_A_INFERENCE_ENABLED !== 'true') {
      throw new HttpsError('failed-precondition', 'Verification unavailable.')
    }
    const config = configFor(uid, environment, deps.secret)
    if (action === 'models') return { models: await listKeyVisibleModels(config, deps.fetchImpl) }
    validateAInferenceConfig(config)
    return await verifyOneInference(config, firestoreAMarker(deps.firestore()), deps.fetchImpl)
  } catch (error) {
    if (error instanceof HttpsError) throw error
    if (error instanceof ASafeError) {
      const code = error.code === 'USED' ? 'resource-exhausted' :
        error.code === 'TIMEOUT' ? 'deadline-exceeded' :
          error.code === 'CONFIG' || error.code === 'MODEL' ? 'failed-precondition' : 'unavailable'
      throw new HttpsError(code, 'Verification unavailable.', { reason: error.code })
    }
    throw new HttpsError('internal', 'Verification unavailable.')
  }
}

export const soclaasConnectivityCheck = onCall({
  region: 'asia-southeast1', timeoutSeconds: 30, maxInstances: 1, concurrency: 1,
  secrets: [soclaasASecret],
}, (request) => soclaasACallHandler(request, {
  environment: () => process.env,
  secret: () => soclaasASecret.value(),
  firestore: () => getFirestore(),
  fetchImpl: fetch,
}))
