import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { getProjectDefaultAccount, getAccessToken } = require('firebase-tools/lib/auth.js')
const helpRequestId = process.argv[2]
if (!/^[A-Za-z0-9_-]{1,128}$/u.test(helpRequestId ?? '')) throw new Error('Provide the selected help request ID.')
const account = getProjectDefaultAccount(process.cwd())
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login is unavailable.')
const token = (await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token
if (!token) throw new Error('Firebase CLI access token is unavailable.')
async function adminGet(url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`Read-only admin verification failed: HTTP ${response.status}`)
  return response.json()
}
const fn = await adminGet('https://cloudfunctions.googleapis.com/v2/projects/helpinus-dev/locations/asia-southeast1/functions/mentorConsultationSummary')
if (fn.state !== 'ACTIVE' || !fn.url) throw new Error('B3 callable is not ready.')
const capacityUrl = 'https://firestore.googleapis.com/v1/projects/helpinus-dev/databases/(default)/documents/soclaasTestScope/mentorSummary'
const before = await adminGet(capacityUrl)
const response = await fetch(fn.url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { helpRequestId } }),
})
const payload = await response.json().catch(() => null)
const after = await adminGet(capacityUrl)
const beforeAttempts = Number(before.fields?.attemptsUsed?.integerValue)
const afterAttempts = Number(after.fields?.attemptsUsed?.integerValue)
const leaseIdle = Object.hasOwn(after.fields?.active ?? {}, 'nullValue')
const errorStatus = payload?.error?.status ?? null
if (response.ok || beforeAttempts !== afterAttempts || !leaseIdle) throw new Error('Unauthenticated negative guard failed; stop acceptance.')
console.log(JSON.stringify({ project: 'helpinus-dev', negative: 'unauthenticated', httpStatus: response.status,
  callableErrorStatus: errorStatus, capacityUnchanged: true, leaseIdle: true }, null, 2))
