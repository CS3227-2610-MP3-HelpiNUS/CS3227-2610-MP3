import type { Appointment, AvailabilitySlot, Conversation, HelpRequest, MentorProfile, Module, User } from '@helpinus/shared'
import type { DashboardData, HelpiNUSServices } from './contracts'

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

export const mockServices: HelpiNUSServices = {
  session: {
    getCurrent: async () => ({ user: signedInUser }),
    subscribe: (listener) => { listener({ user: signedInUser }); return () => {} },
    registerStudent: async () => { signedInUser = student },
    retryStudentProfile: async () => ({ user: signedInUser }),
    signIn: async () => { signedInUser = student; return { user: student } },
    signOut: async () => { signedInUser = null },
  },
  dashboard: { getStudentDashboard: async () => mockDashboard },
}
