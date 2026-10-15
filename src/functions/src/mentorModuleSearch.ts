import { FieldPath, type Firestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { canonicalDocumentIdSchema, moduleSchema, type SearchMentorModulesOutput } from '@helpinus/shared'
import { requireCurrentMentor } from './auth.js'
import { activeSearchPrefixes, normalizeModuleQuery } from './moduleSearchKeys.js'

type SearchInput = { query: string; cursor?: string }

function decodeCursor(cursor: string, query: string): string {
  try {
    if (cursor.length > 512) throw new Error('oversize')
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    const data = value as { v?: unknown; q?: unknown; lastId?: unknown }
    if (data.v !== 1 || data.q !== query || Object.keys(data).sort().join(',') !== 'lastId,q,v' || !canonicalDocumentIdSchema.safeParse(data.lastId).success) throw new Error('mismatch')
    return data.lastId as string
  } catch { throw new HttpsError('invalid-argument', 'The search cursor is invalid.') }
}

export async function searchMentorModulesHandler(input: SearchInput, request: CallableRequest<unknown>, db: Firestore): Promise<SearchMentorModulesOutput> {
  await requireCurrentMentor(request)
  const query = normalizeModuleQuery(input.query)
  if (!query || query.length > 160) throw new HttpsError('invalid-argument', 'Enter a module code or title prefix.')
  const lastId = input.cursor ? decodeCursor(input.cursor, query) : undefined
  let firestoreQuery = db.collection('modules').where('activeSearchPrefixes', 'array-contains', query).orderBy(FieldPath.documentId())
  if (lastId) firestoreQuery = firestoreQuery.startAfter(lastId)
  const snapshot = await firestoreQuery.limit(21).get()
  const modules = snapshot.docs.slice(0, 20).map((document) => {
    const parsed = moduleSchema.safeParse(document.data())
    if (!parsed.success || document.data().id !== document.id || parsed.data.id !== document.id || !parsed.data.active || !activeSearchPrefixes(parsed.data).includes(query)) {
      throw new HttpsError('internal', 'The module catalogue is inconsistent.')
    }
    return { id: parsed.data.id, code: parsed.data.code, title: parsed.data.title }
  })
  const nextCursor = snapshot.docs.length > 20
    ? Buffer.from(JSON.stringify({ v: 1, q: query, lastId: modules[modules.length - 1]!.id })).toString('base64url')
    : null
  return { modules, nextCursor }
}
