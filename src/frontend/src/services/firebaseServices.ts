import { doc, getDoc } from 'firebase/firestore'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { userSchema } from '@helpinus/shared'
import { firebase } from './firebase'
import type { DashboardData, HelpiNUSServices } from './contracts'
import { mockDashboard } from './mockServices'

function observeAuth(): Promise<void> {
  const client = firebase
  if (!client) return Promise.resolve()
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(client.auth, () => {
      unsubscribe()
      resolve()
    }, () => {
      unsubscribe()
      resolve()
    })
  })
}

export const firebaseServices: HelpiNUSServices = {
  session: {
    async getCurrent() {
      if (!firebase) return { user: null }
      await observeAuth()
      const identity = firebase.auth.currentUser
      if (!identity) return { user: null }
      const profile = await getDoc(doc(firebase.firestore, 'users', identity.uid))
      if (!profile.exists()) return { user: null }
      const parsed = userSchema.safeParse({ ...profile.data(), id: profile.id })
      return { user: parsed.success ? parsed.data : null }
    },
    async signInDemo() {
      throw new Error('Sign-in integration is not enabled yet. Use the local mock configuration.')
    },
    async signOut() {
      if (firebase) await signOut(firebase.auth)
    },
  },
  dashboard: {
    async getStudentDashboard(): Promise<DashboardData> {
      return mockDashboard
    },
  },
}
