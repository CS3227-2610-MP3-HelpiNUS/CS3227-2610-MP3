import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { collection, connectFirestoreEmulator, doc, getDocFromServer, getDocs, getFirestore as getClientFirestore, limit, query, where } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { createHelpRequestOutputSchema, respondToHelpRequestOutputSchema, type CreateHelpRequestInput, type RespondToHelpRequestInput } from '@helpinus/shared'

const selectedClient = vi.hoisted(() => ({ firestore: null as unknown }))
vi.mock('../../frontend/src/services/firebase', () => ({ firebase: selectedClient }))
import { firebaseConversations } from '../../frontend/src/services/firebaseConversations.js'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f01-conversation-list-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor', 'foreignStudent', 'foreignMentor'] as const
type Role = typeof roles[number]
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f01-conversation-list-${role}` }, `f01-conversation-list-${role}`)])) as Record<Role, ReturnType<typeof initializeApp>>
const ids: Record<Role, string> = { student: '', mentor: '', foreignStudent: '', foreignMentor: '' }
const moduleId = `f01-conversation-list-module-${crypto.randomUUID()}`
const integrityModuleId = `f01-conversation-integrity-module-${crypto.randomUUID()}`
const requestIds: string[] = []
const operationIds: Array<{ studentId: string; id: string }> = []
const call = <Input>(role: Role, name: string) => httpsCallable<Input, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)

async function create(student: 'student' | 'foreignStudent', mentor: 'mentor' | 'foreignMentor', title: string, selectedModuleId = moduleId) {
  const operationId = crypto.randomUUID()
  const output = createHelpRequestOutputSchema.parse((await call<CreateHelpRequestInput>(student, 'createHelpRequest')({ operationId, mentorId: ids[mentor], moduleId: selectedModuleId, title, description: 'Conversation list authorization fixture.' })).data)
  expect(output.kind).toBe('created')
  if (output.kind !== 'created') throw new Error('Expected new request')
  operationIds.push({ studentId: ids[student], id: operationId })
  requestIds.push(output.helpRequest.id)
  return output.helpRequest.id
}

async function accept(mentor: 'mentor' | 'foreignMentor', requestId: string) {
  const output = respondToHelpRequestOutputSchema.parse((await call<RespondToHelpRequestInput>(mentor, 'respondToHelpRequest')({ operationId: crypto.randomUUID(), helpRequestId: requestId, response: 'ACCEPTED' })).data)
  expect(output).toMatchObject({ kind: 'decided', conversationId: requestId })
}

async function observeList(role: 'student' | 'mentor') {
  selectedClient.firestore = getClientFirestore(apps[role])
  return new Promise<{ rows: Parameters<Parameters<typeof firebaseConversations.subscribeList>[3]>[0]; next: Parameters<Parameters<typeof firebaseConversations.subscribeList>[3]>[1] }>((resolve, reject) => {
    let stop: (() => void) | undefined
    let finished = false
    const timer = setTimeout(() => { if (!finished) { finished = true; stop?.(); reject(new Error('Conversation list did not publish.')) } }, 10000)
    stop = firebaseConversations.subscribeList(ids[role], role === 'student' ? 'STUDENT' : 'MENTOR', null, (rows, next) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      stop?.()
      resolve({ rows, next })
    }, (error) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      stop?.()
      reject(error)
    })
    if (finished) stop()
  })
}

async function observeDetail(role: 'student' | 'mentor', requestId: string) {
  selectedClient.firestore = getClientFirestore(apps[role])
  return new Promise<Parameters<Parameters<typeof firebaseConversations.subscribeDetail>[1]>[0]>((resolve, reject) => {
    let stop: (() => void) | undefined
    let finished = false
    const timer = setTimeout(() => { if (!finished) { finished = true; stop?.(); reject(new Error('Conversation detail did not publish.')) } }, 10000)
    stop = firebaseConversations.subscribeDetail(requestId, (detail) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      stop?.()
      resolve(detail)
    }, (error) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      stop?.()
      reject(error)
    })
    if (finished) stop()
  })
}

async function auditAnomalies() {
  const script = fileURLToPath(new URL('../scripts/audit-help-requests.ts', import.meta.url))
  const result = spawnSync(process.execPath, ['--import', 'tsx', script], { env: { ...process.env, GCLOUD_PROJECT: projectId }, encoding: 'utf8' })
  expect([0, 1]).toContain(result.status)
  const parsed = JSON.parse(result.stdout) as { clean: boolean; anomalies: Record<string, number> }
  expect(result.status).toBe(parsed.clean ? 0 : 1)
  return parsed.anomalies
}

async function coordination(requestId: string) {
  const parent = await db.collection('helpRequests').doc(requestId).get()
  const selectedModuleId = parent.data()?.moduleId as string
  const [pair, key, summary, messages] = await Promise.all([
    db.collection('conversations').doc(requestId).get(),
    db.collection('pendingHelpRequestKeys').doc(createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, selectedModuleId].map((part) => `${part.length}:${part}`))).digest('hex')).get(),
    db.collection('helpRequestSummaries').doc(ids.student).get(),
    db.collection('conversations').doc(requestId).collection('messages').get(),
  ])
  return { parent: parent.data() ?? null, pair: pair.data() ?? null, key: key.data() ?? null,
    summary: summary.data() ?? null, messageIds: messages.docs.map((item) => item.id).sort() }
}

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getClientFirestore(apps[role]), '127.0.0.1', 8080)
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f01-conversation-list-${role.toLowerCase()}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection('users').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' || role === 'foreignStudent' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  for (const mentor of ['mentor', 'foreignMentor'] as const) await db.collection('mentorProfiles').doc(ids[mentor]).set({ userId: ids[mentor], biography: '', moduleIds: [moduleId, integrityModuleId], active: true })
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'TC035', title: 'Conversation list', active: true })
  await db.collection('modules').doc(integrityModuleId).set({ id: integrityModuleId, code: 'TC034', title: 'Conversation integrity', active: true })
}, 30000)

afterAll(async () => {
  for (const id of requestIds) {
    await db.collection('conversations').doc(id).delete()
    await db.collection('helpRequests').doc(id).delete()
  }
  for (const student of ['student', 'foreignStudent'] as const) {
    if (ids[student]) {
      const mentor = student === 'student' ? 'mentor' : 'foreignMentor'
      for (const selectedModuleId of [moduleId, integrityModuleId]) {
        const tuple = [ids[student], ids[mentor], selectedModuleId].map((part) => `${part.length}:${part}`)
        await db.collection('pendingHelpRequestKeys').doc(createHash('sha256').update(JSON.stringify(tuple)).digest('hex')).delete()
      }
      await db.collection('helpRequestSummaries').doc(ids[student]).delete()
    }
  }
  for (const { studentId, id } of operationIds) await db.collection('helpRequestOperations').doc(studentId).collection('operations').doc(id).delete()
  await db.collection('modules').doc(moduleId).delete()
  await db.collection('modules').doc(integrityModuleId).delete()
  for (const mentor of ['mentor', 'foreignMentor'] as const) if (ids[mentor]) await db.collection('mentorProfiles').doc(ids[mentor]).delete()
  for (const role of roles) {
    if (ids[role]) { await db.collection('users').doc(ids[role]).delete(); await getAdminAuth(admin).deleteUser(ids[role]) }
    await signOut(getAuth(apps[role]))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

describe('F01/F02 production conversation list under parent-gated Rules (TC-035)', () => {
  it('publishes only accepted own ready/support rows for both roles while broad and foreign reads deny', async () => {
    const ownAccepted = await create('student', 'mentor', 'Own accepted question')
    await accept('mentor', ownAccepted)
    const ownPending = await create('student', 'mentor', 'Own pending question')
    const foreignAccepted = await create('foreignStudent', 'foreignMentor', 'Foreign accepted question')
    await accept('foreignMentor', foreignAccepted)
    const acceptedParent = (await db.collection('helpRequests').doc(ownAccepted).get()).data()!
    const supportId = `support-${crypto.randomUUID()}`
    requestIds.push(supportId)
    await db.collection('helpRequests').doc(supportId).set({ ...acceptedParent, id: supportId, title: 'Own accepted pair needs support' })

    const before = await Promise.all(requestIds.map(async (id) => ({ id, parent: (await db.collection('helpRequests').doc(id).get()).data() ?? null, pair: (await db.collection('conversations').doc(id).get()).data() ?? null })))
    for (const role of ['student', 'mentor'] as const) {
      const observed = await observeList(role)
      expect(observed.next).toBeNull()
      expect(observed.rows).toEqual(expect.arrayContaining([
        { kind: 'ready', request: expect.objectContaining({ id: ownAccepted, status: 'ACCEPTED', studentId: ids.student, mentorId: ids.mentor }) },
        { kind: 'support_needed', requestId: supportId, acceptedAt: acceptedParent.updatedAt.toDate().toISOString() },
      ]))
      expect(observed.rows).toHaveLength(2)
      expect(JSON.stringify(observed.rows)).not.toContain(ownPending)
      expect(JSON.stringify(observed.rows)).not.toContain(foreignAccepted)
      const client = getClientFirestore(apps[role])
      await expect(getDocs(query(collection(client, 'helpRequests'), where('status', '==', 'ACCEPTED'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
      const foreignId = role === 'student' ? ids.foreignStudent : ids.foreignMentor
      await expect(getDocs(query(collection(client, 'helpRequests'), where(role === 'student' ? 'studentId' : 'mentorId', '==', foreignId), where('status', '==', 'ACCEPTED'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(getDocFromServer(doc(client, 'conversations', foreignAccepted))).rejects.toMatchObject({ code: 'permission-denied' })
    }
    const after = await Promise.all(requestIds.map(async (id) => ({ id, parent: (await db.collection('helpRequests').doc(id).get()).data() ?? null, pair: (await db.collection('conversations').doc(id).get()).data() ?? null })))
    expect(after).toEqual(before)
  }, 45000)

  it('fails accepted replay closed for missing and mismatched pairs; both roles see support and the audit blocks release (TC-034/F02-TC-008)', async () => {
    const requestId = await create('student', 'mentor', 'Accepted pair integrity question', integrityModuleId)
    await accept('mentor', requestId)
    const pairRef = db.collection('conversations').doc(requestId)
    const savedPair = (await pairRef.get()).data()!
    const baselineAnomalies = await auditAnomalies()
    for (const variant of ['missing', 'mismatched'] as const) {
      if (variant === 'missing') await pairRef.delete()
      else await pairRef.set({ ...savedPair, participantIds: [ids.mentor, ids.student] })
      const before = await coordination(requestId)
      expect(before.parent).toMatchObject({ id: requestId, status: 'ACCEPTED', studentId: ids.student, mentorId: ids.mentor })
      if (variant === 'missing') expect(before.pair).toBeNull()
      const decision = call<RespondToHelpRequestInput>('mentor', 'respondToHelpRequest')
      for (const operationId of [crypto.randomUUID(), crypto.randomUUID()]) {
        const error = await decision({ operationId, helpRequestId: requestId, response: 'ACCEPTED' })
          .then(() => null, (reason: unknown) => reason) as { code?: string; message?: string; details?: { reason?: string } } | null
        expect(error).toMatchObject({ code: 'functions/failed-precondition', details: { reason: 'INTEGRITY_ERROR' } })
        expect(error?.message).toContain('support review')
        expect(await coordination(requestId)).toEqual(before)
      }
      for (const role of ['student', 'mentor'] as const) {
        const { rows } = await observeList(role)
        expect(rows).toContainEqual({ kind: 'support_needed', requestId, acceptedAt: before.parent!.updatedAt.toDate().toISOString() })
        expect(rows).not.toContainEqual(expect.objectContaining({ kind: 'ready', request: expect.objectContaining({ id: requestId }) }))
        expect(await observeDetail(role, requestId)).toBeNull()
        expect(await coordination(requestId)).toEqual(before)
      }
      const anomalies = await auditAnomalies()
      expect(anomalies.accepted_conversation_mismatch).toBeGreaterThan(baselineAnomalies.accepted_conversation_mismatch ?? 0)
      expect(await coordination(requestId)).toEqual(before)
    }
  }, 60000)
})
