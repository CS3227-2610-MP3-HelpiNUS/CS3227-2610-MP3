import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, connectFirestoreEmulator, disableNetwork, doc, documentId, enableNetwork, getDocFromServer, getFirestore as getClientFirestore, limit, onSnapshot, orderBy, query, startAfter } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { CreateHelpRequestInput, RespondToHelpRequestInput, SendMessageInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f02-eligibility-replay-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor'] as const
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f02-eligibility-${role}` }, `f02-eligibility-${role}`)])) as Record<typeof roles[number], ReturnType<typeof initializeApp>>
const ids: Record<string, string> = {}
const emails: Record<string, string> = {}
const moduleId = `f02-eligibility-module-${crypto.randomUUID()}`
let requestId = ''
const call = <T>(role: typeof roles[number], name: string) => httpsCallable<T, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)
const keyId = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getClientFirestore(apps[role]), '127.0.0.1', 8080)
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f02-eligibility-${role}-${crypto.randomUUID()}@example.test`
    emails[role] = email
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'CS3227', title: 'Software Engineering', active: true })
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  const created = (await call<CreateHelpRequestInput>('student', 'createHelpRequest')({ operationId: crypto.randomUUID(), mentorId: ids.mentor, moduleId, title: 'Eligibility replay', description: 'Accepted parent' })).data as { helpRequest: { id: string } }
  requestId = created.helpRequest.id
  const accepted = (await call<RespondToHelpRequestInput>('mentor', 'respondToHelpRequest')({ operationId: crypto.randomUUID(), helpRequestId: requestId, response: 'ACCEPTED' })).data as { kind: string; conversationId: string }
  expect(accepted).toMatchObject({ kind: 'decided', conversationId: requestId })
}, 30000)

afterAll(async () => {
  if (requestId) {
    const messages = await db.collection('conversations').doc(requestId).collection('messages').get()
    for (const item of messages.docs) await item.ref.delete()
    await db.collection('conversations').doc(requestId).delete()
    await db.collection('helpRequests').doc(requestId).delete()
  }
  if (ids.student) {
    const operations = await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get()
    for (const item of operations.docs) await item.ref.delete()
    await db.collection('pendingHelpRequestKeys').doc(keyId()).delete()
    await db.collection('helpRequestSummaries').doc(ids.student).delete()
  }
  await db.collection('modules').doc(moduleId).delete()
  if (ids.mentor) await db.collection('mentorProfiles').doc(ids.mentor).delete()
  for (const role of roles) {
    if (ids[role]) { await db.collection(role.toLowerCase().includes('student') ? 'users' : 'mentors').doc(ids[role]).delete(); await getAdminAuth(admin).deleteUser(ids[role]) }
    await signOut(getAuth(apps[role]))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

describe('F02 current eligibility and replay recovery (TC-038)', () => {
  it('rejects current-user revocation, refreshed unverified claims and disabled Auth, then restores original same-ID history', async () => {
    const studentDb = getClientFirestore(apps.student)
    const studentAuth = getAuth(apps.student)
    const userRef = db.collection('users').doc(ids.student)
    const pair = db.collection('conversations').doc(requestId)
    const messageId = crypto.randomUUID()
    const input = { requestId, messageId, body: 'Immutable eligible message' }
    const send = call<SendMessageInput>('student', 'sendMessage')
    const first = (await send(input)).data
    const refs = [db.collection('helpRequests').doc(requestId), db.collection('pendingHelpRequestKeys').doc(keyId()), db.collection('helpRequestSummaries').doc(ids.student), pair]
    const snapshot = async () => ({
      state: await Promise.all(refs.map(async (ref) => (await ref.get()).data() ?? null)),
      messages: (await pair.collection('messages').get()).docs.map((item) => ({ id: item.id, data: item.data() })),
    })
    const original = await snapshot()
    const originalUser = (await userRef.get()).data()!
    const messageRef = doc(studentDb, 'conversations', requestId, 'messages', messageId)

    for (const change of [{ status: 'SUSPENDED' }, { role: 'MENTOR' }, { email: 'wrong-profile@example.test' }]) {
      await userRef.update(change)
      try {
        const revoked = await snapshot()
        await expect(getDocFromServer(messageRef)).rejects.toMatchObject({ code: 'permission-denied' })
        const deniedReply = await send(input).then(() => null, (error: unknown) => error)
        expect(deniedReply, `revoked user-record variant ${JSON.stringify(change)}`).toMatchObject({ code: 'functions/permission-denied' })
        expect(await snapshot()).toEqual(revoked)
      } finally { await userRef.set(originalUser) }
      expect((await getDocFromServer(messageRef)).data()).toMatchObject({ senderId: ids.student, body: input.body })
      expect((await send(input)).data).toEqual(first)
      expect(await snapshot()).toEqual(original)
    }

    const changedEmail = `f02-changed-${crypto.randomUUID()}@integration.invalid`
    await getAdminAuth(admin).updateUser(ids.student, { email: changedEmail, emailVerified: true })
    try {
      await signOut(studentAuth)
      await signInWithEmailAndPassword(studentAuth, changedEmail, 'Synthetic-123!')
      await studentAuth.currentUser!.reload()
      await getIdToken(studentAuth.currentUser!, true)
      const revoked = await snapshot()
      await expect(getDocFromServer(messageRef)).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(send(input)).rejects.toMatchObject({ code: 'functions/permission-denied' })
      expect(await snapshot()).toEqual(revoked)
    } finally {
      await getAdminAuth(admin).updateUser(ids.student, { email: emails.student, emailVerified: true })
      await signOut(studentAuth)
      await signInWithEmailAndPassword(studentAuth, emails.student, 'Synthetic-123!')
      await studentAuth.currentUser!.reload()
      await getIdToken(studentAuth.currentUser!, true)
    }
    expect((await getDocFromServer(messageRef)).data()).toMatchObject({ senderId: ids.student, body: input.body })
    expect((await send(input)).data).toEqual(first)
    expect(await snapshot()).toEqual(original)

    const unverifiedEmail = `f02-unverified-${crypto.randomUUID()}@integration.invalid`
    await getAdminAuth(admin).updateUser(ids.student, { email: unverifiedEmail, emailVerified: false })
    await userRef.update({ email: unverifiedEmail })
    try {
      await signOut(studentAuth)
      await signInWithEmailAndPassword(studentAuth, unverifiedEmail, 'Synthetic-123!')
      await studentAuth.currentUser!.reload()
      await getIdToken(studentAuth.currentUser!, true)
      const revoked = await snapshot()
      await expect(getDocFromServer(messageRef)).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(send(input)).rejects.toMatchObject({ code: 'functions/failed-precondition' })
      expect(await snapshot()).toEqual(revoked)
    } finally {
      await getAdminAuth(admin).updateUser(ids.student, { email: emails.student, emailVerified: true })
      await userRef.set(originalUser)
      await signOut(studentAuth)
      await signInWithEmailAndPassword(studentAuth, emails.student, 'Synthetic-123!')
      await studentAuth.currentUser!.reload()
      await getIdToken(studentAuth.currentUser!, true)
    }
    expect((await getDocFromServer(messageRef)).data()).toMatchObject({ senderId: ids.student, body: input.body })
    expect((await send(input)).data).toEqual(first)
    expect(await snapshot()).toEqual(original)

    await getAdminAuth(admin).updateUser(ids.student, { disabled: true })
    try {
      await expect(getIdToken(studentAuth.currentUser!, true)).rejects.toMatchObject({ code: 'auth/user-disabled' })
      await expect(send(input)).rejects.toMatchObject({ code: expect.stringMatching(/^functions\/(permission-denied|unauthenticated)$/u) })
      expect(await snapshot()).toEqual(original)
    } finally {
      await getAdminAuth(admin).updateUser(ids.student, { disabled: false })
      await signOut(studentAuth)
      await signInWithEmailAndPassword(studentAuth, emails.student, 'Synthetic-123!')
      await studentAuth.currentUser!.reload()
      await getIdToken(studentAuth.currentUser!, true)
    }
    expect((await getDocFromServer(messageRef)).data()).toMatchObject({ senderId: ids.student, body: input.body })
    expect((await send(input)).data).toEqual(first)
    expect(await snapshot()).toEqual(original)
  }, 60000)
})

describe('F02 Rules-backed listener reconnect (TC-037)', () => {
  it('distinguishes first and older page cache gaps from authoritative server rows after reconnect', async () => {
    const studentDb = getClientFirestore(apps.student)
    const messages = db.collection('conversations').doc(requestId).collection('messages')
    const seeded = Array.from({ length: 25 }, (_, index) => ({
      id: crypto.randomUUID(),
      createdAt: Timestamp.fromMillis(Date.now() + 3_600_000 + index * 1000),
      body: `Listener recovery ${index}`,
    }))
    const batch = db.batch()
    for (const item of seeded) batch.set(messages.doc(item.id), { senderId: ids.student, body: item.body, createdAt: item.createdAt, readAt: null })
    await batch.commit()
    const ordered = query(collection(studentDb, 'conversations', requestId, 'messages'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20))
    const firstStates: Array<{ fromCache: boolean; ids: string[] }> = []
    const olderStates: Array<{ fromCache: boolean; ids: string[] }> = []
    const unsubscribes: Array<() => void> = []
    const waitFor = async (ready: () => boolean) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (ready()) return
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error('Timed out waiting for Firestore listener state')
    }
    try {
      await disableNetwork(studentDb)
      unsubscribes.push(onSnapshot(ordered, { includeMetadataChanges: true }, (snapshot) => {
        firstStates.push({ fromCache: snapshot.metadata.fromCache, ids: snapshot.docs.map((item) => item.id) })
      }))
      await waitFor(() => firstStates.some((state) => state.fromCache))
      expect(firstStates.at(-1)?.fromCache).toBe(true)
      await enableNetwork(studentDb)
      await waitFor(() => firstStates.some((state) => !state.fromCache && state.ids.length === 20))
      const first = firstStates.findLast((state) => !state.fromCache && state.ids.length === 20)!
      const expected = [...seeded].reverse().map((item) => item.id)
      expect(first.ids).toEqual(expected.slice(0, 20))

      const boundary = seeded[5]!
      const older = query(collection(studentDb, 'conversations', requestId, 'messages'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), startAfter(boundary.createdAt.toDate(), boundary.id), limit(5))
      await disableNetwork(studentDb)
      unsubscribes.push(onSnapshot(older, { includeMetadataChanges: true }, (snapshot) => {
        olderStates.push({ fromCache: snapshot.metadata.fromCache, ids: snapshot.docs.map((item) => item.id) })
      }))
      await waitFor(() => olderStates.some((state) => state.fromCache))
      expect(olderStates.at(-1)?.fromCache).toBe(true)
      expect(firstStates.at(-1)?.ids).toEqual(first.ids)
      await enableNetwork(studentDb)
      await waitFor(() => olderStates.some((state) => !state.fromCache && state.ids.length === 5))
      const olderResult = olderStates.findLast((state) => !state.fromCache && state.ids.length === 5)!
      expect(olderResult.ids).toEqual(expected.slice(20))
      expect(new Set([...first.ids, ...olderResult.ids]).size).toBe(25)
      expect([...first.ids, ...olderResult.ids]).toEqual(expected)
    } finally {
      unsubscribes.forEach((unsubscribe) => unsubscribe())
      await enableNetwork(studentDb)
      for (const item of seeded) await messages.doc(item.id).delete()
    }
  }, 30000)
})
