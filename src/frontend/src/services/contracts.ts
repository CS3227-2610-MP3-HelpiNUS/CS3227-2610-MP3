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
  F01HelpRequest,
  HelpRequestSummary,
  F02SavedMessage,
} from '@helpinus/shared'

export type ChatCursor = { seconds: number; nanoseconds: number; id: string }
export type ChatRow = { kind: 'ready'; request: F01HelpRequest } | { kind: 'support_needed'; requestId: string; acceptedAt: string }
export type ChatDetail = { request: F01HelpRequest }

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
    retryStudentProfile(displayName?: string): Promise<Session>
    resendVerificationEmail(): Promise<void>
    signIn(input: { email: string; password: string }): Promise<Session>
    signOut(): Promise<void>
  }
  dashboard: {
    getStudentDashboard(): Promise<DashboardData>
  }
  modules: {
    getById(id: string): Promise<Module | null>
  }
  helpRequests: {
    getSelection(mentorId: string): Promise<{ moduleIds: string[] } | null>
    subscribeStudentPage(uid: string, cursor: { createdAt: string; id: string } | null, onData: (items: F01HelpRequest[]) => void, onError: (error: unknown) => void): () => void
    subscribeMentorPendingPage(uid: string, cursor: { createdAt: string; id: string } | null, onData: (items: F01HelpRequest[]) => void, onError: (error: unknown) => void): () => void
    subscribeMentorDecidedPage(uid: string, cursor: { createdAt: string; id: string } | null, onData: (items: F01HelpRequest[]) => void, onError: (error: unknown) => void): () => void
    subscribeDetail(id: string, onData: (item: F01HelpRequest | null) => void, onError: (error: unknown) => void): () => void
    subscribeStudentSummary(uid: string, onData: (summary: HelpRequestSummary) => void, onError: (error: unknown) => void): () => void
  }
  conversations: {
    subscribeList(uid: string, role: 'STUDENT' | 'MENTOR', cursor: ChatCursor | null, onData: (rows: ChatRow[], next: ChatCursor | null) => void, onError: (error: unknown) => void): () => void
    subscribeDetail(requestId: string, onData: (detail: ChatDetail | null) => void, onError: (error: unknown) => void): () => void
    subscribeMessages(requestId: string, cursor: ChatCursor | null, onData: (messages: F02SavedMessage[], next: ChatCursor | null) => void, onError: (error: unknown) => void): () => void
    getMessageFromServer(requestId: string, messageId: string): Promise<F02SavedMessage | null>
  }
  callables: CallableClient
}
