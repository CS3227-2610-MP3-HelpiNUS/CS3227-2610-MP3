import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { getProjectDefaultAccount, getAccessToken } = require('firebase-tools/lib/auth.js')
const account = getProjectDefaultAccount(process.cwd())
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login is unavailable.')
const token = (await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token
if (!token) throw new Error('Firebase CLI access token is unavailable.')

const url = new URL('https://firestore.googleapis.com/v1/projects/helpinus-dev/databases/(default)/documents/soclaasTestScope/mentorSummary')
url.searchParams.set('currentDocument.exists', 'false')
const response = await fetch(url, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { attemptsUsed: { integerValue: '0' }, active: { nullValue: 'NULL_VALUE' } } }),
})
if (!response.ok) throw new Error(`B3 capacity initialization failed without overwrite: HTTP ${response.status}`)
const doc = await response.json()
if (Number(doc.fields?.attemptsUsed?.integerValue) !== 0 || !Object.hasOwn(doc.fields?.active ?? {}, 'nullValue')) {
  throw new Error('B3 capacity document was created but did not verify.')
}
console.log('helpinus-dev B3 capacity document created with attemptsUsed=0 and active=null.')
