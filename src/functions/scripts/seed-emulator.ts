import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

if (process.env.FUNCTIONS_EMULATOR !== 'true' || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Refusing to seed outside the Firebase Auth and Functions emulators.')
}
const projectId = process.env.GCLOUD_PROJECT ?? 'helpinus-dev'
initializeApp({ projectId })
const auth = getAuth()
const db = getFirestore()
const demoUsers = [
  { email: 'student@example.test', password: 'Student-demo-123!', displayName: 'Demo Student', role: 'STUDENT' },
  { email: 'mentor@example.test', password: 'Mentor-demo-123!', displayName: 'Demo Mentor', role: 'MENTOR' },
] as const

for (const demo of demoUsers) {
  const user = await auth.getUserByEmail(demo.email).catch(async (error: { code?: string }) => {
    if (error.code !== 'auth/user-not-found') throw error
    return auth.createUser({ email: demo.email, password: demo.password, displayName: demo.displayName, emailVerified: false })
  })
  await db.collection('users').doc(user.uid).set({
    id: user.uid, displayName: demo.displayName, email: demo.email, role: demo.role, status: 'ACTIVE', createdAt: FieldValue.serverTimestamp(),
  })
  if (demo.role === 'MENTOR') await db.collection('mentorProfiles').doc(user.uid).set({ userId: user.uid, biography: 'Emulator demo mentor', moduleIds: [], active: true })
}
console.info('Seeded emulator demos: student@example.test / Student-demo-123! and mentor@example.test / Mentor-demo-123!')
