import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { UserRole } from '@helpinus/shared'
import { useServices } from '../services/useServices'

export function ProtectedRoute({ role }: { role: UserRole }) {
  const { session, loading, error, refreshSession } = useServices()
  const location = useLocation()
  if (loading) return <div className="route-status" role="status">Loading your workspace…</div>
  if (error) return <section className="route-status"><h1>We couldn’t load your account</h1><p>{error}</p><button className="button button-primary" onClick={() => void refreshSession()}>Try again</button></section>
  if (!session?.user) return session?.issue
    ? <Navigate to="/account-access" replace state={{ from: location.pathname }} />
    : <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (session.user.status !== 'ACTIVE') return <Navigate to="/account-access" replace />
  if (session.user.role !== role) return <Navigate to={session.user.role === 'STUDENT' ? '/student/dashboard' : '/mentor/dashboard'} replace />
  return <Outlet />
}
