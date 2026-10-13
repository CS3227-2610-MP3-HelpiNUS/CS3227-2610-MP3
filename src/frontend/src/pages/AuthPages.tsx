import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useServices } from '../services/useServices'

function destination(role: 'STUDENT' | 'MENTOR') { return role === 'STUDENT' ? '/student/dashboard' : '/mentor/dashboard' }
function message(error: unknown) {
  const code = (error as { code?: string })?.code
  if (code === 'auth/email-already-in-use') return 'An account already uses this email. Try signing in.'
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Email or password is incorrect.'
  if (code === 'functions/failed-precondition') return 'Verify your email, then retry profile setup.'
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
function Brand() { return <Link className="brand auth-brand" to="/login"><span className="brand-mark">H</span><span>Helpi<span className="brand-accent">NUS</span></span></Link> }

export function LoginPage() {
  const { session, services, refreshSession } = useServices()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (session?.user) return <Navigate to={destination(session.user.role)} replace />
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      const result = await services.session.signIn({ email: String(data.get('email')), password: String(data.get('password')) })
      await refreshSession()
      if (result.user) navigate(destination(result.user.role))
      else setError(result.issue === 'EMAIL_UNVERIFIED' ? 'Verify your email before continuing. Then sign in again.' : result.issue === 'PROFILE_MISSING' ? 'Your account exists, but its profile is not ready. Retry setup below.' : result.issue === 'ACCOUNT_INACTIVE' ? 'This account is suspended or disabled. Contact HelpiNUS support.' : 'Your account profile could not be validated. Contact HelpiNUS support.')
    } catch (cause) { setError(message(cause)) } finally { setBusy(false) }
  }
  async function retry() { setError(''); setBusy(true); try { const result = await services.session.retryStudentProfile(); await refreshSession(); if (result.user) navigate(destination(result.user.role)); else setError('Verify your email first, then try again.') } catch (cause) { setError(message(cause)) } finally { setBusy(false) } }
  return <main className="auth-screen"><Brand /><section className="auth-panel"><h1>Welcome to HelpiNUS</h1><p>Find the support you need to keep learning.</p>
    <form onSubmit={(event) => void submit(event)}><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p role="alert">{error}</p>}<button type="submit" className="button button-primary auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form>
    {session?.issue === 'PROFILE_MISSING' && <button className="button button-secondary auth-submit" disabled={busy} onClick={() => void retry()}>Retry Student profile setup</button>}
    <p className="auth-secondary">New to HelpiNUS? <Link to="/register">Create a Student account</Link></p><Link className="auth-secondary" to="/forgot-password">Forgot your password?</Link>
  </section><p className="auth-footnote">For NUS students and mentors</p></main>
}

export function RegisterPage() {
  const { services, refreshSession } = useServices()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [partial, setPartial] = useState(false)
  const [busy, setBusy] = useState(false)
  async function retry() { setBusy(true); setError(''); try { const result = await services.session.retryStudentProfile(); await refreshSession(); if (result.user) navigate(destination(result.user.role)); else setError(result.issue === 'EMAIL_UNVERIFIED' ? 'Check your inbox and verify your email, then retry profile setup.' : 'Your Student profile is not ready yet. Try again.') } catch (cause) { setError(message(cause)); setPartial(true) } finally { setBusy(false) } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true)
    const data = new FormData(event.currentTarget)
    try { await services.session.registerStudent({ displayName: String(data.get('displayName')), email: String(data.get('email')), password: String(data.get('password')) }); await refreshSession(); navigate('/student/dashboard') }
    catch (cause) { setError(message(cause)); const current = await services.session.getCurrent().catch(() => null); if (current?.issue === 'EMAIL_UNVERIFIED') setError('Account created. Verify your email, sign in, then retry profile setup.'); if (current?.issue === 'PROFILE_MISSING' || current?.issue === 'EMAIL_UNVERIFIED') setPartial(true) }
    finally { setBusy(false) }
  }
  return <main className="auth-screen"><Brand /><section className="auth-panel"><h1>Create your account</h1><p>Public registration creates a Student account.</p>{partial ? <><p role="status">Your sign-in identity exists, but Student setup is incomplete. You can safely retry after verifying your email.</p><button className="button button-primary auth-submit" disabled={busy} onClick={() => void retry()}>Retry Student profile setup</button></> : <form onSubmit={(event) => void submit(event)}><label>Name<input name="displayName" autoComplete="name" maxLength={100} required /></label><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="new-password" minLength={6} required /></label>{error && <p role="alert">{error}</p>}<button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create Student account'}</button></form>}{error && partial && <p role="alert">{error}</p>}<p className="auth-secondary">Already registered? <Link to="/login">Sign in</Link></p></section></main>
}

export function ForgotPasswordPage() {
  return <main className="auth-screen"><Brand /><section className="auth-panel"><h1>Reset your password</h1><p>Password recovery will be available with account sign-in.</p><Link className="button button-secondary auth-submit" to="/login">Back to sign in</Link></section></main>
}

export function AccountAccessPage() {
  const { session, services, refreshSession } = useServices()
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  async function retry() { setBusy(true); setNotice(''); try { await services.session.retryStudentProfile(); await refreshSession() } catch (cause) { setNotice(message(cause)) } finally { setBusy(false) } }
  const missing = session?.issue === 'PROFILE_MISSING'
  return <main className="auth-screen"><section className="auth-panel"><h1>{missing ? 'Student profile setup incomplete' : 'Account access unavailable'}</h1><p>{missing ? 'Your sign-in identity is ready, but your trusted profile has not been created yet.' : session?.issue === 'EMAIL_UNVERIFIED' ? 'Verify your email before continuing.' : session?.issue === 'ACCOUNT_INACTIVE' ? 'This account is suspended or disabled. Contact HelpiNUS support.' : 'Your account profile could not be validated. Contact HelpiNUS support.'}</p>{missing && <button className="button button-primary" disabled={busy} onClick={() => void retry()}>Retry Student profile setup</button>}{notice && <p role="alert">{notice}</p>}<Link to="/login">Return to sign in</Link></section></main>
}
