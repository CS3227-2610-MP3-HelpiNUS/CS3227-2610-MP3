import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useServices } from '../services/useServices'
import type { Session } from '../services/contracts'

function destination(role: 'STUDENT' | 'MENTOR') {
  return role === 'STUDENT' ? '/student/dashboard' : '/mentor/dashboard'
}

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
    'mock/preview-only': 'This preview has no sign-in accounts. Start the Firebase emulator demo to sign in as a Student or Mentor.',
  }
  if (typeof code === 'string') return messages[code] ?? 'We could not complete that request. Please try again.'
  return 'We could not complete that request. Please try again.'
}

function issueMessage(issue: Session['issue']) {
  if (issue === 'EMAIL_UNVERIFIED') return 'Verify your email before continuing.'
  if (issue === 'PROFILE_MISSING') return 'Your sign-in identity exists, but Student setup is incomplete. Enter your name to retry safely.'
  if (issue === 'ACCOUNT_INACTIVE') return 'This account is suspended or disabled. Contact HelpiNUS support.'
  return 'Your account profile could not be validated. Contact HelpiNUS support.'
}

function Brand({ to = '/login' }: { to?: string }) {
  return <Link className="brand auth-brand" to={to}><span className="brand-mark">H</span><span>Helpi<span className="brand-accent">NUS</span></span></Link>
}

function ProfileRecoveryForm({ busy, defaultName = '', onRetry }: {
  busy: boolean
  defaultName?: string
  onRetry: (displayName: string) => Promise<void>
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void onRetry(String(data.get('displayName')))
  }

  return <form className="auth-actions" onSubmit={submit} aria-busy={busy}>
    <label htmlFor="recovery-name">Name</label>
    <input id="recovery-name" name="displayName" autoComplete="name" defaultValue={defaultName} maxLength={100} required />
    <button className="button button-primary auth-submit" disabled={busy}>
      {busy ? 'Retrying setup…' : 'Retry Student profile setup'}
    </button>
  </form>
}

function VerificationActions({ busy, verificationSent, onResend, onRefresh }: {
  busy: boolean
  verificationSent: boolean
  onResend: () => Promise<void>
  onRefresh: () => Promise<void>
}) {
  return <div className="auth-actions">
    {verificationSent && <p role="status">Verification email sent. Check your inbox.</p>}
    <button className="button button-secondary auth-submit" disabled={busy} onClick={() => void onResend()}>
      {busy ? 'Please wait…' : verificationSent ? 'Resend verification email' : 'Send verification email'}
    </button>
    <button className="button button-primary auth-submit" disabled={busy} onClick={() => void onRefresh()}>
      {busy ? 'Checking…' : 'I’ve verified my email'}
    </button>
  </div>
}

export function LoginPage() {
  const { session, services, refreshSession } = useServices()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [verificationSent, setVerificationSent] = useState(false)
  const [busy, setBusy] = useState(false)
  if (session?.user?.status === 'ACTIVE') return <Navigate to={destination(session.user.role)} replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      const result = await services.session.signIn({ email: String(data.get('email')), password: String(data.get('password')) })
      await refreshSession()
      if (result.user) navigate(destination(result.user.role))
      else setError(issueMessage(result.issue))
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  async function retry(displayName: string) {
    setError('')
    setBusy(true)
    try {
      const result = await services.session.retryStudentProfile(displayName)
      await refreshSession()
      if (result.user) navigate(destination(result.user.role))
      else setError(issueMessage(result.issue))
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  async function resendVerification() {
    setError('')
    setBusy(true)
    try {
      await services.session.resendVerificationEmail()
      setVerificationSent(true)
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  async function refreshVerification() {
    setError('')
    setBusy(true)
    try {
      const result = await services.session.getCurrent()
      await refreshSession()
      if (result.user) navigate(destination(result.user.role))
      else setError(issueMessage(result.issue))
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-screen">
    <Brand />
    <section className="auth-panel" aria-labelledby="login-title">
      <h1 id="login-title">Welcome to HelpiNUS</h1>
      <p>Find the support you need to keep learning.</p>
      <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
        <label htmlFor="login-email">Email</label>
        <input id="login-email" name="email" type="email" autoComplete="email" autoCapitalize="none" required aria-describedby={error ? 'login-error' : undefined} />
        <label htmlFor="login-password">Password</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password" required aria-describedby={error ? 'login-error' : undefined} />
        {error && <p id="login-error" className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      {session?.issue === 'PROFILE_MISSING' && <ProfileRecoveryForm busy={busy} onRetry={retry} />}
      {session?.issue === 'EMAIL_UNVERIFIED' && <VerificationActions busy={busy} verificationSent={verificationSent} onResend={resendVerification} onRefresh={refreshVerification} />}
      <p className="auth-secondary">New to HelpiNUS? <Link to="/register">Create a Student account</Link></p>
      <Link className="auth-secondary" to="/forgot-password">Forgot your password?</Link>
    </section>
    <p className="auth-footnote">For NUS students and mentors</p>
  </main>
}

export function RegisterPage() {
  const { services, session, refreshSession } = useServices()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [partial, setPartial] = useState(false)
  const [unverified, setUnverified] = useState(false)
  const [recoveryName, setRecoveryName] = useState('')
  const [verificationSent, setVerificationSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function resendVerification() {
    setBusy(true)
    setError('')
    try {
      await services.session.resendVerificationEmail()
      setVerificationSent(true)
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  async function refreshVerification() {
    setBusy(true)
    setError('')
    try {
      const result = await services.session.getCurrent()
      await refreshSession()
      if (result.user) navigate(destination(result.user.role))
      else {
        setPartial(true)
        setUnverified(result.issue === 'EMAIL_UNVERIFIED')
        setError(issueMessage(result.issue))
      }
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  async function retry(displayName: string) {
    setBusy(true)
    setError('')
    setRecoveryName(displayName)
    try {
      const result = await services.session.retryStudentProfile(displayName)
      await refreshSession()
      if (result.user) navigate(destination(result.user.role))
      else {
        setError(issueMessage(result.issue))
        setPartial(true)
        setUnverified(result.issue === 'EMAIL_UNVERIFIED')
      }
    } catch (cause) {
      setError(message(cause))
      setPartial(true)
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const data = new FormData(event.currentTarget)
    const displayName = String(data.get('displayName'))
    setRecoveryName(displayName)
    try {
      const result = await services.session.registerStudent({ displayName, email: String(data.get('email')), password: String(data.get('password')) })
      await refreshSession()
      if (result.user) navigate(destination(result.user.role))
      else {
        setError(issueMessage(result.issue))
        setPartial(true)
        setUnverified(result.issue === 'EMAIL_UNVERIFIED')
      }
    } catch (cause) {
      setError(message(cause))
      const current = await services.session.getCurrent().catch(() => null)
      if (current?.user) navigate(destination(current.user.role))
      else if (current?.issue) {
        setError(issueMessage(current.issue))
        setPartial(true)
        setUnverified(current.issue === 'EMAIL_UNVERIFIED')
      }
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-screen">
    <Brand to={session?.user ? destination(session.user.role) : '/login'} />
    <section className="auth-panel" aria-labelledby="register-title">
      <h1 id="register-title">Create your account</h1>
      <p>Public registration creates a Student account.</p>
      {partial ? <>
        <p role="status">{unverified ? 'Your account exists but still needs email verification.' : 'Your sign-in identity exists, but Student setup is incomplete. Enter your name to retry safely.'}</p>
        {unverified
          ? <VerificationActions busy={busy} verificationSent={verificationSent} onResend={resendVerification} onRefresh={refreshVerification} />
          : <ProfileRecoveryForm busy={busy} defaultName={recoveryName} onRetry={retry} />}
      </> : <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
        <label htmlFor="register-name">Name</label>
        <input id="register-name" name="displayName" autoComplete="name" maxLength={100} required aria-describedby={error ? 'register-error' : undefined} />
        <label htmlFor="register-email">Email</label>
        <input id="register-email" name="email" type="email" autoComplete="email" autoCapitalize="none" required aria-describedby={error ? 'register-error' : undefined} />
        <label htmlFor="register-password">Password</label>
        <input id="register-password" name="password" type="password" autoComplete="new-password" minLength={6} required aria-describedby={error ? 'register-error' : undefined} />
        {error && <p id="register-error" className="auth-error" role="alert">{error}</p>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create Student account'}</button>
      </form>}
      {error && partial && <p id="register-error" className="auth-error" role="alert">{error}</p>}
      <p className="auth-secondary">Already registered? <Link to="/login">Sign in</Link></p>
    </section>
  </main>
}

export function ForgotPasswordPage() {
  return <main className="auth-screen"><Brand /><section className="auth-panel"><h1>Reset your password</h1><p>Password recovery will be available with account sign-in.</p><Link className="button button-secondary auth-submit" to="/login">Back to sign in</Link></section></main>
}

export function AccountAccessPage() {
  const { session, services, refreshSession } = useServices()
  const navigate = useNavigate()
  const [notice, setNotice] = useState('')
  const [verificationSent, setVerificationSent] = useState(false)
  const [busy, setBusy] = useState(false)
  if (session?.user?.status === 'ACTIVE') return <Navigate to={destination(session.user.role)} replace />

  async function retry(displayName: string) {
    setBusy(true)
    setNotice('')
    try {
      const result = await services.session.retryStudentProfile(displayName)
      await refreshSession()
      if (result.user) navigate(destination(result.user.role), { replace: true })
      else setNotice(issueMessage(result.issue))
    } catch (cause) {
      setNotice(message(cause))
    } finally {
      setBusy(false)
    }
  }

  async function resendVerification() {
    setBusy(true)
    setNotice('')
    try {
      await services.session.resendVerificationEmail()
      setVerificationSent(true)
    } catch (cause) {
      setNotice(message(cause))
    } finally {
      setBusy(false)
    }
  }

  async function refreshVerification() {
    setBusy(true)
    setNotice('')
    try {
      const result = await services.session.getCurrent()
      await refreshSession()
      if (result.user) navigate(destination(result.user.role), { replace: true })
      else setNotice(issueMessage(result.issue))
    } catch (cause) {
      setNotice(message(cause))
    } finally {
      setBusy(false)
    }
  }

  const missing = session?.issue === 'PROFILE_MISSING'
  const unverified = session?.issue === 'EMAIL_UNVERIFIED'
  return <main className="auth-screen">
    <Brand />
    <section className="auth-panel" aria-labelledby="access-title">
      <h1 id="access-title">{missing ? 'Student profile setup incomplete' : unverified ? 'Verify your email' : 'Account access unavailable'}</h1>
      <p>{missing ? 'Your sign-in identity is ready, but your trusted profile has not been created yet.' : unverified ? 'Open the verification message, then return here to refresh your account.' : session?.issue === 'ACCOUNT_INACTIVE' ? 'This account is suspended or disabled. Contact HelpiNUS support.' : 'Your account profile could not be validated. Contact HelpiNUS support.'}</p>
      {missing && <ProfileRecoveryForm busy={busy} onRetry={retry} />}
      {unverified && <VerificationActions busy={busy} verificationSent={verificationSent} onResend={resendVerification} onRefresh={refreshVerification} />}
      {notice && <p className="auth-error" role="alert">{notice}</p>}
      <Link to="/login">Return to sign in</Link>
    </section>
  </main>
}
