import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { AiGatewayError } from '../src/aiGateway.js'
import { B3_LEASE_MS, b3CapacityPath, createB3TestCapacity } from '../src/aiTestCapacity.js'
import { mentorSummaryCallableHandler, type B3CallDeps } from '../src/mentorSummaryCallable.js'
import { SOC_ORIGIN } from '../src/soclaasConnectivity.js'

const projectId = 'helpinus-integration-test'
const admin = initializeApp({ projectId })
const db = getFirestore(admin)
const mentorUid = `b3-mentor-${crypto.randomUUID()}`
const studentUid = `b3-student-${crypto.randomUUID()}`
const otherUid = `b3-other-${crypto.randomUUID()}`
const mentorEmail = `${mentorUid}@example.test`
const requestId = `b3-request-${crypto.randomUUID()}`
const brief = { summary: 'Student asked about sorting.', unresolvedQuestions: 'None identified from the selected messages.', teachingApproaches: 'Use a small example.', limitations: 'Only one question was provided.' }
const providerBody = JSON.stringify({ choices: [{ message: { content: JSON.stringify(brief) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })
const request = (uid = mentorUid) => ({ auth: { uid, token: { email: uid === mentorUid ? mentorEmail : `${uid}@example.test`, email_verified: true } } }) as never
const environment = (): NodeJS.ProcessEnv => ({
  GCLOUD_PROJECT: projectId,
  SOCLAAS_APPROVED_ORIGIN: SOC_ORIGIN, SOCLAAS_APPROVED_MODEL_ID: 'approved-chat-model',
  SOCLAAS_VERIFIED_CONTEXT_TOKENS: '20000', SOCLAAS_VERIFIED_OUTPUT_TOKENS: '512',
  SOCLAAS_B3_MAX_OUTPUT_TOKENS: '128',
})
function dependencies(env = environment()) {
  const secret = vi.fn(() => 'synthetic-secret')
  const firestore = vi.fn(() => db)
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(providerBody, { status: 200 }))
  const deps: B3CallDeps = { environment: () => env, secret, firestore, fetchImpl, expectedProjectId: projectId }
  return { deps, secret, firestore, fetchImpl }
}

beforeAll(async () => {
  for (const [uid, role] of [[mentorUid, 'MENTOR'], [studentUid, 'STUDENT'], [otherUid, 'MENTOR']] as const) {
    const email = `${uid}@example.test`
    await getAuth(admin).createUser({ uid, email, emailVerified: true })
    await db.collection(role === 'MENTOR' ? 'mentors' : 'users').doc(uid).set({ id: uid, displayName: role, email, role, status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  const at = Timestamp.now()
  await db.collection('helpRequests').doc(requestId).set({ id: requestId, studentId: studentUid, mentorId: mentorUid, moduleId: 'cs3227', title: 'Synthetic question', description: 'Explain sorting.', studentDisplayName: 'Student', mentorDisplayName: 'Mentor', status: 'ACCEPTED', createdAt: at, updatedAt: at })
  await db.collection('conversations').doc(requestId).set({ id: requestId, helpRequestId: requestId, studentId: studentUid, mentorId: mentorUid, participantIds: [studentUid, mentorUid], createdAt: at, updatedAt: at })
  await db.collection('conversations').doc(requestId).collection('messages').doc(crypto.randomUUID()).set({ senderId: studentUid, body: 'How does sorting work?', createdAt: Timestamp.now(), readAt: null })
}, 30000)

afterAll(async () => {
  const messages = await db.collection('conversations').doc(requestId).collection('messages').get()
  for (const item of messages.docs) await item.ref.delete()
  await db.collection('conversations').doc(requestId).delete()
  await db.collection('helpRequests').doc(requestId).delete()
  await db.doc(b3CapacityPath).delete()
  for (const uid of [mentorUid, studentUid, otherUid]) {
    await db.collection(uid === studentUid ? 'users' : 'mentors').doc(uid).delete()
    await getAuth(admin).deleteUser(uid)
  }
  await deleteApp(admin)
}, 30000)

describe('B3 synthetic project gate and durable provider attempt scope', () => {
  it('rejects a foreign project and signed-out caller before secret, Firestore, or HTTP', async () => {
    for (const [auth, env, code] of [
      [request(), { ...environment(), GCLOUD_PROJECT: 'helpinus-prod' }, 'unavailable'],
      [{ auth: null }, environment(), 'unauthenticated'],
    ] as const) {
      const run = dependencies(env)
      await expect(mentorSummaryCallableHandler({ helpRequestId: requestId }, auth as never, run.deps)).rejects.toMatchObject({ code })
      expect(run.secret).not.toHaveBeenCalled()
      expect(run.firestore).not.toHaveBeenCalled()
      expect(run.fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('denies another active Mentor access to a conversation they do not own before provider HTTP', async () => {
    const run = dependencies()
    await expect(mentorSummaryCallableHandler({ helpRequestId: requestId }, request(otherUid), run.deps))
      .rejects.toMatchObject({ code: 'permission-denied' })
    expect(run.fetchImpl).not.toHaveBeenCalled()
  })

  it('denies an active Student before provider HTTP', async () => {
    const run = dependencies()
    await expect(mentorSummaryCallableHandler({ helpRequestId: requestId }, request(studentUid), run.deps))
      .rejects.toMatchObject({ code: 'permission-denied' })
    expect(run.fetchImpl).not.toHaveBeenCalled()
  })

  it('runs the gated accepted synthetic conversation through the shared real adapter with fake HTTP', async () => {
    await db.doc(b3CapacityPath).set({ attemptsUsed: 0, active: null })
    const run = dependencies()
    const result = await mentorSummaryCallableHandler({ helpRequestId: requestId }, request(), run.deps)
    expect(result).toEqual({ brief, partialHistory: false })
    expect(run.fetchImpl).toHaveBeenCalledTimes(1)
    expect(run.fetchImpl.mock.calls[0]![0]).toBe(`${SOC_ORIGIN}/v1/chat/completions`)
    expect((await db.doc(b3CapacityPath).get()).data()).toEqual({ attemptsUsed: 0, active: null })
    const body = JSON.parse(String(run.fetchImpl.mock.calls[0]![1]?.body)) as { messages: { role: string; content: string }[] }
    expect(Object.keys(body).sort()).toEqual(['model', 'messages', 'max_tokens', 'reasoning_effort'].sort())
    expect(body.messages.every((entry) => Object.keys(entry).sort().join(',') === 'content,role')).toBe(true)
    expect(JSON.stringify(body)).not.toContain('synthetic-secret')
    expect(body.messages[1]!.content).toContain('How does sorting work?')
  }, 30000)

  it('admits only one concurrent instance while allowing calls beyond the historical attempt count', async () => {
    await db.doc(b3CapacityPath).set({ attemptsUsed: 10, active: null })
    let release!: (value: string) => void
    const held = new Promise<string>((resolve) => { release = resolve })
    const firstProvider = vi.fn(() => held)
    const secondProvider = vi.fn(async () => 'second')
    const first = createB3TestCapacity(db).withAiCapacity(mentorUid, 'MENTOR_CONSULTATION_SUMMARY', firstProvider)
    await vi.waitFor(() => expect(firstProvider).toHaveBeenCalledTimes(1))
    await expect(createB3TestCapacity(db).withAiCapacity(mentorUid, 'MENTOR_CONSULTATION_SUMMARY', secondProvider))
      .rejects.toMatchObject({ reason: 'AI_CAPACITY' })
    expect(secondProvider).not.toHaveBeenCalled()
    expect((await db.doc(b3CapacityPath).get()).data()).toMatchObject({ attemptsUsed: 10, active: { actorId: mentorUid } })
    release('first')
    await expect(first).resolves.toBe('first')
    expect((await db.doc(b3CapacityPath).get()).data()).toEqual({ attemptsUsed: 10, active: null })
    await expect(createB3TestCapacity(db).withAiCapacity(mentorUid, 'MENTOR_CONSULTATION_SUMMARY', secondProvider))
      .resolves.toBe('second')
    expect(secondProvider).toHaveBeenCalledTimes(1)
    expect((await db.doc(b3CapacityPath).get()).data()).toEqual({ attemptsUsed: 10, active: null })
  }, 30000)

  it('holds a crashed lease beyond function timeout and reclaims only after expiry', async () => {
    await db.doc(b3CapacityPath).set({ attemptsUsed: 1, active: { id: 'prior', actorId: mentorUid, startedAtMs: 1000, expiresAtMs: 1000 + B3_LEASE_MS } })
    const blocked = vi.fn(async () => 'blocked')
    await expect(createB3TestCapacity(db, () => 1000 + B3_LEASE_MS - 1).withAiCapacity(mentorUid, 'MENTOR_CONSULTATION_SUMMARY', blocked))
      .rejects.toMatchObject({ reason: 'AI_CAPACITY' })
    expect(blocked).not.toHaveBeenCalled()
    expect(await createB3TestCapacity(db, () => 1000 + B3_LEASE_MS).withAiCapacity(mentorUid, 'MENTOR_CONSULTATION_SUMMARY', async () => 'reclaimed')).toBe('reclaimed')
    expect((await db.doc(b3CapacityPath).get()).data()).toEqual({ attemptsUsed: 1, active: null })
  }, 30000)

  it('fails closed on missing or corrupt durable scope state', async () => {
    await db.doc(b3CapacityPath).delete()
    await expect(createB3TestCapacity(db).withAiCapacity(mentorUid, 'MENTOR_CONSULTATION_SUMMARY', async () => 'never'))
      .rejects.toMatchObject({ reason: 'AI_CONFIG' })
    await db.doc(b3CapacityPath).set({ attemptsUsed: 0, active: { id: 'bad', actorId: mentorUid, startedAtMs: 1, expiresAtMs: 2 } })
    await expect(createB3TestCapacity(db).withAiCapacity(mentorUid, 'MENTOR_CONSULTATION_SUMMARY', async () => 'never'))
      .rejects.toMatchObject({ reason: 'AI_CONFIG' })
    expect(new AiGatewayError('AI_CAPACITY').message).not.toContain('synthetic-secret')
  }, 30000)
})
