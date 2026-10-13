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
  issue?: 'PROFILE_MISSING' | 'PROFILE_INVALID' | 'ACCOUNT_INACTIVE' | 'EMAIL_UNVERIFIED'
}

export interface HelpiNUSServices {
  session: {
    getCurrent(): Promise<Session>
    subscribe(listener: (session: Session) => void, onError: () => void): () => void
    registerStudent(input: { displayName: string; email: string; password: string }): Promise<void>
    retryStudentProfile(): Promise<Session>
    signIn(input: { email: string; password: string }): Promise<Session>
    signOut(): Promise<void>
  }
  dashboard: {
    getStudentDashboard(): Promise<DashboardData>
  }
}
