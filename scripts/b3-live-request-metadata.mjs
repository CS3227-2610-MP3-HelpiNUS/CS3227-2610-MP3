import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { getProjectDefaultAccount, getAccessToken } = require('firebase-tools/lib/auth.js')
const account = getProjectDefaultAccount(process.cwd())
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login is unavailable.')
const token = (await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token
if (!token) throw new Error('Firebase CLI access token is unavailable.')
const since = new Date(Date.now() - 20 * 60_000).toISOString()
const response = await fetch('https://logging.googleapis.com/v2/entries:list', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ resourceNames: ['projects/helpinus-dev'],
    filter: `resource.type="cloud_run_revision" AND resource.labels.service_name="mentorconsultationsummary" AND timestamp>="${since}"`,
    orderBy: 'timestamp desc', pageSize: 50,
  }),
})
if (!response.ok) throw new Error(`Read-only B3 request metadata lookup failed: HTTP ${response.status}`)
const body = await response.json()
const requests = (body.entries ?? []).filter((entry) => entry.httpRequest).map((entry) => ({
  timestamp: entry.timestamp, status: entry.httpRequest.status, latency: entry.httpRequest.latency,
})).slice(0, 8)
console.log(JSON.stringify({ project: 'helpinus-dev', recentB3Requests: requests }, null, 2))
