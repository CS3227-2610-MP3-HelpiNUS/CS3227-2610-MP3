import { Navigate, type RouteObject } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { StudentDashboard } from '../pages/StudentDashboard'
import { WorkspacePage } from '../pages/WorkspacePage'
import { MentorDiscoveryPage } from '../pages/MentorDiscoveryPage'
import { MentorProfilePage } from '../pages/MentorProfilePage'
import { MentorDashboard } from '../pages/MentorDashboard'
import { StudentStudyAssistantPage } from '../pages/StudentStudyAssistantPage'
import { MentorRequestsPage, RequestDetailPage, RequestHelpPage, StudentRequestsPage } from '../pages/HelpRequestPages'
import { ConversationDetailPage, ConversationListPage } from '../pages/ConversationPages'
import { AccountAccessPage, ForgotPasswordPage, LoginPage, RegisterPage } from '../pages/AuthPages'
import { ErrorPage } from '../pages/ErrorPage'
import { ProtectedRoute } from './ProtectedRoute'

export const appRoutes: RouteObject[] = [
  { path: '/', element: <Navigate to="/student/dashboard" replace />, errorElement: <ErrorPage /> },
  { path: '/login', element: <LoginPage />, errorElement: <ErrorPage /> },
  { path: '/register', element: <RegisterPage />, errorElement: <ErrorPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage />, errorElement: <ErrorPage /> },
  { path: '/account-access', element: <AccountAccessPage />, errorElement: <ErrorPage /> },
  { element: <ProtectedRoute role="STUDENT" />, errorElement: <ErrorPage />, children: [{ element: <AppShell />, children: [
    { path: '/student', element: <Navigate to="/student/dashboard" replace /> },
    { path: '/student/dashboard', element: <StudentDashboard /> },
    { path: '/student/mentors', element: <MentorDiscoveryPage /> },
    { path: '/student/mentors/:mentorId/request', element: <RequestHelpPage /> },
    { path: '/student/requests', element: <StudentRequestsPage /> },
    { path: '/student/requests/:id', element: <RequestDetailPage role="student" /> },
    { path: '/student/conversations', element: <ConversationListPage role="student" /> },
    { path: '/student/conversations/:requestId', element: <ConversationDetailPage role="student" /> },
    { path: '/student/consultations', element: <WorkspacePage /> },
    { path: '/student/study-assistant', element: <StudentStudyAssistantPage /> },
  ] }] },
  { element: <ProtectedRoute role="MENTOR" />, errorElement: <ErrorPage />, children: [{ element: <AppShell />, children: [
    { path: '/mentor/dashboard', element: <MentorDashboard /> },
    { path: '/mentor/profile', element: <MentorProfilePage /> },
    { path: '/mentor/requests', element: <MentorRequestsPage /> },
    { path: '/mentor/requests/:id', element: <RequestDetailPage role="mentor" /> },
    { path: '/mentor/conversations', element: <ConversationListPage role="mentor" /> },
    { path: '/mentor/conversations/:requestId', element: <ConversationDetailPage role="mentor" /> },
  ] }] },
  { path: '*', element: <ErrorPage /> },
]
