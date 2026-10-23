import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { getProjectDefaultAccount, getAccessToken } = require('firebase-tools/lib/auth.js')
const [mentorAUid, mentorBUid] = process.argv.slice(2)
if (![mentorAUid, mentorBUid].every((uid) => /^[A-Za-z0-9_-]{1,128}$/u.test(uid ?? '')) || mentorAUid === mentorBUid) {
  throw new Error('Provide the two distinct approved Mentor UIDs.')
}
const account = getProjectDefaultAccount(process.cwd())
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login is unavailable.')
const token = (await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token
if (!token) throw new Error('Firebase CLI access token is unavailable.')
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: {
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers,
  } })
  if (!response.ok) throw new Error(`B3 IAM request failed: HTTP ${response.status}`)
  return response.json()
}
const fn = await request('https://cloudfunctions.googleapis.com/v2/projects/helpinus-dev/locations/asia-southeast1/functions/mentorConsultationSummary')
const expectedService = 'projects/helpinus-dev/locations/asia-southeast1/services/mentorconsultationsummary'
const vars = fn.serviceConfig?.environmentVariables ?? {}
if (fn.name !== 'projects/helpinus-dev/locations/asia-southeast1/functions/mentorConsultationSummary' ||
  fn.state !== 'ACTIVE' || fn.serviceConfig?.service !== expectedService ||
  fn.serviceConfig?.timeoutSeconds !== 40 || fn.serviceConfig?.maxInstanceCount !== 5 ||
  fn.serviceConfig?.maxInstanceRequestConcurrency !== 1 ||
  vars.SOCLAAS_B3_APPROVED_PROJECT_ID !== 'helpinus-dev' || vars.SOCLAAS_B3_ENABLED !== 'true' ||
  vars.SOCLAAS_B3_ISOLATION_VERIFIED !== 'true' ||
  vars.SOCLAAS_B3_ALLOWED_UIDS.split(',').sort().join(',') !== [mentorAUid, mentorBUid].sort().join(',') ||
  vars.SOCLAAS_APPROVED_MODEL_ID !== 'qwen3.5:9b' ||
  vars.SOCLAAS_VERIFIED_CONTEXT_TOKENS !== '8192' || vars.SOCLAAS_VERIFIED_OUTPUT_TOKENS !== '2048' ||
  vars.SOCLAAS_B3_MAX_OUTPUT_TOKENS !== '2048' ||
  !(fn.serviceConfig.secretEnvironmentVariables ?? []).some((secret) => secret.key === 'SOCLAAS_API_KEY')) {
  throw new Error('Deployed B3 guard check failed; IAM was not changed.')
}
const policyUrl = `https://run.googleapis.com/v1/${expectedService}:getIamPolicy`
const policy = await request(policyUrl)
const bindings = structuredClone(policy.bindings ?? [])
let binding = bindings.find((item) => item.role === 'roles/run.invoker' && !item.condition)
if (!binding) {
  binding = { role: 'roles/run.invoker', members: [] }
  bindings.push(binding)
}
if (!binding.members.includes('allUsers')) {
  binding.members.push('allUsers')
  await request(`https://run.googleapis.com/v1/${expectedService}:setIamPolicy`, {
    method: 'POST', body: JSON.stringify({
      policy: { bindings, etag: policy.etag, version: policy.version ?? 3 },
      updateMask: 'bindings,etag,version',
    }),
  })
}
const after = await request(policyUrl)
const publicInvoker = (after.bindings ?? []).some((item) => item.role === 'roles/run.invoker' && !item.condition && item.members?.includes('allUsers'))
if (!publicInvoker) throw new Error('B3 public invoker did not verify after the IAM update.')
console.log('Verified B3-only helpinus-dev Cloud Run invoker grant for allUsers; application exact-UID gate remains configured.')
