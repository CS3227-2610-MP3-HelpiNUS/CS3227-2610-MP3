import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useServices } from '../services/useServices'
import { isFirebaseConfigured } from '../services/firebaseConfig'

export function LoginPage() {
  const { session, services, refreshSession } = useServices()
  const navigate = useNavigate()
  if (session?.user) return <Navigate to={session.user.role === 'STUDENT' ? '/student/dashboard' : '/mentor/dashboard'} replace />
  async function previewAsStudent() {
    await services.session.signInDemo()
    await refreshSession()
    navigate('/student/dashboard')
  }
  return <main className="auth-screen"><Link className="brand auth-brand" to="/login"><span className="brand-mark">H</span><span>Helpi<span className="brand-accent">NUS</span></span></Link><section className="auth-panel"><h1>Welcome to HelpiNUS</h1><p>Find the support you need to keep learning.</p>
    {isFirebaseConfigured ? <div className="notice-panel"><strong>Sign-in is being connected.</strong><span>Your account will be available when authentication integration is complete.</span></div> : <div className="notice-panel"><strong>Frontend preview</strong><span>Explore the Student workspace with sample data.</span></div>}
    <button type="button" className="button button-primary auth-submit" disabled={isFirebaseConfigured} onClick={() => void previewAsStudent()}>{isFirebaseConfigured ? 'NUS sign-in coming soon' : 'Preview as a Student'}</button>
    <p className="auth-secondary">New to HelpiNUS? <Link to="/register">Create a Student account</Link></p><Link className="auth-secondary" to="/forgot-password">Forgot your password?</Link>
  </section><p className="auth-footnote">For NUS students and mentors</p></main>
}

export function RegisterPage() {
  return <main className="auth-screen"><Link className="brand auth-brand" to="/login"><span className="brand-mark">H</span><span>Helpi<span className="brand-accent">NUS</span></span></Link><section className="auth-panel"><h1>Create your account</h1><p>Public registration creates a Student account.</p><div className="notice-panel"><strong>Registration is not connected yet</strong><span>Account creation will be available after authentication integration.</span></div><button className="button button-primary auth-submit" disabled>Create account</button><p className="auth-secondary">Already registered? <Link to="/login">Sign in</Link></p></section></main>
}

export function ForgotPasswordPage() {
  return <main className="auth-screen"><Link className="brand auth-brand" to="/login"><span className="brand-mark">H</span><span>Helpi<span className="brand-accent">NUS</span></span></Link><section className="auth-panel"><h1>Reset your password</h1><p>Password recovery will be available with account sign-in.</p><Link className="button button-secondary auth-submit" to="/login">Back to sign in</Link></section></main>
}

export function AccountAccessPage() {
  return <main className="auth-screen"><section className="auth-panel"><h1>Account access unavailable</h1><p>Your account needs attention before you can continue.</p><Link to="/login">Return to sign in</Link></section></main>
}
