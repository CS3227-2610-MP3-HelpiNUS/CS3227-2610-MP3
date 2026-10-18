import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { activeSearchPrefixes } from '../src/moduleSearchKeys.js'

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
    return auth.createUser({ email: demo.email, password: demo.password, displayName: demo.displayName, emailVerified: true })
  })
  if (!user.emailVerified) await auth.updateUser(user.uid, { emailVerified: true })
  const userRef = db.collection('users').doc(user.uid)
  if (!(await userRef.get()).exists) {
    await userRef.create({
      id: user.uid, displayName: demo.displayName, email: demo.email, role: demo.role, status: 'ACTIVE', createdAt: FieldValue.serverTimestamp(),
    })
  }
  if (demo.role === 'MENTOR') {
    const profileRef = db.collection('mentorProfiles').doc(user.uid)
    if (!(await profileRef.get()).exists) {
      await profileRef.create({ userId: user.uid, biography: 'Emulator demo mentor', moduleIds: [], active: true })
    }
  }
}
for (const module of [
  { id: 'cs2103t', code: 'CS2103T', title: 'Software Engineering', active: true },
  { id: 'cs2040s', code: 'CS2040S', title: 'Data Structures and Algorithms', active: true },
  { id: 'cs3230', code: 'CS3230', title: 'Design and Analysis of Algorithms', active: false },
]) {
  const moduleRef = db.collection('modules').doc(module.id)
  if (!(await moduleRef.get()).exists) {
    await moduleRef.create({ ...module, activeSearchPrefixes: activeSearchPrefixes(module) })
  }
}
console.info('Emulator demos ready: student@example.test / Student-demo-123! and mentor@example.test / Mentor-demo-123!')
