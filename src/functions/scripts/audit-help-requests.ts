// Read-only pre-release audit. A non-empty anomaly result blocks enabling F01
// creation on an existing database until a separately reviewed migration runs.
import { createHash } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { canonicalDocumentIdSchema, f01HelpRequestSchema } from '@helpinus/shared'

if (!process.env.FIRESTORE_EMULATOR_HOST && !process.argv.includes('--allow-production-audit')) {
  throw new Error('Use a Firestore Emulator, or explicitly pass --allow-production-audit for a read-only production audit.')
}

initializeApp()
const db = getFirestore()
const requests = await db.collection('helpRequests').get()
const keys = await db.collection('pendingHelpRequestKeys').get()
const summaries = await db.collection('helpRequestSummaries').get()
const receipts = await db.collectionGroup('operations').get()
const f01Receipts = receipts.docs.filter((receipt) => receipt.ref.path.startsWith('helpRequestOperations/'))
const requestData = new Map(requests.docs.map((request) => [request.id, request.data()]))
const expectedKeys = new Map<string, string>()
const expectedCounts = new Map<string, { pendingCount: number; acceptedCount: number; rejectedCount: number }>()
const anomalies: Record<string, number> = {}
const note = (code: string) => { anomalies[code] = (anomalies[code] ?? 0) + 1 }
const tupleHash = (studentId: string, mentorId: string, moduleId: string) => createHash('sha256').update(JSON.stringify([studentId, mentorId, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')

for (const snapshot of requests.docs) {
  const raw = snapshot.data()
  const parsed = f01HelpRequestSchema.safeParse({ ...raw, id: snapshot.id, createdAt: raw.createdAt?.toDate?.()?.toISOString(), updatedAt: raw.updatedAt?.toDate?.()?.toISOString() })
  if (!parsed.success || raw.id !== snapshot.id) { note('legacy_or_invalid_request'); continue }
  const request = parsed.data
  const conversation = await db.collection('conversations').doc(request.id).get()
  const counts = expectedCounts.get(request.studentId) ?? { pendingCount: 0, acceptedCount: 0, rejectedCount: 0 }
  if (request.status === 'PENDING') {
    counts.pendingCount += 1
    const key = tupleHash(request.studentId, request.mentorId, request.moduleId)
    if (expectedKeys.has(key)) note('duplicate_pending_tuple')
    expectedKeys.set(key, request.id)
  } else if (request.status === 'ACCEPTED') {
    counts.acceptedCount += 1
    const linked = conversation.data()
    if (!conversation.exists || linked?.helpRequestId !== request.id || linked?.studentId !== request.studentId || linked?.mentorId !== request.mentorId || !Array.isArray(linked?.participantIds) || linked.participantIds.length !== 2 || linked.participantIds[0] !== request.studentId || linked.participantIds[1] !== request.mentorId) note('accepted_conversation_mismatch')
  }
  else counts.rejectedCount += 1
  if (request.status !== 'ACCEPTED' && conversation.exists) note('nonaccepted_conversation')
  expectedCounts.set(request.studentId, counts)
}

for (const key of keys.docs) {
  const raw = key.data()
  const parent = requestData.get(raw.helpRequestId)
  if (expectedKeys.get(key.id) !== raw.helpRequestId || parent?.studentId !== raw.studentId || parent?.mentorId !== raw.mentorId || parent?.moduleId !== raw.moduleId) note('orphan_or_mismatched_pending_key')
  else expectedKeys.delete(key.id)
}
if (expectedKeys.size) anomalies.missing_pending_key = expectedKeys.size

for (const summary of summaries.docs) {
  const actual = summary.data()
  const expected = expectedCounts.get(summary.id)
  if (!expected || actual.pendingCount !== expected.pendingCount || actual.acceptedCount !== expected.acceptedCount || actual.rejectedCount !== expected.rejectedCount || actual.openCount !== expected.pendingCount + expected.acceptedCount) note('incorrect_or_orphan_summary')
  expectedCounts.delete(summary.id)
}
if (expectedCounts.size) anomalies.missing_summary = expectedCounts.size

for (const receipt of f01Receipts) {
  const raw = receipt.data()
  const studentId = receipt.ref.parent.parent?.id
  const target = typeof raw.helpRequestId === 'string' ? requestData.get(raw.helpRequestId) : null
  if (!studentId || raw.studentId !== studentId || typeof raw.fingerprint !== 'string' || !['CREATED', 'DUPLICATE'].includes(raw.kind) || !canonicalDocumentIdSchema.safeParse(raw.helpRequestId).success || target?.studentId !== studentId) note('invalid_operation_receipt')
}

const result = { projectId: db.projectId, requestCount: requests.size, pendingKeyCount: keys.size, summaryCount: summaries.size, receiptCount: f01Receipts.length, anomalies, clean: Object.keys(anomalies).length === 0 }
console.log(JSON.stringify(result, null, 2))
if (!result.clean) process.exitCode = 1
