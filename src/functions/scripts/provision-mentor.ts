import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const [email, displayName] = process.argv.slice(2)
if (!email || !displayName) throw new Error('Usage: npm run provision-mentor -- <email> <display name>')
const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID
if (!projectId) throw new Error('Set GCLOUD_PROJECT or FIREBASE_PROJECT_ID for the target Firebase project.')

initializeApp({ credential: applicationDefault(), projectId })
const auth = getAuth()
const db = getFirestore()
const identity = await auth.getUserByEmail(email).catch(async (error: { code?: string }) => {
  if (error.code !== 'auth/user-not-found') throw error
  return auth.createUser({ email, displayName, emailVerified: false, disabled: false })
})
await db.collection('users').doc(identity.uid).set({
  id: identity.uid, displayName, email, role: 'MENTOR', status: 'ACTIVE', createdAt: FieldValue.serverTimestamp(),
}, { merge: false })
await db.collection('mentorProfiles').doc(identity.uid).set({ userId: identity.uid, biography: '', moduleIds: [], active: true })
console.info(`Provisioned mentor profile for ${email} (${identity.uid}) in ${projectId}.`)
