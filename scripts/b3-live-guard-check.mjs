import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { getProjectDefaultAccount, getAccessToken } = require('firebase-tools/lib/auth.js')

const [studentUid, mentorAUid, mentorBUid] = process.argv.slice(2)
const uids = [studentUid, mentorAUid, mentorBUid]
if (uids.some((uid) => !/^[A-Za-z0-9_-]{1,128}$/u.test(uid ?? '')) || new Set(uids).size !== 3) {
  throw new Error('Provide three distinct valid UIDs in Student, Mentor A, Mentor B order.')
}

const account = getProjectDefaultAccount(process.cwd())
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login is unavailable.')
const token = (await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token
if (!token) throw new Error('Firebase CLI access token is unavailable.')

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Read-only Firebase API request failed: HTTP ${response.status}`)
  return response.json()
}

const auth = await api('https://identitytoolkit.googleapis.com/v1/projects/helpinus-dev/accounts:lookup', {
  method: 'POST', body: JSON.stringify({ localId: uids }),
})
const authByUid = new Map((auth.users ?? []).map((user) => [user.localId, user]))
const firestoreBase = 'https://firestore.googleapis.com/v1/projects/helpinus-dev/databases/(default)/documents'
const docs = await Promise.all(uids.map((uid, index) =>
  api(`${firestoreBase}/${index === 0 ? 'users' : 'mentors'}/${uid}`)))
const checks = uids.map((uid, index) => {
  const user = authByUid.get(uid)
  const doc = docs[index]
  return {
    role: index === 0 ? 'Student' : index === 1 ? 'Mentor A' : 'Mentor B',
    authExists: Boolean(user),
    authEnabled: Boolean(user && !user.disabled),
    authEmailVerified: Boolean(user?.emailVerified),
    profileExists: Boolean(doc),
    profileActive: doc?.fields?.status?.stringValue === 'ACTIVE',
    profileRoleMatches: doc?.fields?.role?.stringValue === (index === 0 ? 'STUDENT' : 'MENTOR'),
    profileIdMatches: doc?.fields?.id?.stringValue === uid,
    profileEmailMatches: Boolean(user && doc?.fields?.email?.stringValue === user.email),
  }
})
const capacity = await api(`${firestoreBase}/soclaasTestScope/mentorSummary`)
const capacityState = capacity === null ? 'absent' :
  Number(capacity.fields?.attemptsUsed?.integerValue) === 0 &&
  Object.hasOwn(capacity.fields?.active ?? {}, 'nullValue') ? 'initialized-zero' : 'exists-other-state'
const capacityAttemptsUsed = capacity === null ? null : Number(capacity.fields?.attemptsUsed?.integerValue)
const capacityLeaseIdle = capacity === null ? null : Object.hasOwn(capacity.fields?.active ?? {}, 'nullValue')
const fn = await api('https://cloudfunctions.googleapis.com/v2/projects/helpinus-dev/locations/asia-southeast1/functions/mentorConsultationSummary')
const vars = fn?.serviceConfig?.environmentVariables ?? {}
const expectedAllowlist = [mentorAUid, mentorBUid].sort().join(',')
const actualAllowlist = (vars.SOCLAAS_B3_ALLOWED_UIDS ?? '').split(',').sort().join(',')
const runtime = {
  state: fn?.state,
  timeoutSeconds: fn?.serviceConfig?.timeoutSeconds,
  maxInstanceCount: fn?.serviceConfig?.maxInstanceCount,
  concurrency: fn?.serviceConfig?.maxInstanceRequestConcurrency,
  projectGate: vars.SOCLAAS_B3_APPROVED_PROJECT_ID === 'helpinus-dev',
  enabled: vars.SOCLAAS_B3_ENABLED === 'true',
  isolated: vars.SOCLAAS_B3_ISOLATION_VERIFIED === 'true',
  exactMentorAllowlist: actualAllowlist === expectedAllowlist,
  model: vars.SOCLAAS_APPROVED_MODEL_ID,
  contextBudget: vars.SOCLAAS_VERIFIED_CONTEXT_TOKENS,
  outputBudget: vars.SOCLAAS_VERIFIED_OUTPUT_TOKENS,
  b3MaxOutputBudget: vars.SOCLAAS_B3_MAX_OUTPUT_TOKENS,
  originApproved: vars.SOCLAAS_APPROVED_ORIGIN === 'https://soclaas-api.comp.nus.edu.sg',
  milestoneAInferenceEnabled: vars.SOCLAAS_A_INFERENCE_ENABLED === 'true',
  secretBound: (fn?.serviceConfig?.secretEnvironmentVariables ?? []).some((value) => value.key === 'SOCLAAS_API_KEY'),
  callableUrlHost: fn?.url ? new URL(fn.url).hostname : null,
  serviceUrlHost: fn?.serviceConfig?.uri ? new URL(fn.serviceConfig.uri).hostname : null,
}
const policy = await api(`https://run.googleapis.com/v2/${fn.serviceConfig.service}:getIamPolicy`)
runtime.publicInvoker = (policy?.bindings ?? []).some((binding) => binding.role === 'roles/run.invoker' && binding.members?.includes('allUsers'))
const legacyPolicy = await api(`https://run.googleapis.com/v1/${fn.serviceConfig.service}:getIamPolicy`)
runtime.publicInvokerV1 = (legacyPolicy?.bindings ?? []).some((binding) => binding.role === 'roles/run.invoker' && binding.members?.includes('allUsers'))
console.log(JSON.stringify({ project: 'helpinus-dev', checks, capacityState, capacityAttemptsUsed, capacityLeaseIdle, runtime }, null, 2))
