import { Navigate, type RouteObject } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { StudentDashboard } from '../pages/StudentDashboard'
import { WorkspacePage } from '../pages/WorkspacePage'
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
    { path: '/student/mentors', element: <WorkspacePage /> },
    { path: '/student/requests', element: <WorkspacePage /> },
    { path: '/student/conversations', element: <WorkspacePage /> },
    { path: '/student/consultations', element: <WorkspacePage /> },
    { path: '/student/study-assistant', element: <WorkspacePage /> },
  ] }] },
  { element: <ProtectedRoute role="MENTOR" />, errorElement: <ErrorPage />, children: [{ element: <AppShell />, children: [
    { path: '/mentor/dashboard', element: <WorkspacePage /> },
  ] }] },
  { path: '*', element: <ErrorPage /> },
]
