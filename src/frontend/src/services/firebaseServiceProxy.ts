import type { HelpiNUSServices } from './contracts'

async function loadFirebaseServices() {
  return (await import('./firebaseServices')).firebaseServices
}

export const firebaseServiceProxy: HelpiNUSServices = {
  session: {
    async getCurrent() { return (await loadFirebaseServices()).session.getCurrent() },
    subscribe(listener, onError) { let unsubscribe = () => {}; let cancelled = false; void loadFirebaseServices().then((services) => { if (cancelled) return; unsubscribe = services.session.subscribe(listener, onError) }).catch(onError); return () => { cancelled = true; unsubscribe() } },
    async registerStudent(input) { return (await loadFirebaseServices()).session.registerStudent(input) },
    async retryStudentProfile() { return (await loadFirebaseServices()).session.retryStudentProfile() },
    async signIn(input) { return (await loadFirebaseServices()).session.signIn(input) },
    async signOut() { return (await loadFirebaseServices()).session.signOut() },
  },
  dashboard: {
    async getStudentDashboard() { return (await loadFirebaseServices()).dashboard.getStudentDashboard() },
  },
}
