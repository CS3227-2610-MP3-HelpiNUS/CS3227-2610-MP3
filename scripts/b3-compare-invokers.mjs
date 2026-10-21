import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { getProjectDefaultAccount, getAccessToken } = require('firebase-tools/lib/auth.js')
const account = getProjectDefaultAccount(process.cwd())
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login is unavailable.')
const token = (await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token
if (!token) throw new Error('Firebase CLI access token is unavailable.')
async function read(url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`Read-only service inspection failed: HTTP ${response.status}`)
  return response.json()
}
const names = ['mentorConsultationSummary', 'getMentorRequestSelection', 'discoverMentors']
const results = []
for (const name of names) {
  const fn = await read(`https://cloudfunctions.googleapis.com/v2/projects/helpinus-dev/locations/asia-southeast1/functions/${name}`)
  const policy = await read(`https://run.googleapis.com/v2/${fn.serviceConfig.service}:getIamPolicy`)
  results.push({ name, state: fn.state, ingress: fn.serviceConfig.ingressSettings,
    publicInvoker: (policy.bindings ?? []).some((binding) => binding.role === 'roles/run.invoker' && binding.members?.includes('allUsers')),
    authenticatedInvoker: (policy.bindings ?? []).some((binding) => binding.role === 'roles/run.invoker' && binding.members?.includes('allAuthenticatedUsers')),
  })
}
console.log(JSON.stringify(results, null, 2))
