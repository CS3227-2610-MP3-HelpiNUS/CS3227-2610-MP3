import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth'
import { collection, connectFirestoreEmulator, doc, documentId, getDocs, getFirestore as getClientFirestore, limit, onSnapshot, orderBy, query, startAfter, Timestamp as ClientTimestamp, updateDoc } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { AcknowledgeMessageInput, CreateHelpRequestInput, RespondToHelpRequestInput, SendMessageInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const admin = initializeAdminApp({ projectId }, 'f02-receipt-admin')
const db = getFirestore(admin)
const roles = ['student', 'mentor'] as const
const apps = Object.fromEntries(roles.map((role) => [role, initializeApp({ apiKey: 'fake-api-key', projectId, appId: `f02-receipt-${role}` }, `f02-receipt-${role}`)])) as Record<typeof roles[number], ReturnType<typeof initializeApp>>
const ids: Record<string, string> = {}
const moduleId = `f02-receipt-module-${crypto.randomUUID()}`
let requestId = ''
const call = <T>(role: typeof roles[number], name: string) => httpsCallable<T, unknown>(getFunctions(apps[role], 'asia-southeast1'), name)
const keyId = () => createHash('sha256').update(JSON.stringify([ids.student, ids.mentor, moduleId].map((part) => `${part.length}:${part}`))).digest('hex')

beforeAll(async () => {
  for (const role of roles) {
    const auth = getAuth(apps[role])
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(getClientFirestore(apps[role]), '127.0.0.1', 8080)
    connectFunctionsEmulator(getFunctions(apps[role], 'asia-southeast1'), '127.0.0.1', 5001)
    const email = `f02-receipt-${role}-${crypto.randomUUID()}@example.test`
    const user = (await createUserWithEmailAndPassword(auth, email, 'Synthetic-123!')).user
    ids[role] = user.uid
    await getAdminAuth(admin).updateUser(user.uid, { emailVerified: true })
    await user.reload()
    await getIdToken(user, true)
    await db.collection('users').doc(user.uid).set({ id: user.uid, email, displayName: role, role: role === 'student' ? 'STUDENT' : 'MENTOR', status: 'ACTIVE', createdAt: Timestamp.now() })
  }
  await db.collection('modules').doc(moduleId).set({ id: moduleId, code: 'CS3227', title: 'Software Engineering', active: true })
  await db.collection('mentorProfiles').doc(ids.mentor).set({ userId: ids.mentor, biography: '', moduleIds: [moduleId], active: true })
  const created = (await call<CreateHelpRequestInput>('student', 'createHelpRequest')({ operationId: crypto.randomUUID(), mentorId: ids.mentor, moduleId, title: 'Receipt question', description: 'Please explain this topic.' })).data as { helpRequest: { id: string } }
  requestId = created.helpRequest.id
  const accepted = (await call<RespondToHelpRequestInput>('mentor', 'respondToHelpRequest')({ operationId: crypto.randomUUID(), helpRequestId: requestId, response: 'ACCEPTED' })).data as { kind: string; conversationId: string }
  expect(accepted).toMatchObject({ kind: 'decided', conversationId: requestId })
}, 30000)

afterAll(async () => {
  if (requestId) {
    const messages = await db.collection('conversations').doc(requestId).collection('messages').get()
    for (const message of messages.docs) await message.ref.delete()
    await db.collection('conversations').doc(requestId).delete()
    await db.collection('helpRequests').doc(requestId).delete()
  }
  if (ids.student) {
    const operations = await db.collection('helpRequestOperations').doc(ids.student).collection('operations').get()
    for (const operation of operations.docs) await operation.ref.delete()
    await db.collection('pendingHelpRequestKeys').doc(keyId()).delete()
    await db.collection('helpRequestSummaries').doc(ids.student).delete()
  }
  await db.collection('modules').doc(moduleId).delete()
  if (ids.mentor) await db.collection('mentorProfiles').doc(ids.mentor).delete()
  for (const role of roles) {
    if (ids[role]) { await db.collection('users').doc(ids[role]).delete(); await getAdminAuth(admin).deleteUser(ids[role]) }
    await signOut(getAuth(apps[role]))
    await deleteApp(apps[role])
  }
  await deleteAdminApp(admin)
}, 30000)

type Row = { id: string; readAt: ClientTimestamp | null }
function watch(ordered: ReturnType<typeof query>) {
  const events: Row[][] = []
  const waiting: Array<{ predicate: (rows: Row[]) => boolean; resolve: (rows: Row[]) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }> = []
  const unsubscribe = onSnapshot(ordered, (snapshot) => {
    const rows = snapshot.docs.map((item) => ({ id: item.id, readAt: item.data().readAt }))
    events.push(rows)
    for (const waiter of [...waiting]) if (waiter.predicate(rows)) {
      clearTimeout(waiter.timer)
      waiting.splice(waiting.indexOf(waiter), 1)
      waiter.resolve(rows)
    }
  }, (error) => { for (const waiter of waiting.splice(0)) { clearTimeout(waiter.timer); waiter.reject(error) } })
  return {
    events,
    unsubscribe,
    waitFor(predicate: (rows: Row[]) => boolean) {
      const existing = events.find(predicate)
      if (existing) return Promise.resolve(existing)
      return new Promise<Row[]>((resolve, reject) => {
        const waiter = { predicate, resolve, reject, timer: setTimeout(() => reject(new Error('Expected live receipt event did not arrive.')), 8000) }
        waiting.push(waiter)
      })
    },
  }
}

describe('F02 two-client persisted read receipts (TC-030)', () => {
  it('moves live and older sender rows from Sent to stable Read only after recipient persistence and re-entry', async () => {
    const messages = db.collection('conversations').doc(requestId).collection('messages')
    const oldId = crypto.randomUUID()
    await call<SendMessageInput>('student', 'sendMessage')({ requestId, messageId: oldId, body: 'Older sender message' })
    const oldBefore = (await messages.doc(oldId).get()).data()!
    await new Promise((resolve) => setTimeout(resolve, 60))
    const recentId = crypto.randomUUID()
    await call<SendMessageInput>('student', 'sendMessage')({ requestId, messageId: recentId, body: 'Recent sender message' })
    const recentBefore = (await messages.doc(recentId).get()).data()!
    const oldMillis = oldBefore.createdAt.toMillis()
    const recentMillis = recentBefore.createdAt.toMillis()
    expect(recentMillis - oldMillis).toBeGreaterThan(2)
    const middle = Timestamp.fromMillis(Math.floor((oldMillis + recentMillis) / 2))
    const fillerIds = Array.from({ length: 21 }, () => crypto.randomUUID())
    const batch = db.batch()
    for (const id of fillerIds) batch.set(messages.doc(id), { senderId: ids.student, body: `Filler ${id}`, createdAt: middle, readAt: null })
    await batch.commit()
    const parent = db.collection('helpRequests').doc(requestId)
    const key = db.collection('pendingHelpRequestKeys').doc(keyId())
    const summary = db.collection('helpRequestSummaries').doc(ids.student)
    const pair = db.collection('conversations').doc(requestId)
    const snapshot = async () => ({
      state: await Promise.all([parent, key, summary, pair].map(async (ref) => (await ref.get()).data() ?? null)),
      messages: (await messages.get()).docs.map((item) => ({ id: item.id, data: item.data() })),
    })
    const before = await snapshot()
    const watchers: Array<ReturnType<typeof watch>> = []
    try {
      const views = {} as Record<typeof roles[number], { recent: ReturnType<typeof watch>; older: ReturnType<typeof watch> }>
      for (const role of roles) {
        const clientMessages = collection(getClientFirestore(apps[role]), 'conversations', requestId, 'messages')
        const recentQuery = query(clientMessages, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20))
        const recentPage = await getDocs(recentQuery)
        expect(recentPage.docs.map((item) => item.id)).toContain(recentId)
        expect(recentPage.docs.map((item) => item.id)).not.toContain(oldId)
        const olderQuery = query(clientMessages, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), startAfter(recentPage.docs.at(-1)!), limit(20))
        const olderPage = await getDocs(olderQuery)
        expect(olderPage.docs.map((item) => item.id)).toContain(oldId)
        views[role] = { recent: watch(recentQuery), older: watch(olderQuery) }
        watchers.push(views[role].recent, views[role].older)
      }
      for (const role of roles) {
        expect((await views[role].recent.waitFor((rows) => rows.some((row) => row.id === recentId && row.readAt === null))).find((row) => row.id === recentId)?.readAt).toBeNull()
        expect((await views[role].older.waitFor((rows) => rows.some((row) => row.id === oldId && row.readAt === null))).find((row) => row.id === oldId)?.readAt).toBeNull()
      }
      for (const role of roles) {
        await expect(updateDoc(doc(getClientFirestore(apps[role]), 'conversations', requestId, 'messages', recentId), { readAt: new Date() })).rejects.toMatchObject({ code: 'permission-denied' })
      }
      expect(await snapshot()).toEqual(before)
      const acknowledge = call<AcknowledgeMessageInput>('mentor', 'acknowledgeMessage')
      const recentReceipt = (await acknowledge({ requestId, messageId: recentId })).data as { readAt: string }
      const afterRecent = await snapshot()
      const persistedRecent = (await messages.doc(recentId).get()).data()!
      expect(persistedRecent.readAt).toBeInstanceOf(Timestamp)
      expect(persistedRecent.readAt.toDate().toISOString()).toBe(recentReceipt.readAt)
      expect(afterRecent.state).toEqual(before.state)
      expect(afterRecent.messages).toEqual(before.messages.map((item) => item.id === recentId ? { ...item, data: { ...item.data, readAt: persistedRecent.readAt } } : item))
      for (const role of roles) {
        const rows = await views[role].recent.waitFor((items) => items.some((item) => item.id === recentId && item.readAt?.toDate?.().toISOString() === recentReceipt.readAt))
        expect(rows.find((item) => item.id === recentId)?.readAt?.toDate?.().toISOString()).toBe(recentReceipt.readAt)
      }
      views.mentor.recent.unsubscribe()
      const mentorRecent = query(collection(getClientFirestore(apps.mentor), 'conversations', requestId, 'messages'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20))
      const reenteredMentor = watch(mentorRecent)
      watchers.push(reenteredMentor)
      await reenteredMentor.waitFor((rows) => rows.some((row) => row.id === recentId && row.readAt?.toDate?.().toISOString() === recentReceipt.readAt))
      expect((await acknowledge({ requestId, messageId: recentId })).data).toEqual(recentReceipt)
      expect(await snapshot()).toEqual(afterRecent)

      const oldReceipt = (await acknowledge({ requestId, messageId: oldId })).data as { readAt: string }
      const afterOld = await snapshot()
      const persistedOld = (await messages.doc(oldId).get()).data()!
      expect(persistedOld.readAt).toBeInstanceOf(Timestamp)
      expect(persistedOld.readAt.toDate().toISOString()).toBe(oldReceipt.readAt)
      expect(afterOld.state).toEqual(before.state)
      expect(afterOld.messages).toEqual(afterRecent.messages.map((item) => item.id === oldId ? { ...item, data: { ...item.data, readAt: persistedOld.readAt } } : item))
      for (const role of roles) {
        const rows = await views[role].older.waitFor((items) => items.some((item) => item.id === oldId && item.readAt?.toDate?.().toISOString() === oldReceipt.readAt))
        expect(rows.find((item) => item.id === oldId)?.readAt?.toDate?.().toISOString()).toBe(oldReceipt.readAt)
      }
      expect((await acknowledge({ requestId, messageId: oldId })).data).toEqual(oldReceipt)
      expect(await snapshot()).toEqual(afterOld)
      views.student.older.unsubscribe()
      const studentMessages = collection(getClientFirestore(apps.student), 'conversations', requestId, 'messages')
      const studentFirstPage = await getDocs(query(studentMessages, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20)))
      const reenteredOld = watch(query(studentMessages, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), startAfter(studentFirstPage.docs.at(-1)!), limit(20)))
      watchers.push(reenteredOld)
      await reenteredOld.waitFor((rows) => rows.some((row) => row.id === oldId && row.readAt?.toDate?.().toISOString() === oldReceipt.readAt))
      expect((await messages.doc(oldId).get()).data()).toEqual({ ...oldBefore, readAt: persistedOld.readAt })
      expect((await messages.doc(recentId).get()).data()).toEqual({ ...recentBefore, readAt: persistedRecent.readAt })
    } finally { watchers.forEach((item) => item.unsubscribe()) }
  }, 60000)
})
