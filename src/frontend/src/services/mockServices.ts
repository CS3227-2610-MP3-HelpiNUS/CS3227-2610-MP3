import { callableSchemas, discoverMentorsOutputSchema, moduleSchema, type Appointment, type AvailabilitySlot, type CallableInput, type CallableName, type CallableOutput, type Conversation, type F01HelpRequest, type HelpRequest, type MentorProfile, type Module, type User } from '@helpinus/shared'
import type { CallableClient, DashboardData, HelpiNUSServices } from './contracts'

export type MockCallableFixtures = Partial<{
  [Name in CallableName]: (
    input: CallableInput<Name>,
  ) => CallableOutput<Name> | Promise<CallableOutput<Name>>
}>

export class MockCallableUnavailableError extends Error {
  readonly callableName: CallableName

  constructor(callableName: CallableName) {
    super(`${callableName} has no mock fixture.`)
    this.name = 'MockCallableUnavailableError'
    this.callableName = callableName
  }
}

export function createMockCallableClient(fixtures: MockCallableFixtures = {}): CallableClient {
  return {
    async invoke<Name extends CallableName>(name: Name, input: CallableInput<Name>) {
      const handler = fixtures[name] as
        | ((value: CallableInput<Name>) => CallableOutput<Name> | Promise<CallableOutput<Name>>)
        | undefined
      if (!handler) throw new MockCallableUnavailableError(name)
      return callableSchemas[name].output.parse(await handler(input)) as CallableOutput<Name>
    },
  }
}

const student: User = {
  id: 'student-01', displayName: 'Jamie Tan', email: 'jamie.tan@example.edu',
  role: 'STUDENT', status: 'ACTIVE', createdAt: '2026-01-12T09:00:00.000Z',
}
const mentor: User = {
  id: 'mentor-01', displayName: 'Aisha Rahman', email: 'aisha.rahman@example.edu',
  role: 'MENTOR', status: 'ACTIVE', createdAt: '2025-08-03T09:00:00.000Z',
}
const modules: Module[] = [
  { id: 'cs2103t', code: 'CS2103T', title: 'Software Engineering', active: true },
  { id: 'cs2040s', code: 'CS2040S', title: 'Data Structures and Algorithms', active: true },
]
const requests: HelpRequest[] = [
  {
    id: 'request-01', studentId: student.id, mentorId: mentor.id, moduleId: 'cs2103t',
    title: 'Understanding sequence diagrams',
    description: 'I would like to walk through how to model alternate flows.', status: 'ACCEPTED',
    createdAt: '2026-10-12T05:30:00.000Z', updatedAt: '2026-10-12T08:00:00.000Z',
  },
  {
    id: 'request-02', studentId: student.id, mentorId: null, moduleId: 'cs2040s',
    title: 'Preparing for the next tutorial',
    description: 'Help with graph traversal practice.', status: 'PENDING',
    createdAt: '2026-10-11T03:00:00.000Z', updatedAt: '2026-10-11T03:00:00.000Z',
  },
]
const appointments: Appointment[] = [
  {
    id: 'appointment-01', slotId: 'slot-01', studentId: student.id, mentorId: mentor.id,
    helpRequestId: 'request-01', topic: 'Sequence diagrams and alternate flows', status: 'CONFIRMED',
    createdAt: '2026-10-12T08:10:00.000Z', updatedAt: '2026-10-12T08:10:00.000Z',
  },
]
const slots: AvailabilitySlot[] = [
  { id: 'slot-01', mentorId: mentor.id, startsAt: '2026-10-15T07:00:00.000Z', endsAt: '2026-10-15T08:00:00.000Z', withdrawn: false, createdAt: '2026-10-09T08:00:00.000Z' },
]
const conversations: Conversation[] = [
  {
    id: 'conversation-01', participantIds: [student.id, mentor.id], helpRequestId: 'request-01',
    createdAt: '2026-10-12T08:05:00.000Z', updatedAt: '2026-10-12T08:05:00.000Z',
  },
]
const mentorProfile: MentorProfile = {
  userId: mentor.id,
  biography: 'I enjoy breaking software design concepts into practical steps.',
  moduleIds: modules.map(({ id }) => id),
  active: true,
}
let managedBiography = mentorProfile.biography
let managedModuleIds = [...mentorProfile.moduleIds]
let managedRevision = 0
let managedUpdateTime = '1:000000000'
const managedReceipts = new Map<string, { fingerprint: string; output: CallableOutput<'updateOwnMentorProfile'> }>()
const managedModuleCatalog = [...modules, { id: 'cs3230', code: 'CS3230', title: 'Design and Analysis of Algorithms', active: false }]

export const mockDashboard: DashboardData = {
  user: student, requests, appointments, slots, conversations,
  mentors: [{ profile: mentorProfile, user: mentor, modules }],
}
let signedInUser: User | null = student

// Discovery fixtures contain only the callable's public Mentor fields. Their
// opaque cursor is selected by input, just as a later callable page would be.
const discoveryPages = {
  first: discoverMentorsOutputSchema.parse({
    mentors: [
      { userId: 'sample-mentor-01', displayName: 'Sample Aisha', biography: 'I enjoy explaining software design with examples.', moduleIds: ['cs2103t', 'cs2040s'] },
      { userId: 'sample-mentor-02', displayName: 'Sample Dev', biography: 'Happy to work through graph problems.', moduleIds: ['cs2040s', 'cs3230'] },
      { userId: 'sample-mentor-03', displayName: 'Sample Mei', biography: 'Let us explore computing systems together.', moduleIds: ['missing-module'] },
      { userId: 'sample-mentor-04', displayName: 'Sample Noor', biography: '', moduleIds: [] },
    ],
    nextCursor: 'sample-page-2',
  }),
  'sample-page-2': discoverMentorsOutputSchema.parse({
    mentors: [
      { userId: 'sample-mentor-05', displayName: 'Sample Ravi', biography: 'I like making algorithms approachable.', moduleIds: ['cs2040s'] },
    ],
    nextCursor: null,
  }),
}

const discoveryModules = new Map<string, unknown>([
  ...modules.map((module): [string, Module] => [module.id, module]),
  ['cs3230', { id: 'cs3230', code: 'CS3230', title: 'Design and Analysis of Algorithms', active: false }],
])

export function createMockModuleLookup(records: ReadonlyMap<string, unknown>): HelpiNUSServices['modules'] {
  return {
    async getById(id) {
      if (!records.has(id)) return null
      const record = records.get(id)
      if (record instanceof Error) throw record
      const parsed = moduleSchema.parse(record)
      if (parsed.id !== id) throw new Error('Module document ID does not match stored ID.')
      return parsed
    },
  }
}

const f01Requests: F01HelpRequest[] = []
const requestListeners = new Set<() => void>()
const notifyRequests = () => { for (const listener of requestListeners) listener() }
function mockSubscribe(read: () => F01HelpRequest[], onData: (items: F01HelpRequest[]) => void) {
  const listener = () => onData(read())
  requestListeners.add(listener)
  listener()
  return () => { requestListeners.delete(listener) }
}

export const mockServices: HelpiNUSServices = {
  session: {
    getCurrent: async () => ({ user: signedInUser }),
    subscribe: (listener) => { listener({ user: signedInUser }); return () => {} },
    registerStudent: async () => { signedInUser = student; return { user: student } },
    retryStudentProfile: async () => ({ user: signedInUser }),
    resendVerificationEmail: async () => {},
    signIn: async () => { signedInUser = student; return { user: student } },
    signOut: async () => { signedInUser = null },
  },
  dashboard: { getStudentDashboard: async () => mockDashboard },
  modules: createMockModuleLookup(discoveryModules),
  helpRequests: {
    async getSelection(mentorId) { const found = Object.values(discoveryPages).flatMap((page) => page.mentors).find((item) => item.userId === mentorId); return found ? { moduleIds: found.moduleIds } : null },
    subscribeStudentPage(uid, _cursor, onData) { return mockSubscribe(() => f01Requests.filter((item) => item.studentId === uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20), onData) },
    subscribeMentorPendingPage(uid, _cursor, onData) { return mockSubscribe(() => f01Requests.filter((item) => item.mentorId === uid && item.status === 'PENDING').sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 20), onData) },
    subscribeMentorDecidedPage(uid, _cursor, onData) { return mockSubscribe(() => f01Requests.filter((item) => item.mentorId === uid && item.status !== 'PENDING').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20), onData) },
    subscribeDetail(id, onData) { return mockSubscribe(() => f01Requests.filter((item) => item.id === id), (items) => onData(items[0] ?? null)) },
    subscribeStudentSummary(uid, onData) { const listener = () => { const own = f01Requests.filter((item) => item.studentId === uid); const pendingCount = own.filter((item) => item.status === 'PENDING').length; const acceptedCount = own.filter((item) => item.status === 'ACCEPTED').length; onData({ pendingCount, acceptedCount, rejectedCount: own.filter((item) => item.status === 'REJECTED').length, openCount: pendingCount + acceptedCount, updatedAt: new Date().toISOString() }) }; requestListeners.add(listener); listener(); return () => { requestListeners.delete(listener) } },
  },
  callables: createMockCallableClient({
    createHelpRequest: async (input) => {
      const existing = f01Requests.find((item) => item.studentId === student.id && item.mentorId === input.mentorId && item.moduleId === input.moduleId && item.status === 'PENDING')
      if (existing) return { kind: 'duplicate', existingHelpRequestId: existing.id, currentStatus: existing.status }
      const now = new Date().toISOString()
      const helpRequest: F01HelpRequest = { id: crypto.randomUUID(), studentId: student.id, mentorId: input.mentorId, moduleId: input.moduleId, title: input.title.trim(), description: input.description.trim(), studentDisplayName: student.displayName, mentorDisplayName: Object.values(discoveryPages).flatMap((page) => page.mentors).find((item) => item.userId === input.mentorId)?.displayName ?? 'Mentor', status: 'PENDING', createdAt: now, updatedAt: now }
      f01Requests.unshift(helpRequest); notifyRequests(); return { kind: 'created', helpRequest }
    },
    respondToHelpRequest: async (input) => {
      const found = f01Requests.find((item) => item.id === input.helpRequestId)
      if (!found) throw new Error('Request unavailable')
      if (input.response === 'ACCEPTED') throw new Error('Acceptance is waiting for conversation integration.')
      if (found.status !== 'PENDING') return found.status === input.response ? { kind: 'already_decided', helpRequest: found, conversationId: null } : { kind: 'conflict', actualStatus: found.status }
      found.status = 'REJECTED'; found.updatedAt = new Date().toISOString(); notifyRequests(); return { kind: 'decided', helpRequest: found, conversationId: null }
    },
    readOwnMentorProfile: async () => ({ kind: 'ready', profile: { displayName: mentor.displayName, biography: managedBiography, moduleIds: [...managedModuleIds], version: { revision: managedRevision, updateTime: managedUpdateTime } }, metadata: { kind: 'ready', modules: managedModuleIds.map((id) => { const found = managedModuleCatalog.find((module) => module.id === id); return found ? { id, state: found.active ? 'active' as const : 'inactive' as const, code: found.code, title: found.title } : { id, state: 'missing' as const } }) } }),
    searchMentorModules: async ({ query, cursor }) => {
      const normalized = query.normalize('NFKC').trim().toLowerCase()
      const matches = managedModuleCatalog.filter((module) => module.active && [module.code, module.title].some((text) => text.toLowerCase().startsWith(normalized))).sort((a, b) => a.id.localeCompare(b.id))
      const start = cursor ? matches.findIndex((module) => module.id === cursor) + 1 : 0
      const page = matches.slice(start, start + 20)
      return { modules: page.map(({ id, code, title }) => ({ id, code, title })), nextCursor: start + 20 < matches.length ? page[page.length - 1].id : null }
    },
    updateOwnMentorProfile: async (input) => {
      const fingerprint = JSON.stringify({ baseline: input.baseline, biography: input.biography.trim(), moduleIds: [...input.moduleIds].sort() })
      const prior = managedReceipts.get(input.requestId)
      if (prior) { if (prior.fingerprint !== fingerprint) throw new Error('Request ID reused for a different change.'); return prior.output }
      let output: CallableOutput<'updateOwnMentorProfile'>
      if (input.baseline.revision !== managedRevision || input.baseline.updateTime !== managedUpdateTime) output = { kind: 'rejected', reason: 'CONFLICT' }
      else if (input.moduleIds.some((id) => !managedModuleIds.includes(id) && !managedModuleCatalog.some((module) => module.id === id && module.active))) output = { kind: 'rejected', reason: 'MODULE_INELIGIBLE' }
      else { managedBiography = input.biography.trim(); managedModuleIds = [...input.moduleIds]; managedRevision += 1; managedUpdateTime = `${managedRevision + 1}:000000000`; output = { kind: 'accepted', stored: { biography: managedBiography, moduleIds: [...managedModuleIds], revision: managedRevision } } }
      managedReceipts.set(input.requestId, { fingerprint, output })
      return output
    },
    discoverMentors: async ({ cursor, limit }) => {
      if (limit !== 20) throw new Error('Mock discovery expects a page size of 20.')
      if (cursor === undefined) return discoveryPages.first
      if (cursor === 'sample-page-2') return discoveryPages['sample-page-2']
      throw new Error('Unknown mock discovery cursor.')
    },
  }),
}
