import type {
  Appointment,
  AvailabilitySlot,
  Conversation,
  HelpRequest,
  MentorProfile,
  Module,
  User,
} from '@helpinus/shared'

export interface DashboardData {
  user: User
  requests: HelpRequest[]
  appointments: Appointment[]
  slots: AvailabilitySlot[]
  conversations: Conversation[]
  mentors: Array<{ profile: MentorProfile; user: User; modules: Module[] }>
}

export interface Session {
  user: User | null
}

export interface HelpiNUSServices {
  session: {
    getCurrent(): Promise<Session>
    signInDemo(): Promise<Session>
    signOut(): Promise<void>
  }
  dashboard: {
    getStudentDashboard(): Promise<DashboardData>
  }
}
