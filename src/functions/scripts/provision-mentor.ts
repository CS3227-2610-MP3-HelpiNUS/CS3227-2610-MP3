import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { assertGoogleMentorIdentity } from '../src/googleMentorProvisioning.js'

const [email, displayName] = process.argv.slice(2)
if (!email || !displayName) throw new Error('Usage: npm run provision-mentor -- <email> <display name>')
const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID
if (!projectId) throw new Error('Set GCLOUD_PROJECT or FIREBASE_PROJECT_ID for the target Firebase project.')

initializeApp({ credential: applicationDefault(), projectId })
const auth = getAuth()
const db = getFirestore()
const identity = await auth.getUserByEmail(email).catch((error: { code?: string }) => {
  if (error.code === 'auth/user-not-found') {
    throw new Error('The Mentor must sign in with Google once before provisioning their trusted profile.')
  }
  throw error
})
assertGoogleMentorIdentity(identity, email)
const mentorRef = db.collection('mentors').doc(identity.uid)
const domainRef = db.collection('mentorProfiles').doc(identity.uid)
await db.runTransaction(async (tx) => {
  const [mentor, domain, student] = await Promise.all([tx.get(mentorRef), tx.get(domainRef), tx.get(db.collection('users').doc(identity.uid))])
  if (student.exists && student.data()?.role !== 'MENTOR') throw new Error('This Google account already has a Student profile; refusing cross-role provisioning.')
  if (mentor.exists) {
    const record = mentor.data()
    if (record?.id !== identity.uid || record.email !== email || record.role !== 'MENTOR') {
      throw new Error('Existing Mentor record differs; refusing to overwrite it.')
    }
  } else {
    tx.create(mentorRef, {
      id: identity.uid, displayName, email, role: 'MENTOR', status: 'ACTIVE', createdAt: FieldValue.serverTimestamp(),
    })
  }
  if (!domain.exists) tx.create(domainRef, { userId: identity.uid, biography: '', moduleIds: [], active: true })
})
console.info(`Provisioned mentor profile for ${email} (${identity.uid}) in ${projectId}.`)
