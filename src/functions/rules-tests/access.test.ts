import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, documentId, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'

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
    const acceptedAt = new Date()
    await setDoc(doc(db, 'users/student'), { id: 'student', role: 'STUDENT', status: 'ACTIVE', email: 'student@example.test' })
    await setDoc(doc(db, 'users/otherStudent'), { id: 'otherStudent', role: 'STUDENT', status: 'ACTIVE', email: 'otherStudent@example.test' })
    await setDoc(doc(db, 'mentors/mentor'), { id: 'mentor', role: 'MENTOR', status: 'ACTIVE', email: 'mentor@example.test' })
    await setDoc(doc(db, 'mentors/otherMentor'), { id: 'otherMentor', role: 'MENTOR', status: 'ACTIVE', email: 'other@example.test' })
    await setDoc(doc(db, 'users/suspended'), { id: 'suspended', role: 'STUDENT', status: 'SUSPENDED', email: 'suspended@example.test' })
    await setDoc(doc(db, 'mentorProfiles/mentor'), { userId: 'mentor', active: true })
    await setDoc(doc(db, 'mentorProfiles/mentor/private/profileState'), { revision: 1 })
    await setDoc(doc(db, 'mentorProfiles/otherMentor'), { userId: 'otherMentor', active: true })
    await setDoc(doc(db, 'mentorProfiles/otherMentor/private/profileState'), { revision: 2 })
    await setDoc(doc(db, 'mentorProfiles/mentor/saveRequests/request'), { outcome: 'accepted' })
    await setDoc(doc(db, 'modules/module'), { code: 'CS3227' })
    await setDoc(doc(db, 'helpRequests/request'), { id: 'request', studentId: 'student', mentorId: 'mentor', status: 'PENDING' })
    await setDoc(doc(db, 'helpRequests/chat'), { id: 'chat', studentId: 'student', mentorId: 'mentor', status: 'ACCEPTED', updatedAt: acceptedAt })
    await setDoc(doc(db, 'conversations/chat'), { id: 'chat', helpRequestId: 'chat', studentId: 'student', mentorId: 'mentor', participantIds: ['student', 'mentor'], createdAt: acceptedAt, updatedAt: acceptedAt })
    await setDoc(doc(db, 'conversations/chat/messages/old'), { senderId: 'mentor', body: 'Hi', createdAt: new Date() })
    await setDoc(doc(db, 'availabilitySlots/slot'), { mentorId: 'mentor', status: 'OPEN', appointmentId: null, startsAt: new Date(Date.now() + 60 * 60 * 1000) })
    await setDoc(doc(db, 'appointments/appointment'), { studentId: 'student', mentorId: 'mentor', status: 'CONFIRMED', startsAt: new Date(Date.now() + 60 * 60 * 1000) })
    await setDoc(doc(db, 'studentStudyAssistantUsers/student'), { ownerUid: 'student' })
    await setDoc(doc(db, 'studentStudyAssistantUsers/student/studentStudyAssistantConversations/conversation'), { ownerUid: 'student', state: 'ACTIVE' })
    await setDoc(doc(db, 'studentStudyAssistantUsers/student/studentStudyAssistantConversations/conversation/studentStudyAssistantMessages/message'), { role: 'STUDENT', content: 'Private study question' })
    await setDoc(doc(db, 'studentStudyAssistantUsers/student/studentStudyAssistantSendOperations/operation'), { state: 'COMPLETED' })
    await setDoc(doc(db, 'studentStudyAssistantUsers/student/studentStudyAssistantDeleteOperations/operation'), { state: 'COMPLETED' })
    await setDoc(doc(db, 'studentStudyAssistantCorpus/generation/studyChunks/chunk'), { sourceId: 'synthetic-source' })
    await setDoc(doc(db, 'studentStudyAssistantConfig/runtime'), { enabled: true })
    await setDoc(doc(db, 'studentStudyAssistantRateControls/student'), { count: 1 })
    await setDoc(doc(db, 'studentStudyAssistantDeletionTombstones/student/studentStudyAssistantConversations/conversation'), { deletedAt: new Date() })
    await setDoc(doc(db, 'studentStudyAssistantAuditEvents/event'), { featureId: 'S2-D1-F03' })
  })
})

describe('approved direct access matrix', () => {
  it('blocks protected data for dual-role identities but preserves own-profile reads for recovery', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'mentors/student'), { id: 'student', role: 'MENTOR', status: 'ACTIVE', email: 'student@example.test' })
      await setDoc(doc(db, 'users/mentor'), { id: 'mentor', role: 'STUDENT', status: 'ACTIVE', email: 'mentor@example.test' })
    })
    const dualStudent = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    const dualMentor = env.authenticatedContext('mentor', { email: 'mentor@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(dualStudent, 'users/student')))
    await assertSucceeds(getDoc(doc(dualStudent, 'mentors/student')))
    await assertSucceeds(getDoc(doc(dualMentor, 'users/mentor')))
    await assertSucceeds(getDoc(doc(dualMentor, 'mentors/mentor')))
    await assertFails(getDoc(doc(dualStudent, 'mentors/mentor')))
    await assertFails(getDoc(doc(dualMentor, 'users/student')))
    await assertFails(setDoc(doc(dualStudent, 'mentors/student'), { id: 'student', role: 'MENTOR', status: 'ACTIVE' }))
    await assertFails(setDoc(doc(dualMentor, 'users/mentor'), { id: 'mentor', role: 'STUDENT', status: 'ACTIVE' }))
    await assertFails(getDoc(doc(dualStudent, 'helpRequests/request')))
    await assertFails(getDoc(doc(dualMentor, 'helpRequests/request')))
    await assertFails(getDocs(query(collection(dualStudent, 'helpRequests'), where('studentId', '==', 'student'), limit(20))))
    await assertFails(getDocs(query(collection(dualMentor, 'helpRequests'), where('mentorId', '==', 'mentor'), limit(20))))
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      const acceptedAt = new Date()
      await setDoc(doc(db, 'helpRequests/self'), { id: 'self', studentId: 'student', mentorId: 'student', status: 'ACCEPTED', updatedAt: acceptedAt })
      await setDoc(doc(db, 'conversations/self'), { id: 'self', helpRequestId: 'self', studentId: 'student', mentorId: 'student', participantIds: ['student', 'student'], createdAt: acceptedAt, updatedAt: acceptedAt })
    })
    await assertFails(getDoc(doc(dualStudent, 'conversations/self')))
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'mentors/mentor'), { status: 'SUSPENDED' })
    })
    await assertFails(getDoc(doc(dualMentor, 'helpRequests/request')))
    await assertFails(getDoc(doc(dualMentor, 'modules/module')))
  })
  it('does not treat a legacy Mentor record in users as current Mentor authorization', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/legacy'), { id: 'legacy', role: 'MENTOR', status: 'ACTIVE', email: 'legacy@example.test' })
    })
    const legacy = env.authenticatedContext('legacy', { email: 'legacy@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(legacy, 'users/legacy')))
    await assertFails(getDoc(doc(legacy, 'mentors/mentor')))
    await assertFails(getDoc(doc(legacy, 'modules/module')))
    await assertFails(getDoc(doc(legacy, 'helpRequests/request')))
  })
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
    await assertSucceeds(getDocs(query(collection(db, 'helpRequests'), where('studentId', '==', 'student'), limit(20))))
    await assertFails(getDocs(query(collection(db, 'conversations'), where('participantIds', 'array-contains', 'student'))))
    await assertSucceeds(getDocs(query(collection(db, 'availabilitySlots'), where('status', '==', 'OPEN'), where('appointmentId', '==', null), where('startsAt', '>=', new Date(0)), orderBy('startsAt'), limit(100))))
  })
  it('denies cross-user, unauthenticated, inactive, and privileged profile access', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/student')))
    const studentDb = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    await assertFails(getDoc(doc(studentDb, 'mentors/mentor')))
    await assertFails(getDoc(doc(studentDb, 'mentorProfiles/mentor/saveRequests/request')))
    await assertFails(setDoc(doc(studentDb, 'mentorProfiles/mentor/saveRequests/request'), { outcome: 'accepted' }))
    await assertFails(getDoc(doc(studentDb, 'mentorProfiles/mentor/private/profileState')))
    await assertFails(getDocs(collection(studentDb, 'mentorProfiles/mentor/private')))
    await assertFails(setDoc(doc(studentDb, 'mentorProfiles/mentor/private/profileState'), { revision: 999 }))
    await assertFails(updateDoc(doc(studentDb, 'mentorProfiles/mentor'), { biography: 'forged' }))
    const mentorDb = env.authenticatedContext('mentor', { email: 'mentor@example.test', email_verified: true }).firestore()
    await assertFails(getDoc(doc(mentorDb, 'mentorProfiles/mentor/saveRequests/request')))
    await assertFails(setDoc(doc(mentorDb, 'mentorProfiles/mentor/saveRequests/request'), { outcome: 'accepted' }))
    await assertFails(getDoc(doc(mentorDb, 'mentorProfiles/mentor/private/profileState')))
    await assertFails(updateDoc(doc(mentorDb, 'mentorProfiles/mentor/private/profileState'), { revision: 999 }))
    await assertFails(updateDoc(doc(mentorDb, 'mentorProfiles/mentor'), { biography: 'forged' }))
    await assertFails(updateDoc(doc(studentDb, 'users/student'), { role: 'MENTOR' }))
    await assertFails(updateDoc(doc(studentDb, 'helpRequests/request'), { studentId: 'mentor' }))
    await assertFails(getDocs(collection(studentDb, 'helpRequests')))
    const suspendedDb = env.authenticatedContext('suspended', { email: 'suspended@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(suspendedDb, 'users/suspended')))
    await assertFails(getDoc(doc(suspendedDb, 'helpRequests/request')))
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'mentors/mentor'), { status: 'SUSPENDED' })
    })
    await assertFails(getDoc(doc(studentDb, 'mentorProfiles/mentor')))
    await assertFails(getDoc(doc(studentDb, 'availabilitySlots/slot')))
  })
  it('requires a verified token email that matches the signed-in profile for protected reads', async () => {
    const verified = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(verified, 'modules/module')))
    const unverified = env.authenticatedContext('student', { email: 'student@example.test', email_verified: false }).firestore()
    await assertFails(getDoc(doc(unverified, 'modules/module')))
    await assertFails(getDoc(doc(unverified, 'mentorProfiles/mentor')))
    const mismatched = env.authenticatedContext('student', { email: 'other@example.test', email_verified: true }).firestore()
    await assertFails(getDoc(doc(mismatched, 'modules/module')))
  })
  it('denies protected reads when the stored user ID does not match the authenticated path', async () => {
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(student, 'conversations/chat')))
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users/student'), { id: 'copied-user' })
    })
    await assertFails(getDoc(doc(student, 'conversations/chat')))
    await assertFails(getDoc(doc(student, 'conversations/chat/messages/old')))
    await assertFails(getDocs(query(collection(student, 'helpRequests'), where('studentId', '==', 'student'), limit(20))))
  })
  it('denies create, update, delete and list for own and other profile private paths', async () => {
    const mentorDb = env.authenticatedContext('mentor', { email: 'mentor@example.test', email_verified: true }).firestore()
    const studentDb = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    for (const db of [mentorDb, studentDb]) {
      await assertFails(setDoc(doc(db, 'mentorProfiles/new'), { userId: 'new', active: true }))
      await assertFails(deleteDoc(doc(db, 'mentorProfiles/mentor')))
      await assertFails(updateDoc(doc(db, 'mentorProfiles/otherMentor'), { biography: 'forged' }))
      await assertFails(getDocs(collection(db, 'mentorProfiles/mentor/saveRequests')))
      await assertFails(getDocs(collection(db, 'mentorProfiles/mentor/private')))
      await assertFails(getDoc(doc(db, 'mentorProfiles/otherMentor/private/profileState')))
      await assertFails(deleteDoc(doc(db, 'mentorProfiles/mentor/private/profileState')))
      await assertFails(deleteDoc(doc(db, 'mentorProfiles/mentor/saveRequests/request')))
    }
    await assertSucceeds(getDoc(doc(studentDb, 'mentorProfiles/otherMentor')))
  })
  it('denies all direct message writes while allowing bounded participant reads', async () => {
    const db = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    const message = doc(db, 'conversations/chat/messages/new')
    await assertFails(setDoc(message, { senderId: 'student', body: 'Hello', createdAt: serverTimestamp() }))
    await assertFails(setDoc(doc(db, 'conversations/chat/messages/multiline'), { senderId: 'student', body: 'Hello\nWorld', createdAt: serverTimestamp() }))
    await assertFails(setDoc(doc(db, 'conversations/chat/messages/spoof'), { senderId: 'mentor', body: 'Hello', createdAt: serverTimestamp() }))
    await assertFails(setDoc(doc(db, 'conversations/chat/messages/blank'), { senderId: 'student', body: ' \t\n ', createdAt: serverTimestamp() }))
    await assertFails(updateDoc(message, { body: 'Edited' }))
    await assertFails(deleteDoc(message))
    await assertSucceeds(getDocs(query(collection(db, 'conversations/chat/messages'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20))))
    await assertFails(getDocs(query(collection(db, 'conversations/chat/messages'), orderBy('createdAt', 'desc'), limit(21))))
  })
  it('denies all client writes to workflow, availability, appointment and audit data', async () => {
    const db = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    await assertFails(updateDoc(doc(db, 'helpRequests/request'), { status: 'CLOSED' }))
    await assertFails(setDoc(doc(db, 'availabilitySlots/new'), { mentorId: 'mentor', status: 'OPEN', appointmentId: null }))
    await assertFails(updateDoc(doc(db, 'appointments/appointment'), { status: 'CONFIRMED' }))
    await assertFails(getDoc(doc(db, 'aiAuditEvents/event')))
  })

  it('keeps every Student Study Assistant namespace callable-only for every identity', async () => {
    const databases = [
      env.unauthenticatedContext().firestore(),
      env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore(),
      env.authenticatedContext('mentor', { email: 'mentor@example.test', email_verified: true }).firestore(),
      env.authenticatedContext('suspended', { email: 'suspended@example.test', email_verified: true }).firestore(),
    ]
    const documents = [
      'studentStudyAssistantUsers/student',
      'studentStudyAssistantUsers/student/studentStudyAssistantConversations/conversation',
      'studentStudyAssistantUsers/student/studentStudyAssistantConversations/conversation/studentStudyAssistantMessages/message',
      'studentStudyAssistantUsers/student/studentStudyAssistantSendOperations/operation',
      'studentStudyAssistantUsers/student/studentStudyAssistantDeleteOperations/operation',
      'studentStudyAssistantCorpus/generation/studyChunks/chunk',
      'studentStudyAssistantConfig/runtime',
      'studentStudyAssistantRateControls/student',
      'studentStudyAssistantDeletionTombstones/student/studentStudyAssistantConversations/conversation',
      'studentStudyAssistantAuditEvents/event',
    ]
    const collections = [
      'studentStudyAssistantUsers',
      'studentStudyAssistantUsers/student/studentStudyAssistantConversations',
      'studentStudyAssistantUsers/student/studentStudyAssistantConversations/conversation/studentStudyAssistantMessages',
      'studentStudyAssistantUsers/student/studentStudyAssistantSendOperations',
      'studentStudyAssistantUsers/student/studentStudyAssistantDeleteOperations',
      'studentStudyAssistantCorpus/generation/studyChunks',
      'studentStudyAssistantConfig',
      'studentStudyAssistantRateControls',
      'studentStudyAssistantDeletionTombstones/student/studentStudyAssistantConversations',
      'studentStudyAssistantAuditEvents',
    ]
    for (const db of databases) {
      for (const path of documents) {
        await assertFails(getDoc(doc(db, path)))
        await assertFails(setDoc(doc(db, path), { forged: true }))
        await assertFails(deleteDoc(doc(db, path)))
      }
      for (const path of collections) await assertFails(getDocs(collection(db, path)))
    }
  })

  it('allows only bounded consultation projections for eligible owners and open schedulable slots', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000)
      await setDoc(doc(db, 'availabilitySlots/booked'), { mentorId: 'mentor', status: 'BOOKED', appointmentId: 'appointment', startsAt })
      await setDoc(doc(db, 'availabilitySlots/foreignOpen'), { mentorId: 'otherMentor', status: 'OPEN', appointmentId: null, startsAt })
      await setDoc(doc(db, 'appointments/foreign'), { studentId: 'otherStudent', mentorId: 'otherMentor', status: 'CONFIRMED', startsAt })
    })
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    const mentor = env.authenticatedContext('mentor', { email: 'mentor@example.test', email_verified: true }).firestore()
    const otherStudent = env.authenticatedContext('otherStudent', { email: 'otherStudent@example.test', email_verified: true }).firestore()

    await assertSucceeds(getDocs(query(collection(student, 'availabilitySlots'), where('status', '==', 'OPEN'), where('appointmentId', '==', null), where('startsAt', '>=', new Date(0)), orderBy('startsAt'), limit(100))))
    await assertSucceeds(getDocs(query(collection(student, 'availabilitySlots'), where('status', '==', 'OPEN'), where('appointmentId', '==', null), where('startsAt', '>=', new Date(0)), where('startsAt', '<', new Date('2100-01-01T00:00:00.000Z')), orderBy('startsAt', 'asc'), orderBy(documentId(), 'asc'), limit(100))))
    await assertFails(getDocs(query(collection(student, 'availabilitySlots'), orderBy('startsAt'), limit(100))))
    await assertFails(getDocs(query(collection(student, 'availabilitySlots'), where('status', '==', 'OPEN'), orderBy('startsAt'), limit(101))))
    await assertFails(getDoc(doc(student, 'availabilitySlots/booked')))
    await assertSucceeds(getDoc(doc(mentor, 'availabilitySlots/booked')))
    await assertSucceeds(getDocs(query(collection(mentor, 'availabilitySlots'), where('mentorId', '==', 'mentor'), where('startsAt', '>=', new Date(0)), orderBy('startsAt'), limit(100))))
    await assertSucceeds(getDocs(query(collection(mentor, 'availabilitySlots'), where('mentorId', '==', 'mentor'), where('startsAt', '>=', new Date(0)), where('startsAt', '<', new Date('2100-01-01T00:00:00.000Z')), orderBy('startsAt', 'asc'), orderBy(documentId(), 'asc'), limit(100))))
    await assertFails(getDocs(query(collection(mentor, 'availabilitySlots'), where('mentorId', '==', 'otherMentor'), limit(100))))

    await assertSucceeds(getDocs(query(collection(student, 'appointments'), where('studentId', '==', 'student'), orderBy('startsAt', 'desc'), limit(100))))
    await assertSucceeds(getDocs(query(collection(mentor, 'appointments'), where('mentorId', '==', 'mentor'), orderBy('startsAt', 'desc'), limit(100))))
    await assertSucceeds(getDocs(query(collection(student, 'appointments'), where('studentId', '==', 'student'), where('startsAt', '>=', new Date(0)), orderBy('startsAt', 'asc'), orderBy(documentId(), 'asc'), limit(100))))
    await assertSucceeds(getDocs(query(collection(mentor, 'appointments'), where('mentorId', '==', 'mentor'), where('startsAt', '<', new Date('2100-01-01T00:00:00.000Z')), orderBy('startsAt', 'desc'), orderBy(documentId(), 'desc'), limit(100))))
    await assertFails(getDocs(query(collection(student, 'appointments'), limit(100))))
    await assertFails(getDoc(doc(student, 'appointments/foreign')))
    await assertSucceeds(getDoc(doc(otherStudent, 'appointments/foreign')))
  })

  it('keeps scheduling receipts and overlap locks private', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'appointmentOperations/student/operations/request'), { action: 'RESERVE_APPOINTMENT' })
      await setDoc(doc(context.firestore(), 'availabilitySlotLocks/lock'), { mentorId: 'mentor', slotId: 'slot' })
      await setDoc(doc(context.firestore(), 'studentAppointmentLocks/lock'), { studentId: 'student', appointmentId: 'appointment' })
    })
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    for (const path of ['appointmentOperations/student/operations/request', 'availabilitySlotLocks/lock', 'studentAppointmentLocks/lock']) {
      await assertFails(getDoc(doc(student, path)))
      await assertFails(setDoc(doc(student, path), { forged: true }))
    }
  })
})

describe('F01 owner queries and private coordination', () => {
  function listenOnce(target: Parameters<typeof onSnapshot>[0]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { unsubscribe(); reject(new Error('Timed out waiting for authoritative listener result')) }, 10000)
      const unsubscribe = onSnapshot(target, (snapshot) => {
        if (snapshot.metadata.fromCache) return
        clearTimeout(timer)
        unsubscribe()
        resolve(snapshot)
      }, (error) => {
        clearTimeout(timer)
        unsubscribe()
        reject(error)
      })
    })
  }

  it('applies the same participant policy to get, bounded list and listeners', async () => {
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    const mentor = env.authenticatedContext('mentor', { email: 'mentor@example.test', email_verified: true }).firestore()
    const foreign = env.authenticatedContext('otherMentor', { email: 'other@example.test', email_verified: true }).firestore()
    expect((await assertSucceeds(getDoc(doc(student, 'helpRequests/request')))).data()?.status).toBe('PENDING')
    expect((await assertSucceeds(getDoc(doc(mentor, 'helpRequests/request')))).data()?.status).toBe('PENDING')
    await assertFails(getDoc(doc(foreign, 'helpRequests/request')))
    await assertFails(getDoc(doc(student, 'helpRequests/guessed')))
    expect((await assertSucceeds(getDocs(query(collection(student, 'helpRequests'), where('studentId', '==', 'student'), limit(20))))).docs.map((item) => item.id)).toEqual(['chat', 'request'])
    expect((await assertSucceeds(getDocs(query(collection(mentor, 'helpRequests'), where('mentorId', '==', 'mentor'), limit(20))))).size).toBe(2)

    const statuses: string[] = []
    await new Promise<void>((resolve, reject) => {
      const unsubscribe = onSnapshot(doc(student, 'helpRequests/request'), (snapshot) => {
        statuses.push(snapshot.data()?.status as string)
        if (statuses.length === 1) {
          env.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), 'helpRequests/request'), { status: 'REJECTED' })).catch(reject)
        } else { unsubscribe(); resolve() }
      }, reject)
    })
    expect(statuses).toEqual(['PENDING', 'REJECTED'])
  }, 10000)

  it('denies fresh request reads after current account role, status or email changes', async () => {
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(student, 'helpRequests/request')))
    for (const change of [{ role: 'MENTOR' }, { status: 'SUSPENDED' }, { email: 'changed@example.test' }]) {
      await env.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), 'users/student'), change))
      await assertFails(getDoc(doc(student, 'helpRequests/request')))
      await assertFails(getDocs(query(collection(student, 'helpRequests'), where('studentId', '==', 'student'), limit(20))))
      await env.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), 'users/student'), { role: 'STUDENT', status: 'ACTIVE', email: 'student@example.test' }))
    }
    const unverified = env.authenticatedContext('student', { email: 'student@example.test', email_verified: false }).firestore()
    await assertFails(getDoc(doc(unverified, 'helpRequests/request')))
  }, 10000)

  it('allows bounded owner queries and denies broad, foreign or unbounded queries', async () => {
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    const mentor = env.authenticatedContext('mentor', { email: 'mentor@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDocs(query(collection(student, 'helpRequests'), where('studentId', '==', 'student'), limit(20))))
    await assertSucceeds(getDocs(query(collection(mentor, 'helpRequests'), where('mentorId', '==', 'mentor'), limit(20))))
    await assertFails(getDocs(query(collection(student, 'helpRequests'), where('studentId', '==', 'mentor'), limit(20))))
    await assertFails(getDocs(query(collection(mentor, 'helpRequests'), where('studentId', '==', 'student'), limit(20))))
    await assertFails(getDocs(query(collection(student, 'helpRequests'), where('studentId', '==', 'student'))))
    await assertFails(getDocs(query(collection(student, 'helpRequests'), limit(20))))
    await assertFails(getDocs(query(collection(student, 'helpRequests'), where('studentId', '==', 'student'), limit(21))))
  })
  it('keeps request writes and receipts, keys and summaries private', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'helpRequestSummaries/student'), { pendingCount: 1, acceptedCount: 0, rejectedCount: 0, openCount: 1 })
      await setDoc(doc(context.firestore(), 'pendingHelpRequestKeys/key'), { helpRequestId: 'request' })
      await setDoc(doc(context.firestore(), 'helpRequestOperations/student/operations/op'), { kind: 'CREATED' })
    })
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    const mentor = env.authenticatedContext('mentor', { email: 'mentor@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(student, 'helpRequestSummaries/student')))
    for (const db of [student, mentor]) {
      await assertFails(setDoc(doc(db, 'helpRequests/new'), { studentId: 'student', mentorId: 'mentor', status: 'PENDING' }))
      await assertFails(updateDoc(doc(db, 'helpRequests/request'), { status: 'ACCEPTED' }))
      await assertFails(deleteDoc(doc(db, 'helpRequests/request')))
      await assertFails(getDoc(doc(db, 'pendingHelpRequestKeys/key')))
      await assertFails(getDoc(doc(db, 'helpRequestOperations/student/operations/op')))
      await assertFails(setDoc(doc(db, 'pendingHelpRequestKeys/new'), { helpRequestId: 'new' }))
      await assertFails(setDoc(doc(db, 'helpRequestOperations/student/operations/new'), { kind: 'CREATED' }))
      await assertFails(setDoc(doc(db, 'helpRequestSummaries/student'), { openCount: 999 }))
    }
    await assertFails(getDoc(doc(mentor, 'helpRequestSummaries/student')))
  })

  it('F01-TC-036 denies foreign, guessed and ineligible request listeners as well as reads', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/otherStudent'), { id: 'otherStudent', role: 'STUDENT', status: 'ACTIVE', email: 'otherStudent@example.test' })
    })
    const own = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    const mentor = env.authenticatedContext('mentor', { email: 'mentor@example.test', email_verified: true }).firestore()
    const foreignMentor = env.authenticatedContext('otherMentor', { email: 'other@example.test', email_verified: true }).firestore()
    const foreignStudent = env.authenticatedContext('otherStudent', { email: 'otherStudent@example.test', email_verified: true }).firestore()
    const unverified = env.authenticatedContext('student', { email: 'student@example.test', email_verified: false }).firestore()
    const staleEmail = env.authenticatedContext('student', { email: 'wrong@example.test', email_verified: true }).firestore()
    const suspended = env.authenticatedContext('suspended', { email: 'suspended@example.test', email_verified: true }).firestore()
    expect((await listenOnce(doc(own, 'helpRequests/request')) as { data(): Record<string, unknown> }).data().studentId).toBe('student')
    expect((await listenOnce(doc(mentor, 'helpRequests/request')) as { data(): Record<string, unknown> }).data().mentorId).toBe('mentor')
    for (const db of [foreignMentor, foreignStudent, unverified, staleEmail, suspended]) {
      await assertFails(getDoc(doc(db, 'helpRequests/request')))
      await expect(listenOnce(doc(db, 'helpRequests/request'))).rejects.toMatchObject({ code: 'permission-denied' })
    }
    await assertFails(getDoc(doc(own, 'helpRequests/guessed')))
    await expect(listenOnce(doc(own, 'helpRequests/guessed'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(listenOnce(query(collection(foreignMentor, 'helpRequests'), where('mentorId', '==', 'mentor'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(listenOnce(query(collection(foreignStudent, 'helpRequests'), where('studentId', '==', 'student'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
    for (const db of [unverified, staleEmail, suspended]) {
      await assertFails(getDocs(query(collection(db, 'helpRequests'), where('studentId', '==', 'student'), limit(20))))
      await expect(listenOnce(query(collection(db, 'helpRequests'), where('studentId', '==', 'student'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
    }
    await env.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), 'users/student'), { role: 'MENTOR' }))
    await assertFails(getDoc(doc(own, 'helpRequests/request')))
    await expect(listenOnce(doc(own, 'helpRequests/request'))).rejects.toMatchObject({ code: 'permission-denied' })
    await assertFails(getDocs(query(collection(own, 'helpRequests'), where('studentId', '==', 'student'), limit(20))))
    await expect(listenOnce(query(collection(own, 'helpRequests'), where('studentId', '==', 'student'), limit(20)))).rejects.toMatchObject({ code: 'permission-denied' })
  }, 30000)

  it('F01-TC-037 rejects broad and wrong-owner listeners despite only own visible rows', async () => {
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    const own = query(collection(student, 'helpRequests'), where('studentId', '==', 'student'), limit(20))
    const rows = await listenOnce(own) as { docs: Array<{ id: string }> }
    expect(rows.docs.map((row) => row.id)).toEqual(['chat', 'request'])
    for (const denied of [
      query(collection(student, 'helpRequests'), limit(20)),
      query(collection(student, 'helpRequests'), where('studentId', '==', 'otherMentor'), limit(20)),
      query(collection(student, 'helpRequests'), where('studentId', '==', 'student')),
      query(collection(student, 'helpRequests'), where('studentId', '==', 'student'), limit(21)),
    ]) await expect(listenOnce(denied)).rejects.toMatchObject({ code: 'permission-denied' })
  }, 30000)

  it('F01-TC-038 denies own/foreign mutation and private collection listing without changing Admin records', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'helpRequestSummaries/student'), { pendingCount: 1, acceptedCount: 0, rejectedCount: 0, openCount: 1 })
      await setDoc(doc(db, 'pendingHelpRequestKeys/key'), { helpRequestId: 'request' })
      await setDoc(doc(db, 'helpRequestOperations/student/operations/op'), { kind: 'CREATED' })
    })
    const paths = ['helpRequests', 'helpRequestSummaries', 'pendingHelpRequestKeys', 'helpRequestOperations/student/operations']
    async function adminSnapshot() {
      let result: Record<string, unknown> = {}
      await env.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        result = Object.fromEntries(await Promise.all(paths.map(async (path) => [path,
          (await getDocs(collection(db, path))).docs.map((row) => [row.id, row.data()]).sort(([a], [b]) => String(a).localeCompare(String(b))),
        ])))
      })
      return result
    }
    const before = await adminSnapshot()
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    const mentor = env.authenticatedContext('mentor', { email: 'mentor@example.test', email_verified: true }).firestore()
    for (const db of [student, mentor]) {
      for (const id of ['request', 'new', 'chat']) {
        await assertFails(setDoc(doc(db, `helpRequests/${id}`), { id, studentId: 'mentor', mentorId: 'student', status: 'ACCEPTED' }))
        if (id !== 'new') {
          await assertFails(updateDoc(doc(db, `helpRequests/${id}`), { studentId: 'mentor', mentorId: 'student', status: 'REJECTED' }))
          await assertFails(deleteDoc(doc(db, `helpRequests/${id}`)))
        }
      }
      for (const path of ['pendingHelpRequestKeys/key', 'helpRequestOperations/student/operations/op', 'helpRequestSummaries/student']) {
        await assertFails(getDocs(collection(db, path.substring(0, path.lastIndexOf('/')))))
        await assertFails(setDoc(doc(db, path), { forged: true }))
        await assertFails(updateDoc(doc(db, path), { forged: true }))
        await assertFails(deleteDoc(doc(db, path)))
      }
    }
    expect((await assertSucceeds(getDoc(doc(student, 'helpRequestSummaries/student')))).data()?.openCount).toBe(1)
    await assertFails(getDoc(doc(mentor, 'helpRequestSummaries/student')))
    expect(await adminSnapshot()).toEqual(before)
  }, 30000)

})

describe('F01/F02 accepted-parent access boundary', () => {
  it('fails closed for malformed accepted parent and pair variants for both participants', async () => {
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    const mentor = env.authenticatedContext('mentor', { email: 'mentor@example.test', email_verified: true }).firestore()
    const variants = [
      { path: 'helpRequests/chat', change: { id: 'another-request' } },
      { path: 'helpRequests/chat', change: { status: 'PENDING' } },
      { path: 'helpRequests/chat', change: { studentId: 'someone-else' } },
      { path: 'helpRequests/chat', change: { mentorId: 'otherMentor' } },
      { path: 'helpRequests/chat', change: { updatedAt: new Date(0) } },
      { path: 'conversations/chat', change: { id: 'another-conversation' } },
      { path: 'conversations/chat', change: { helpRequestId: 'another-request' } },
      { path: 'conversations/chat', change: { participantIds: ['mentor', 'student'] } },
      { path: 'conversations/chat', change: { unsupportedPrivateField: 'sentinel' } },
    ]
    for (const variant of variants) {
      let original: Record<string, unknown> | undefined
      await env.withSecurityRulesDisabled(async (context) => {
        const ref = doc(context.firestore(), variant.path)
        original = (await getDoc(ref)).data()
        await updateDoc(ref, variant.change)
      })
      try {
        for (const db of [student, mentor]) {
          await assertFails(getDoc(doc(db, 'conversations/chat')))
          await assertFails(getDoc(doc(db, 'conversations/chat/messages/old')))
        }
      } finally {
        await env.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), variant.path), original!))
      }
    }
    await assertSucceeds(getDoc(doc(student, 'conversations/chat')))
    await assertSucceeds(getDoc(doc(mentor, 'conversations/chat')))
  }, 30000)

  it('denies a matching conversation when its accepted parent stores a foreign request ID', async () => {
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(student, 'conversations/chat')))
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'helpRequests/chat'), { id: 'different-request' })
    })
    await assertFails(getDoc(doc(student, 'conversations/chat')))
    await assertFails(getDoc(doc(student, 'conversations/chat/messages/old')))
    await assertFails(getDocs(query(collection(student, 'conversations/chat/messages'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(20))))
  })

  it('denies an otherwise matching pair with a corrupt acceptance timestamp', async () => {
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(student, 'conversations/chat')))
    await env.withSecurityRulesDisabled(async (context) => { await updateDoc(doc(context.firestore(), 'conversations/chat'), { updatedAt: new Date(0) }) })
    await assertFails(getDoc(doc(student, 'conversations/chat')))
    await assertFails(getDoc(doc(student, 'conversations/chat/messages/old')))
  })
  it('uses bounded accepted owner request queries as the conversation list index', async () => {
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    const mentor = env.authenticatedContext('mentor', { email: 'mentor@example.test', email_verified: true }).firestore()
    for (const [db, field, uid] of [[student, 'studentId', 'student'], [mentor, 'mentorId', 'mentor']] as const) {
      await assertSucceeds(getDocs(query(collection(db, 'helpRequests'), where(field, '==', uid), where('status', '==', 'ACCEPTED'), orderBy('updatedAt', 'desc'), orderBy(documentId(), 'desc'), limit(20))))
      await assertFails(getDocs(query(collection(db, 'helpRequests'), where('status', '==', 'ACCEPTED'), orderBy('updatedAt', 'desc'), limit(20))))
      await assertFails(getDocs(query(collection(db, 'helpRequests'), where(field, '==', uid), where('status', '==', 'ACCEPTED'), orderBy('updatedAt', 'desc'), limit(21))))
    }
  })
  it('denies chats and messages for pending, rejected and mismatched parents', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'conversations/request'), { helpRequestId: 'request', studentId: 'student', mentorId: 'mentor', participantIds: ['student', 'mentor'] })
      await setDoc(doc(db, 'helpRequests/rejected'), { id: 'rejected', studentId: 'student', mentorId: 'mentor', status: 'REJECTED' })
      await setDoc(doc(db, 'conversations/rejected'), { helpRequestId: 'rejected', studentId: 'student', mentorId: 'mentor', participantIds: ['student', 'mentor'] })
      await setDoc(doc(db, 'conversations/mismatch'), { helpRequestId: 'chat', studentId: 'student', mentorId: 'otherMentor', participantIds: ['student', 'otherMentor'] })
    })
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    for (const id of ['request', 'rejected', 'mismatch']) {
      await assertFails(getDoc(doc(student, `conversations/${id}`)))
      await assertFails(setDoc(doc(student, `conversations/${id}/messages/hostile`), { senderId: 'student', body: 'Hello', createdAt: serverTimestamp() }))
    }
    await assertSucceeds(getDoc(doc(student, 'conversations/chat')))
    await assertFails(setDoc(doc(student, 'conversations/new'), { helpRequestId: 'chat', studentId: 'student', mentorId: 'mentor', participantIds: ['student', 'mentor'] }))
  })

  it('revokes accepted conversation access when a participant no longer has the parent role', async () => {
    const student = env.authenticatedContext('student', { email: 'student@example.test', email_verified: true }).firestore()
    await assertSucceeds(getDoc(doc(student, 'conversations/chat')))
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users/student'), { role: 'MENTOR' })
    })
    await assertFails(getDoc(doc(student, 'conversations/chat')))
    await assertFails(getDoc(doc(student, 'conversations/chat/messages/old')))
  })
})
