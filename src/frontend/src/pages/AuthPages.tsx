import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useServices } from '../services/useServices'
import type { Session } from '../services/contracts'

function destination(role: 'STUDENT' | 'MENTOR') { return role === 'STUDENT' ? '/student/dashboard' : '/mentor/dashboard' }
function message(error: unknown) {
  const code = (error as { code?: unknown })?.code
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account already uses this email. Try signing in.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment, then try again.',
    'auth/network-request-failed': 'We could not reach the sign-in service. Check your connection and try again.',
    'functions/failed-precondition': 'Verify your email, then retry profile setup.',
    'functions/permission-denied': 'Your account could not be verified. Contact HelpiNUS support.',
    'functions/unavailable': 'The account service is temporarily unavailable. Try again shortly.',
  }
  if (typeof code === 'string') return messages[code] ?? 'We could not complete that request. Please try again.'
  return 'We could not complete that request. Please try again.'
}
function issueMessage(issue: Session['issue']) {
  if (issue === 'EMAIL_UNVERIFIED') return 'Account created. Verify your email, sign in, then retry profile setup.'
  if (issue === 'PROFILE_MISSING') return 'Your sign-in identity exists, but Student setup is incomplete. You can safely retry.'
  if (issue === 'ACCOUNT_INACTIVE') return 'This account is suspended or disabled. Contact HelpiNUS support.'
  return 'Your account profile could not be validated. Contact HelpiNUS support.'
}
function Brand({ to = '/login' }: { to?: string }) { return <Link className="brand auth-brand" to={to}><span className="brand-mark">H</span><span>Helpi<span className="brand-accent">NUS</span></span></Link> }

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
  return <main className="auth-screen"><Brand to={session?.user ? destination(session.user.role) : '/login'} /><section className="auth-panel" aria-labelledby="login-title"><h1 id="login-title">Welcome to HelpiNUS</h1><p>Find the support you need to keep learning.</p>
    <form onSubmit={(event) => void submit(event)} aria-busy={busy}><label htmlFor="login-email">Email</label><input id="login-email" name="email" type="email" autoComplete="email" autoCapitalize="none" required aria-describedby={error ? 'login-error' : undefined} /><label htmlFor="login-password">Password</label><input id="login-password" name="password" type="password" autoComplete="current-password" required aria-describedby={error ? 'login-error' : undefined} />{error && <p id="login-error" className="auth-error" role="alert">{error}</p>}<button type="submit" className="button button-primary auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form>
    {session?.issue === 'PROFILE_MISSING' && <button className="button button-secondary auth-submit" disabled={busy} onClick={() => void retry()}>Retry Student profile setup</button>}
    <p className="auth-secondary">New to HelpiNUS? <Link to="/register">Create a Student account</Link></p><Link className="auth-secondary" to="/forgot-password">Forgot your password?</Link>
  </section><p className="auth-footnote">For NUS students and mentors</p></main>
}

export function RegisterPage() {
  const { services, session, refreshSession } = useServices()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [partial, setPartial] = useState(false)
  const [unverified, setUnverified] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)
  const [busy, setBusy] = useState(false)
  async function resendVerification() {
    setBusy(true); setError('')
    try { await services.session.resendVerificationEmail(); setVerificationSent(true) }
    catch (cause) { setError(message(cause)) }
    finally { setBusy(false) }
  }
  async function retry() { setBusy(true); setError(''); try { const result = await services.session.retryStudentProfile(); await refreshSession(); if (result.user) navigate(destination(result.user.role)); else { setError(issueMessage(result.issue)); setPartial(true); setUnverified(result.issue === 'EMAIL_UNVERIFIED') } } catch (cause) { setError(message(cause)); setPartial(true) } finally { setBusy(false) } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      const result = await services.session.registerStudent({ displayName: String(data.get('displayName')), email: String(data.get('email')), password: String(data.get('password')) })
      await refreshSession()
      if (result.user) navigate(destination(result.user.role))
      else { setError(issueMessage(result.issue)); setPartial(true); setUnverified(result.issue === 'EMAIL_UNVERIFIED') }
    }
    catch (cause) {
      setError(message(cause))
      const current = await services.session.getCurrent().catch(() => null)
      if (current?.user) navigate(destination(current.user.role))
      else if (current?.issue) { setError(issueMessage(current.issue)); setPartial(true); setUnverified(current.issue === 'EMAIL_UNVERIFIED') }
    }
    finally { setBusy(false) }
  }
  return <main className="auth-screen"><Brand to={session?.user ? destination(session.user.role) : '/login'} /><section className="auth-panel" aria-labelledby="register-title"><h1 id="register-title">Create your account</h1><p>Public registration creates a Student account.</p>{partial ? <><p role="status">{unverified ? verificationSent ? 'Verification email sent. Check your inbox, verify your address, then sign in and retry profile setup.' : 'Your account exists but needs email verification. Send another verification email if you did not receive it.' : 'Your sign-in identity exists, but Student setup is incomplete. You can safely retry.'}</p><div className="auth-actions">{unverified && <button className="button button-secondary auth-submit" disabled={busy} onClick={() => void resendVerification()}>{busy ? 'Sending email…' : verificationSent ? 'Resend verification email' : 'Send verification email'}</button>}<button className="button button-primary auth-submit" disabled={busy} onClick={() => void retry()}>{busy ? 'Retrying setup…' : 'Retry Student profile setup'}</button></div></> : <form onSubmit={(event) => void submit(event)} aria-busy={busy}><label htmlFor="register-name">Name</label><input id="register-name" name="displayName" autoComplete="name" maxLength={100} required aria-describedby={error ? 'register-error' : undefined} /><label htmlFor="register-email">Email</label><input id="register-email" name="email" type="email" autoComplete="email" autoCapitalize="none" required aria-describedby={error ? 'register-error' : undefined} /><label htmlFor="register-password">Password</label><input id="register-password" name="password" type="password" autoComplete="new-password" minLength={6} required aria-describedby={error ? 'register-error' : undefined} />{error && <p id="register-error" className="auth-error" role="alert">{error}</p>}<button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create Student account'}</button></form>}{error && partial && <p id="register-error" className="auth-error" role="alert">{error}</p>}<p className="auth-secondary">Already registered? <Link to="/login">Sign in</Link></p></section></main>
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
  return <main className="auth-screen"><Brand to={session?.user ? destination(session.user.role) : '/login'} /><section className="auth-panel" aria-labelledby="access-title"><h1 id="access-title">{missing ? 'Student profile setup incomplete' : 'Account access unavailable'}</h1><p>{missing ? 'Your sign-in identity is ready, but your trusted profile has not been created yet.' : session?.issue === 'EMAIL_UNVERIFIED' ? 'Verify your email before continuing.' : session?.issue === 'ACCOUNT_INACTIVE' ? 'This account is suspended or disabled. Contact HelpiNUS support.' : 'Your account profile could not be validated. Contact HelpiNUS support.'}</p>{missing && <button className="button button-primary" disabled={busy} onClick={() => void retry()}>{busy ? 'Retrying setup…' : 'Retry Student profile setup'}</button>}{notice && <p role="alert">{notice}</p>}<Link to="/login">Return to sign in</Link></section></main>
}
