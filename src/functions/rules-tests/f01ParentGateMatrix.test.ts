import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, documentId, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment
const acceptedAt = new Date('2026-10-17T00:00:00.000Z')
const people = [
  { uid: 'student', email: 'student@example.test', role: 'STUDENT' },
  { uid: 'mentor', email: 'mentor@example.test', role: 'MENTOR' },
  { uid: 'foreign', email: 'foreign@example.test', role: 'STUDENT' },
] as const
const parent = (id: string, status: 'PENDING' | 'REJECTED' | 'ACCEPTED') => ({ id, studentId: 'student', mentorId: 'mentor', status, updatedAt: acceptedAt })
const pair = (id: string) => ({ id, helpRequestId: id, studentId: 'student', mentorId: 'mentor', participantIds: ['student', 'mentor'], createdAt: acceptedAt, updatedAt: acceptedAt })
const message = { senderId: 'mentor', body: 'Stored message', createdAt: acceptedAt }

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'helpinus-f01-parent-gate-test',
    firestore: { rules: await readFile(new URL('../../../firestore.rules', import.meta.url), 'utf8') },
  })
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    for (const person of people) await setDoc(doc(db, `${person.role === 'MENTOR' ? 'mentors' : 'users'}/${person.uid}`), { id: person.uid, role: person.role, status: 'ACTIVE', email: person.email })
    for (const [id, status] of [['pending', 'PENDING'], ['rejected', 'REJECTED'], ['accepted', 'ACCEPTED']] as const) {
      await setDoc(doc(db, `helpRequests/${id}`), parent(id, status))
      // Hostile pre-existing pairs make the parent gate observable on reads.
      await setDoc(doc(db, `conversations/${id}`), pair(id))
      await setDoc(doc(db, `conversations/${id}/messages/existing`), message)
    }
  })
})
afterAll(async () => env.cleanup())

async function snapshot() {
  let rows: Record<string, Array<[string, Record<string, unknown>]>> = {}
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const paths = ['helpRequests', 'conversations', 'conversations/pending/messages', 'conversations/rejected/messages', 'conversations/accepted/messages']
    rows = Object.fromEntries(await Promise.all(paths.map(async (path) => [path,
      (await getDocs(collection(db, path))).docs.map((item) => [item.id, item.data()] as [string, Record<string, unknown>]).sort(([a], [b]) => a.localeCompare(b)),
    ])))
  })
  return rows
}

function expectPopulated(snapshot: Awaited<ReturnType<typeof snapshot>>) {
  expect(snapshot.helpRequests?.map(([id]) => id)).toEqual(['accepted', 'pending', 'rejected'])
  expect(snapshot.conversations?.map(([id]) => id)).toEqual(['accepted', 'pending', 'rejected'])
  for (const id of ['accepted', 'pending', 'rejected']) expect(snapshot[`conversations/${id}/messages`]?.map(([messageId]) => messageId)).toEqual(['existing'])
}

const client = (uid: string, email: string, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore()
const messageList = (db: ReturnType<typeof client>, id: string) => getDocs(query(collection(db, `conversations/${id}/messages`), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20)))

describe('F01-TC-032 parent-gated conversation and message access', () => {
  it('applies the accepted parent gate to participant and foreign get/list/write decisions', async () => {
    const baseline = await snapshot()
    expectPopulated(baseline)
    for (const person of people) {
      const db = client(person.uid, person.email)
      for (const id of ['pending', 'rejected', 'accepted']) {
        const allowed = id === 'accepted' && person.uid !== 'foreign'
        const readPair = getDoc(doc(db, `conversations/${id}`))
        const readMessage = getDoc(doc(db, `conversations/${id}/messages/existing`))
        if (allowed) {
          const savedPair = (await assertSucceeds(readPair)).data()!
          expect(savedPair).toMatchObject({ id, helpRequestId: id, studentId: 'student', mentorId: 'mentor', participantIds: ['student', 'mentor'] })
          expect(savedPair.createdAt.toDate().toISOString()).toBe(acceptedAt.toISOString())
          expect((await assertSucceeds(readMessage)).data()).toMatchObject({ senderId: 'mentor', body: 'Stored message' })
          expect((await assertSucceeds(messageList(db, id))).docs.map((item) => item.id)).toEqual(['existing'])
        } else {
          await assertFails(readPair)
          await assertFails(readMessage)
          await assertFails(messageList(db, id))
        }
        await assertFails(getDocs(query(collection(db, 'conversations'), limit(20))))
        await assertFails(setDoc(doc(db, `conversations/${id}/messages/hostile-${person.uid}`), { senderId: person.uid, body: 'Forged', createdAt: serverTimestamp() }))
      }
    }
    expect(await snapshot()).toEqual(baseline)
  }, 30000)

  it('denies direct client pair creation with pending/rejected parents, arbitrary IDs and forged membership', async () => {
    const baseline = await snapshot()
    expectPopulated(baseline)
    for (const person of people) {
      const db = client(person.uid, person.email)
      for (const id of ['pending-new', 'rejected-new', 'arbitrary', 'forged-members']) {
        const proposed = id === 'pending-new' ? pair('pending') : id === 'rejected-new' ? pair('rejected') : id === 'forged-members'
          ? { ...pair('accepted'), participantIds: ['student', 'foreign'] } : pair('arbitrary')
        await assertFails(setDoc(doc(db, `conversations/${id}`), proposed))
      }
    }
    expect(await snapshot()).toEqual(baseline)
  }, 30000)

  it('revokes accepted pair and message access for stale role, status, token verification and email', async () => {
    const baseline = await snapshot()
    expectPopulated(baseline)
    const invalid = [
      env.authenticatedContext('student', { email: 'student@example.test', email_verified: false }).firestore(),
      client('student', 'stale@example.test'),
      client('foreign', 'foreign@example.test'),
    ]
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/suspended'), { id: 'suspended', role: 'STUDENT', status: 'SUSPENDED', email: 'suspended@example.test' })
    })
    invalid.push(client('suspended', 'suspended@example.test'))
    for (const db of invalid) {
      await assertFails(getDoc(doc(db, 'conversations/accepted')))
      await assertFails(getDoc(doc(db, 'conversations/accepted/messages/existing')))
      await assertFails(messageList(db, 'accepted'))
    }
    const student = client('student', 'student@example.test')
    for (const change of [{ role: 'MENTOR' }, { status: 'SUSPENDED' }, { email: 'drift@example.test' }]) {
      await env.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'users/student'), {
        id: 'student', role: 'STUDENT', status: 'ACTIVE', email: 'student@example.test', ...change,
      }))
      await assertFails(getDoc(doc(student, 'conversations/accepted')))
      await assertFails(getDoc(doc(student, 'conversations/accepted/messages/existing')))
      await assertFails(messageList(student, 'accepted'))
    }
    await env.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'users/student'), {
      id: 'student', role: 'STUDENT', status: 'ACTIVE', email: 'student@example.test',
    }))
    const after = await snapshot()
    expect(after['helpRequests']).toEqual(baseline['helpRequests'])
    expect(after['conversations']).toEqual(baseline['conversations'])
    expect(after['conversations/accepted/messages']).toEqual(baseline['conversations/accepted/messages'])
  }, 30000)
})
