import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'

vi.mock('../src/auth.js', () => ({
  requireCurrentMentor: async () => ({ uid: 'adapter-mentor', email: 'adapter-mentor@example.test', displayName: 'Adapter Mentor', role: 'MENTOR', status: 'ACTIVE' }),
}))

import { respondToHelpRequestHandler } from '../src/helpRequests.js'
import { provisionForAcceptedRequest } from '../src/conversations.js'

const app = initializeApp({ projectId: 'helpinus-integration-test' }, 'f01-adapter')
const db = getFirestore(app)
const request = {} as CallableRequest<unknown>
const id = 'adapter-request'
const tupleHash = createHash('sha256').update(JSON.stringify(['adapter-student', 'adapter-mentor', 'adapter-module'].map((part) => `${part.length}:${part}`))).digest('hex')

beforeAll(async () => {
  const now = Timestamp.now()
  await db.collection('users').doc('adapter-mentor').set({ id: 'adapter-mentor', email: 'adapter-mentor@example.test', displayName: 'Adapter Mentor', role: 'MENTOR', status: 'ACTIVE', createdAt: now })
  await db.collection('helpRequests').doc(id).set({ id, studentId: 'adapter-student', mentorId: 'adapter-mentor', moduleId: 'adapter-module', studentDisplayName: 'Adapter Student', mentorDisplayName: 'Adapter Mentor', title: 'Question', description: 'A detailed question', status: 'PENDING', createdAt: now, updatedAt: now })
  await db.collection('pendingHelpRequestKeys').doc(tupleHash).set({ studentId: 'adapter-student', mentorId: 'adapter-mentor', moduleId: 'adapter-module', helpRequestId: id })
  await db.collection('helpRequestSummaries').doc('adapter-student').set({ pendingCount: 1, acceptedCount: 0, rejectedCount: 0, openCount: 1, updatedAt: now })
})
afterAll(async () => {
  await Promise.all([
    db.collection('users').doc('adapter-mentor').delete(),
    db.collection('helpRequests').doc(id).delete(),
    db.collection('pendingHelpRequestKeys').doc(tupleHash).delete(),
    db.collection('helpRequestSummaries').doc('adapter-student').delete(),
    db.collection('conversations').doc(id).delete(),
  ])
  await deleteApp(app)
})

describe('F01 decision orchestration with an explicitly isolated F02 test adapter', () => {
  it('keeps handler acceptance unavailable when its F02 binding is absent (F02-TC-004 partial)', async () => {
    const requestRef = db.collection('helpRequests').doc(id)
    const keyRef = db.collection('pendingHelpRequestKeys').doc(tupleHash)
    const summaryRef = db.collection('helpRequestSummaries').doc('adapter-student')
    const before = await Promise.all([requestRef.get(), keyRef.get(), summaryRef.get()])
    await expect(respondToHelpRequestHandler({ operationId: crypto.randomUUID(), helpRequestId: id, response: 'ACCEPTED' }, request, db)).rejects.toMatchObject({ code: 'unavailable' })
    const after = await Promise.all([requestRef.get(), keyRef.get(), summaryRef.get()])
    expect(after.map((item) => item.data())).toEqual(before.map((item) => item.data()))
    expect((await db.collection('conversations').doc(id).get()).exists).toBe(false)
  })

  it('rolls back the real F02 provision write when a controlled fault aborts before commit (F01-TC-030)', async () => {
    const requestRef = db.collection('helpRequests').doc(id)
    const keyRef = db.collection('pendingHelpRequestKeys').doc(tupleHash)
    const summaryRef = db.collection('helpRequestSummaries').doc('adapter-student')
    const before = await Promise.all([requestRef.get(), keyRef.get(), summaryRef.get()])
    const failAfterProvision: NonNullable<Parameters<typeof respondToHelpRequestHandler>[3]> = (tx, stored, existing) => {
      provisionForAcceptedRequest(tx, stored, existing)
      throw new Error('controlled provision fault before commit')
    }
    await expect(respondToHelpRequestHandler({ operationId: crypto.randomUUID(), helpRequestId: id, response: 'ACCEPTED' }, request, db, failAfterProvision)).rejects.toThrow('controlled provision fault before commit')
    const after = await Promise.all([requestRef.get(), keyRef.get(), summaryRef.get()])
    expect(after.map((item) => item.data())).toEqual(before.map((item) => item.data()))
    expect((await db.collection('conversations').doc(id).get()).exists).toBe(false)
  })

  it('commits accepted request and deterministic test conversation together under racing accepts', async () => {
    const testAdapter: NonNullable<Parameters<typeof respondToHelpRequestHandler>[3]> = (tx, stored, existing) => {
      if (existing.exists) throw new Error('Unexpected preexisting conversation')
      tx.create(db.collection('conversations').doc(stored.id), { id: stored.id, helpRequestId: stored.id, studentId: stored.studentId, mentorId: stored.mentorId, participantIds: [stored.studentId, stored.mentorId], createdAt: stored.updatedAt, updatedAt: stored.updatedAt })
      return stored.id
    }
    const attempt = (operationId: string) => respondToHelpRequestHandler({ operationId, helpRequestId: id, response: 'ACCEPTED' }, request, db, testAdapter)
    const results = await Promise.all([attempt(crypto.randomUUID()), attempt(crypto.randomUUID())])
    expect(results.map((result) => result.kind).sort()).toEqual(['already_decided', 'decided'])
    expect(results.every((result) => 'conversationId' in result && result.conversationId === id)).toBe(true)
    expect((await db.collection('helpRequests').doc(id).get()).data()?.status).toBe('ACCEPTED')
    expect((await db.collection('conversations').doc(id).get()).data()).toMatchObject({ helpRequestId: id, studentId: 'adapter-student', mentorId: 'adapter-mentor' })
    expect((await db.collection('helpRequestSummaries').doc('adapter-student').get()).data()).toMatchObject({ pendingCount: 0, acceptedCount: 1, openCount: 1 })
    expect(await respondToHelpRequestHandler({ operationId: crypto.randomUUID(), helpRequestId: id, response: 'REJECTED' }, request, db, testAdapter)).toEqual({ kind: 'conflict', actualStatus: 'ACCEPTED' })
  }, 20000)
})
