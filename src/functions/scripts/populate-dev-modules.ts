import { createRequire } from 'node:module'
import { moduleSchema } from '@helpinus/shared'
import { activeSearchPrefixes } from '../src/moduleSearchKeys.js'

const projectId = process.argv[2] === '--project' ? process.argv[3] : undefined
if (projectId !== 'helpinus-dev' || process.argv.length !== 4 || process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Run only against live helpinus-dev: tsx scripts/populate-dev-modules.ts --project helpinus-dev')
}

const modules = [
  { id: 'cs3227', code: 'CS3227', title: 'Agentic Software Engineering', active: true },
  { id: 'cs2103t', code: 'CS2103/T', title: 'Software Engineering', active: true },
  { id: 'cs2102', code: 'CS2102', title: 'Database Systems', active: true },
  { id: 'cg3201', code: 'CG3201', title: 'Machine Learning and Deep Learning', active: true },
  { id: 'cg3207', code: 'CG3207', title: 'Computer Architecture', active: true },
].map((module) => moduleSchema.parse(module))

type FirebaseCliAuth = {
  getProjectDefaultAccount: (directory: string) => { tokens?: { refresh_token?: string } } | undefined
  getAccessToken: (refreshToken: string, scopes: string[]) => Promise<{ access_token: string }>
}
type FirestoreValue = { stringValue?: string; booleanValue?: boolean; arrayValue?: { values?: FirestoreValue[] } }
type FirestoreDocument = { fields?: Record<string, FirestoreValue> }

const require = createRequire(import.meta.url)
const auth = require('firebase-tools/lib/auth.js') as FirebaseCliAuth
const account = auth.getProjectDefaultAccount(process.cwd())
if (!account?.tokens?.refresh_token) throw new Error('Sign in with Firebase CLI before populating development modules.')
const { access_token: accessToken } = await auth.getAccessToken(account.tokens.refresh_token, [])
const databasePath = `projects/${projectId}/databases/(default)/documents`
const endpoint = `https://firestore.googleapis.com/v1/${databasePath}`
const headers = { Authorization: `Bearer ${accessToken}` }

const writes = []
for (const module of modules) {
  const response = await fetch(`${endpoint}/modules/${module.id}`, { headers })
  if (response.status === 404) {
    const prefixes = activeSearchPrefixes(module)
    writes.push({
      update: {
        name: `${databasePath}/modules/${module.id}`,
        fields: {
          id: { stringValue: module.id },
          code: { stringValue: module.code },
          title: { stringValue: module.title },
          active: { booleanValue: module.active },
          activeSearchPrefixes: { arrayValue: { values: prefixes.map((prefix) => ({ stringValue: prefix })) } },
        },
      },
      currentDocument: { exists: false },
    })
    continue
  }
  if (!response.ok) throw new Error(`Could not inspect modules/${module.id}: HTTP ${response.status}`)
  const { fields = {} } = await response.json() as FirestoreDocument
  const actualPrefixes = fields.activeSearchPrefixes?.arrayValue?.values?.map((value) => value.stringValue)
  if (fields.id?.stringValue !== module.id || fields.code?.stringValue !== module.code || fields.title?.stringValue !== module.title
    || fields.active?.booleanValue !== module.active || JSON.stringify(actualPrefixes) !== JSON.stringify(activeSearchPrefixes(module))) {
    throw new Error(`modules/${module.id} already exists with different data; refusing to overwrite it.`)
  }
}

if (writes.length > 0) {
  const response = await fetch(`${endpoint}:commit`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  })
  if (!response.ok) throw new Error(`Could not create development modules: HTTP ${response.status}`)
}
console.info(`Created ${writes.length} module documents in ${projectId}; ${modules.length - writes.length} already matched.`)
