import { discoverMentorsOutputSchema, moduleSchema, type Appointment, type AvailabilitySlot, type CallableInput, type CallableName, type CallableOutput, type Conversation, type HelpRequest, type MentorProfile, type Module, type User } from '@helpinus/shared'
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
      return handler(input)
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
  callables: createMockCallableClient({
    discoverMentors: async ({ cursor, limit }) => {
      if (limit !== 20) throw new Error('Mock discovery expects a page size of 20.')
      if (cursor === undefined) return discoveryPages.first
      if (cursor === 'sample-page-2') return discoveryPages['sample-page-2']
      throw new Error('Unknown mock discovery cursor.')
    },
  }),
}
