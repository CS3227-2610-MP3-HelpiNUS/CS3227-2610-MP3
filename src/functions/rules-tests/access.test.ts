import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'helpinus-rules-test',
    firestore: { rules: await readFile(new URL('../../../firestore.rules', import.meta.url), 'utf8') },
  })
})
afterAll(async () => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'users/student'), { role: 'STUDENT', status: 'ACTIVE', email: 'student@example.test' })
    await setDoc(doc(db, 'users/mentor'), { role: 'MENTOR', status: 'ACTIVE', email: 'mentor@example.test' })
    await setDoc(doc(db, 'users/suspended'), { role: 'STUDENT', status: 'SUSPENDED', email: 'suspended@example.test' })
    await setDoc(doc(db, 'mentorProfiles/mentor'), { userId: 'mentor', active: true })
    await setDoc(doc(db, 'modules/module'), { code: 'CS3227' })
    await setDoc(doc(db, 'helpRequests/request'), { studentId: 'student', mentorId: 'mentor', status: 'PENDING' })
    await setDoc(doc(db, 'conversations/chat'), { participantIds: ['student', 'mentor'] })
    await setDoc(doc(db, 'conversations/chat/messages/old'), { senderId: 'mentor', body: 'Hi', createdAt: new Date() })
    await setDoc(doc(db, 'availabilitySlots/slot'), { mentorId: 'mentor', withdrawn: false, startsAt: new Date(Date.now() + 60 * 60 * 1000) })
    await setDoc(doc(db, 'appointments/appointment'), { studentId: 'student', mentorId: 'mentor', status: 'PENDING' })
  })
})

describe('approved direct access matrix', () => {
  it('allows an active user to read own profile, active mentor, assigned request and conversation', async () => {
    const db = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(db, 'users/student')))
    await assertSucceeds(getDoc(doc(db, 'mentorProfiles/mentor')))
    await assertFails(getDocs(query(collection(db, 'mentorProfiles'), where('active', '==', true))))
    await assertFails(getDocs(collection(db, 'mentorProfiles')))
    await assertSucceeds(getDoc(doc(db, 'helpRequests/request')))
    await assertSucceeds(getDoc(doc(db, 'conversations/chat')))
    await assertSucceeds(getDoc(doc(db, 'availabilitySlots/slot')))
    await assertSucceeds(getDoc(doc(db, 'appointments/appointment')))
    await assertSucceeds(getDocs(query(collection(db, 'helpRequests'), where('studentId', '==', 'student'))))
    await assertSucceeds(getDocs(query(collection(db, 'conversations'), where('participantIds', 'array-contains', 'student'))))
    await assertSucceeds(getDocs(query(collection(db, 'availabilitySlots'), where('mentorId', '==', 'mentor'), where('withdrawn', '==', false), where('startsAt', '>', new Date()))))
  })
  it('denies cross-user, unauthenticated, inactive, and privileged profile access', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/student')))
    const studentDb = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    await assertFails(getDoc(doc(studentDb, 'users/mentor')))
    await assertFails(updateDoc(doc(studentDb, 'users/student'), { role: 'MENTOR' }))
    await assertFails(updateDoc(doc(studentDb, 'helpRequests/request'), { studentId: 'mentor' }))
    await assertFails(getDocs(collection(studentDb, 'helpRequests')))
    const suspendedDb = env.authenticatedContext('suspended', { email: 'suspended@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(suspendedDb, 'users/suspended')))
    await assertFails(getDoc(doc(suspendedDb, 'helpRequests/request')))
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users/mentor'), { status: 'SUSPENDED' })
    })
    await assertFails(getDoc(doc(studentDb, 'mentorProfiles/mentor')))
    await assertFails(getDoc(doc(studentDb, 'availabilitySlots/slot')))
  })
  it('requires a verified token email that matches the signed-in profile for protected reads', async () => {
    const verified = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(verified, 'modules/module')))
    const unverified = env.authenticatedContext('student', { email: 'student@example.test', email_verified: false }).firestore()
    await assertFails(getDoc(doc(unverified, 'modules/module')))
    const mismatched = env.authenticatedContext('student', { email: 'other@example.test', email_verified: true }).firestore()
    await assertFails(getDoc(doc(mismatched, 'modules/module')))
  })
  it('allows participant message creation with self sender and denies spoofing, edits and deletes', async () => {
    const db = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    const message = doc(db, 'conversations/chat/messages/new')
    await assertSucceeds(setDoc(message, { senderId: 'student', body: 'Hello', createdAt: serverTimestamp() }))
    await assertSucceeds(setDoc(doc(db, 'conversations/chat/messages/multiline'), { senderId: 'student', body: 'Hello\nWorld', createdAt: serverTimestamp() }))
    await assertFails(setDoc(doc(db, 'conversations/chat/messages/spoof'), { senderId: 'mentor', body: 'Hello', createdAt: serverTimestamp() }))
    await assertFails(setDoc(doc(db, 'conversations/chat/messages/blank'), { senderId: 'student', body: ' \t\n ', createdAt: serverTimestamp() }))
    await assertFails(updateDoc(message, { body: 'Edited' }))
    await assertFails(deleteDoc(message))
  })
  it('denies all client writes to workflow, availability, appointment and audit data', async () => {
    const db = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    await assertFails(updateDoc(doc(db, 'helpRequests/request'), { status: 'CLOSED' }))
    await assertFails(setDoc(doc(db, 'availabilitySlots/new'), { mentorId: 'mentor', withdrawn: false }))
    await assertFails(updateDoc(doc(db, 'appointments/appointment'), { status: 'CONFIRMED' }))
    await assertFails(getDoc(doc(db, 'aiAuditEvents/event')))
  })
})
