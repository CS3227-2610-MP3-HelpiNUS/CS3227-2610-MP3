import type { HelpiNUSServices } from './contracts'

async function loadFirebaseServices() {
  return (await import('./firebaseServices')).firebaseServices
}

export const firebaseServiceProxy: HelpiNUSServices = {
  session: {
    async getCurrent() { return (await loadFirebaseServices()).session.getCurrent() },
    subscribe(listener, onError) { let unsubscribe = () => {}; let cancelled = false; void loadFirebaseServices().then((services) => { if (cancelled) return; unsubscribe = services.session.subscribe(listener, onError) }).catch(onError); return () => { cancelled = true; unsubscribe() } },
    async signInWithGoogle(role) { return (await loadFirebaseServices()).session.signInWithGoogle(role) },
    async registerStudentWithGoogle() { return (await loadFirebaseServices()).session.registerStudentWithGoogle() },
    async registerMentorWithGoogle() { return (await loadFirebaseServices()).session.registerMentorWithGoogle() },
    async retryStudentProfile(displayName) { return (await loadFirebaseServices()).session.retryStudentProfile(displayName) },
    async retryMentorProfile(displayName) { return (await loadFirebaseServices()).session.retryMentorProfile(displayName) },
    async signOut() { return (await loadFirebaseServices()).session.signOut() },
  },
  dashboard: {
    async getStudentDashboard() { return (await loadFirebaseServices()).dashboard.getStudentDashboard() },
  },
  modules: {
    async getById(id) { return (await loadFirebaseServices()).modules.getById(id) },
  },
  helpRequests: {
    async getSelection(id) { return (await loadFirebaseServices()).helpRequests.getSelection(id) },
    subscribeStudentPage(uid, cursor, onData, onError) { return proxySubscription((s) => s.helpRequests.subscribeStudentPage(uid, cursor, onData, onError), onError) },
    subscribeMentorPendingPage(uid, cursor, onData, onError) { return proxySubscription((s) => s.helpRequests.subscribeMentorPendingPage(uid, cursor, onData, onError), onError) },
    subscribeMentorDecidedPage(uid, cursor, onData, onError) { return proxySubscription((s) => s.helpRequests.subscribeMentorDecidedPage(uid, cursor, onData, onError), onError) },
    subscribeDetail(id, onData, onError) { return proxySubscription((s) => s.helpRequests.subscribeDetail(id, onData, onError), onError) },
    subscribeStudentSummary(uid, onData, onError) { return proxySubscription((s) => s.helpRequests.subscribeStudentSummary(uid, onData, onError), onError) },
  },
  conversations: {
    subscribeList(uid, role, cursor, onData, onError) { return proxySubscription((s) => s.conversations.subscribeList(uid, role, cursor, onData, onError), onError) },
    subscribeDetail(id, onData, onError) { return proxySubscription((s) => s.conversations.subscribeDetail(id, onData, onError), onError) },
    subscribeMessages(id, cursor, onData, onError) { return proxySubscription((s) => s.conversations.subscribeMessages(id, cursor, onData, onError), onError) },
    async getMessageFromServer(id, messageId) { return (await loadFirebaseServices()).conversations.getMessageFromServer(id, messageId) },
  },
  scheduling: {
    subscribeOpenSlots(range, onData, onError) { return proxySubscription((s) => s.scheduling.subscribeOpenSlots(range, onData, onError), onError) },
    subscribeMentorSlots(uid, range, onData, onError) { return proxySubscription((s) => s.scheduling.subscribeMentorSlots(uid, range, onData, onError), onError) },
    subscribeUpcomingAppointments(uid, role, onData, onError) { return proxySubscription((s) => s.scheduling.subscribeUpcomingAppointments(uid, role, onData, onError), onError) },
    subscribeAppointmentHistory(uid, role, pageSize, onData, onError) { return proxySubscription((s) => s.scheduling.subscribeAppointmentHistory(uid, role, pageSize, onData, onError), onError) },
  },
  callables: {
    async invoke(name, input) { return (await loadFirebaseServices()).callables.invoke(name, input) },
  },
}

function proxySubscription(subscribe: (services: HelpiNUSServices) => () => void, onError: (error: unknown) => void) {
  let unsubscribe = () => {}
  let cancelled = false
  void loadFirebaseServices().then((services) => { if (!cancelled) unsubscribe = subscribe(services) }).catch(onError)
  return () => { cancelled = true; unsubscribe() }
}
