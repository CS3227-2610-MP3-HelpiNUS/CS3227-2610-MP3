import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { getProjectDefaultAccount, getAccessToken } = require('firebase-tools/lib/auth.js')
const [studentUid, mentorUid] = process.argv.slice(2)
if (![studentUid, mentorUid].every((uid) => /^[A-Za-z0-9_-]{1,128}$/u.test(uid ?? '')) || studentUid === mentorUid) {
  throw new Error('Provide distinct Student and owning Mentor UIDs.')
}
const account = getProjectDefaultAccount(process.cwd())
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login is unavailable.')
const token = (await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token
if (!token) throw new Error('Firebase CLI access token is unavailable.')
const base = 'https://firestore.googleapis.com/v1/projects/helpinus-dev/databases/(default)/documents'
async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Read-only Firestore query failed: HTTP ${response.status}`)
  return response.json()
}
const rows = await post(':runQuery', { structuredQuery: {
  from: [{ collectionId: 'helpRequests' }],
  where: { compositeFilter: { op: 'AND', filters: [
    { fieldFilter: { field: { fieldPath: 'studentId' }, op: 'EQUAL', value: { stringValue: studentUid } } },
    { fieldFilter: { field: { fieldPath: 'mentorId' }, op: 'EQUAL', value: { stringValue: mentorUid } } },
  ] } },
  select: { fields: [{ fieldPath: 'status' }] }, limit: 20,
} })
const candidates = rows.filter((row) => row.document).map((row) => ({
  helpRequestId: row.document.name.split('/').at(-1), status: row.document.fields?.status?.stringValue ?? 'unknown',
}))
const accepted = candidates.filter((candidate) => candidate.status === 'ACCEPTED')
const conversationChecks = []
for (const candidate of accepted) {
  const response = await fetch(`${base}/conversations/${candidate.helpRequestId}?mask.fieldPaths=helpRequestId&mask.fieldPaths=studentId&mask.fieldPaths=mentorId&mask.fieldPaths=status`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status !== 200 && response.status !== 404) throw new Error(`Read-only conversation check failed: HTTP ${response.status}`)
  const doc = response.status === 200 ? await response.json() : null
  const messages = await post(`/conversations/${candidate.helpRequestId}:runQuery`, { structuredQuery: {
    from: [{ collectionId: 'messages' }], select: { fields: [{ fieldPath: 'senderId' }] }, limit: 31,
  } })
  const senders = messages.filter((row) => row.document).map((row) => row.document.fields?.senderId?.stringValue)
  conversationChecks.push({
    helpRequestId: candidate.helpRequestId, conversationExists: Boolean(doc),
    sameId: doc?.fields?.helpRequestId?.stringValue === candidate.helpRequestId,
    studentMatches: doc?.fields?.studentId?.stringValue === studentUid,
    mentorMatches: doc?.fields?.mentorId?.stringValue === mentorUid,
    status: doc?.fields?.status?.stringValue ?? null,
    messageCountUpTo31: senders.length, onlyApprovedSenders: senders.every((uid) => uid === studentUid || uid === mentorUid),
  })
}
console.log(JSON.stringify({ project: 'helpinus-dev', exactPairCandidateCount: candidates.length, candidates, conversationChecks }, null, 2))
