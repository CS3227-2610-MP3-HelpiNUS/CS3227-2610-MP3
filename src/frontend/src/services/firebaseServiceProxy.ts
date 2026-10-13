import type { HelpiNUSServices } from './contracts'

async function loadFirebaseServices() {
  return (await import('./firebaseServices')).firebaseServices
}

export const firebaseServiceProxy: HelpiNUSServices = {
  session: {
    async getCurrent() { return (await loadFirebaseServices()).session.getCurrent() },
    async signInDemo() { return (await loadFirebaseServices()).session.signInDemo() },
    async signOut() { return (await loadFirebaseServices()).session.signOut() },
  },
  dashboard: {
    async getStudentDashboard() { return (await loadFirebaseServices()).dashboard.getStudentDashboard() },
  },
}
