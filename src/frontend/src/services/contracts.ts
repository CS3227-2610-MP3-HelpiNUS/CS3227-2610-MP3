import type {
  Appointment,
  AvailabilitySlot,
  Conversation,
  HelpRequest,
  MentorProfile,
  Module,
  User,
  CallableInput,
  CallableName,
  CallableOutput,
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

export interface CallableClient {
  invoke<Name extends CallableName>(
    name: Name,
    input: CallableInput<Name>,
  ): Promise<CallableOutput<Name>>
}

export interface HelpiNUSServices {
  session: {
    getCurrent(): Promise<Session>
    subscribe(listener: (session: Session) => void, onError: () => void): () => void
    registerStudent(input: { displayName: string; email: string; password: string }): Promise<Session>
    retryStudentProfile(): Promise<Session>
    resendVerificationEmail(): Promise<void>
    signIn(input: { email: string; password: string }): Promise<Session>
    signOut(): Promise<void>
  }
  dashboard: {
    getStudentDashboard(): Promise<DashboardData>
  }
  callables: CallableClient
}
