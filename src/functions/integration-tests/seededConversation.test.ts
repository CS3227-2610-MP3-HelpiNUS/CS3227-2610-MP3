import { afterAll, beforeAll, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { deleteApp as deleteAdminApp, getApp as getAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import type { CreateHelpRequestInput, DiscoverMentorsInput, RespondToHelpRequestInput } from '@helpinus/shared'

const projectId = 'helpinus-integration-test'
const student = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'seeded-jamie' }, 'seeded-jamie')
const mentor = initializeApp({ apiKey: 'fake-api-key', projectId, appId: 'seeded-aisha' }, 'seeded-aisha')
let requestId = ''
let jamieId = ''
let aishaId = ''

beforeAll(async () => {
  process.env.FUNCTIONS_EMULATOR = 'true'
  process.env.GCLOUD_PROJECT = projectId
  await import('../scripts/seed-emulator.ts')
  for (const app of [student, mentor]) {
    connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFunctionsEmulator(getFunctions(app, 'asia-southeast1'), '127.0.0.1', 5001)
    connectFirestoreEmulator(getFirestore(app), '127.0.0.1', 8080)
  }
}, 30000)

afterAll(async () => {
  const admin = getAdminApp()
  const db = getAdminFirestore(admin)
  if (requestId) {
    await db.collection('conversations').doc(requestId).delete()
    await db.collection('helpRequests').doc(requestId).delete()
  }
  if (jamieId) {
    const operations = await db.collection('helpRequestOperations').doc(jamieId).collection('operations').get()
    for (const item of operations.docs) await item.ref.delete()
    await db.collection('helpRequestSummaries').doc(jamieId).delete()
  }
  for (const email of ['student@example.test', 'mentor@example.test', 'jamie.tan@example.test', 'aisha@example.test']) {
    const user = await getAdminAuth(admin).getUserByEmail(email)
    await db.collection('mentorProfiles').doc(user.uid).delete()
    await db.collection('mentors').doc(user.uid).delete()
    await getAdminAuth(admin).deleteUser(user.uid)
  }
  for (const id of ['cs2103t', 'cs2040s', 'cs3230']) await db.collection('modules').doc(id).delete()
  await signOut(getAuth(student))
  await signOut(getAuth(mentor))
  await deleteApp(student)
  await deleteApp(mentor)
  await deleteAdminApp(admin)
}, 30000)

it('lets seeded Jamie request Sample Aisha and lets her accept and open the pair', async () => {
  jamieId = (await signInWithEmailAndPassword(getAuth(student), 'jamie.tan@example.test', 'Jamie-demo-123!')).user.uid
  aishaId = (await signInWithEmailAndPassword(getAuth(mentor), 'aisha@example.test', 'Aisha-demo-123!')).user.uid
  const profile = await getDoc(doc(getFirestore(mentor), 'mentorProfiles', aishaId))
  expect(profile.data()?.moduleIds).toContain('cs2103t')
  const discovery = (await httpsCallable<DiscoverMentorsInput, { mentors: Array<{ userId: string; displayName: string }> }>(getFunctions(student, 'asia-southeast1'), 'discoverMentors')({ limit: 20 })).data
  expect(discovery.mentors).toContainEqual(expect.objectContaining({ userId: aishaId, displayName: 'Sample Aisha' }))

  const created = (await httpsCallable<CreateHelpRequestInput, { helpRequest: { id: string } }>(getFunctions(student, 'asia-southeast1'), 'createHelpRequest')({
    operationId: crypto.randomUUID(), mentorId: aishaId, moduleId: 'cs2103t', title: 'Sequence diagrams', description: 'Could you help me understand alternate flows?',
  })).data
  requestId = created.helpRequest.id
  const decided = (await httpsCallable<RespondToHelpRequestInput, { conversationId: string }>(getFunctions(mentor, 'asia-southeast1'), 'respondToHelpRequest')({
    operationId: crypto.randomUUID(), helpRequestId: requestId, response: 'ACCEPTED',
  })).data
  expect(decided.conversationId).toBe(requestId)
  const pair = await getDoc(doc(getFirestore(mentor), 'conversations', requestId))
  expect(pair.exists()).toBe(true)
  expect(pair.data()).toMatchObject({ helpRequestId: requestId, studentId: jamieId, mentorId: aishaId })
  expect((await getDoc(doc(getFirestore(student), 'conversations', requestId))).exists()).toBe(true)
}, 30000)
