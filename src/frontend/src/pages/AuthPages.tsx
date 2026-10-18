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
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow popups for HelpiNUS and try again.',
    'auth/cancelled-popup-request': 'A Google sign-in window is already open. Complete it or try again.',
    'auth/network-request-failed': 'We could not reach Google sign-in. Check your connection and try again.',
    'auth/unauthorized-domain': 'Google sign-in is not configured for this website. Contact HelpiNUS support.',
    'auth/operation-not-allowed': 'Google sign-in is temporarily unavailable. Contact HelpiNUS support.',
    'auth/configuration-not-found': 'Google sign-in is temporarily unavailable. Contact HelpiNUS support.',
    'auth/user-disabled': 'This Google account cannot access HelpiNUS. Contact HelpiNUS support.',
    'functions/failed-precondition': 'Your Google account details could not be verified. Try another account or contact support.',
    'functions/permission-denied': 'Your account could not be verified. Contact HelpiNUS support.',
    'functions/unavailable': 'The account service is temporarily unavailable. Try again shortly.',
    'mock/preview-only': 'This preview has no sign-in accounts. Start the Firebase emulator demo to use Google sign-in.',
  }
  if (typeof code === 'string') return messages[code] ?? 'We could not complete that request. Please try again.'
  return 'We could not complete that request. Please try again.'
}

function issueMessage(issue: Session['issue'], registering = false) {
  if (issue === 'PROFILE_MISSING') {
    return registering
      ? 'Your Google account is ready, but we need your name to finish creating your Student profile.'
      : 'No HelpiNUS profile is linked to this Google account. Create a Student account to continue.'
  }
  if (issue === 'ACCOUNT_INACTIVE') return 'This account is suspended or disabled. Contact HelpiNUS support.'
  return 'Your account profile could not be validated. Contact HelpiNUS support.'
}

function Brand({ to = '/login' }: { to?: string }) {
  return <Link className="brand auth-brand" to={to}><span className="brand-mark">H</span><span>Helpi<span className="brand-accent">NUS</span></span></Link>
}

function ProfileRecoveryForm({ busy, onRetry }: {
  busy: boolean
  onRetry: (displayName: string) => Promise<void>
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void onRetry(String(data.get('displayName')))
  }

  return <form className="auth-actions" onSubmit={submit} aria-busy={busy}>
    <label htmlFor="recovery-name">Name</label>
    <input id="recovery-name" name="displayName" autoComplete="name" maxLength={100} required />
    <button className="button button-primary auth-submit" disabled={busy}>
      {busy ? 'Finishing setup…' : 'Finish Student profile setup'}
    </button>
  </form>
}

function GoogleButton({ busy, label, busyLabel, onClick }: {
  busy: boolean
  label: string
  busyLabel: string
  onClick: () => Promise<void>
}) {
  return <button type="button" className="button button-primary auth-submit" disabled={busy} onClick={() => void onClick()}>
    {busy ? busyLabel : label}
  </button>
}

export function LoginPage() {
  const { session, services, refreshSession } = useServices()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (session?.user?.status === 'ACTIVE') return <Navigate to={destination(session.user.role)} replace />

  async function signIn() {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const result = await services.session.signInWithGoogle()
      await refreshSession()
      if (result.user) navigate(destination(result.user.role))
      else setError(issueMessage(result.issue))
    } catch (cause) {
      if ((cause as { code?: unknown })?.code !== 'auth/popup-closed-by-user') setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-screen">
    <Brand />
    <section className="auth-panel" aria-labelledby="login-title">
      <h1 id="login-title">Welcome to HelpiNUS</h1>
      <p>Use your Google account to continue.</p>
      {error && <p id="login-error" className="auth-error" role="alert">{error}</p>}
      <GoogleButton busy={busy} label="Continue with Google" busyLabel="Opening Google…" onClick={signIn} />
      <p className="auth-secondary">New to HelpiNUS? <Link to="/register">Create a Student account</Link></p>
      <p className="auth-secondary"><Link to="/forgot-password">Need help with your Google password?</Link></p>
    </section>
    <p className="auth-footnote">For students and mentors</p>
  </main>
}

export function RegisterPage() {
  const { services, session, refreshSession } = useServices()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [needsName, setNeedsName] = useState(session?.issue === 'PROFILE_MISSING')
  const [busy, setBusy] = useState(false)
  if (session?.user?.status === 'ACTIVE') return <Navigate to={destination(session.user.role)} replace />

  async function register() {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const result = await services.session.registerStudentWithGoogle()
      await refreshSession()
      if (result.user) navigate(destination(result.user.role))
      else {
        setNeedsName(result.issue === 'PROFILE_MISSING')
        setError(issueMessage(result.issue, true))
      }
    } catch (cause) {
      if ((cause as { code?: unknown })?.code !== 'auth/popup-closed-by-user') setError(message(cause))
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
      else setError(issueMessage(result.issue, true))
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-screen">
    <Brand />
    <section className="auth-panel" aria-labelledby="register-title">
      <h1 id="register-title">Create your Student account</h1>
      <p>Continue with any Google account. Public registration always creates a Student profile.</p>
      {error && <p id="register-error" className="auth-error" role="alert">{error}</p>}
      {needsName
        ? <ProfileRecoveryForm busy={busy} onRetry={retry} />
        : <GoogleButton busy={busy} label="Create Student account with Google" busyLabel="Opening Google…" onClick={register} />}
      <p className="auth-secondary">Already registered? <Link to="/login">Sign in</Link></p>
    </section>
  </main>
}

export function ForgotPasswordPage() {
  return <main className="auth-screen">
    <Brand />
    <section className="auth-panel" aria-labelledby="password-help-title">
      <h1 id="password-help-title">Recover your Google account</h1>
      <p>HelpiNUS does not store your password. Use Google Account Recovery to reset it securely.</p>
      <a className="button button-primary auth-submit" href="https://accounts.google.com/signin/recovery" target="_blank" rel="noreferrer">Open Google Account Recovery</a>
      <p className="auth-secondary"><Link to="/login">Back to sign in</Link></p>
    </section>
  </main>
}

export function AccountAccessPage() {
  const { session, services, refreshSession } = useServices()
  const navigate = useNavigate()
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  if (session?.user?.status === 'ACTIVE') return <Navigate to={destination(session.user.role)} replace />

  async function retry(displayName: string) {
    setBusy(true)
    setNotice('')
    try {
      const result = await services.session.retryStudentProfile(displayName)
      await refreshSession()
      if (result.user) navigate(destination(result.user.role), { replace: true })
      else setNotice(issueMessage(result.issue, true))
    } catch (cause) {
      setNotice(message(cause))
    } finally {
      setBusy(false)
    }
  }

  const missing = session?.issue === 'PROFILE_MISSING'
  return <main className="auth-screen">
    <Brand />
    <section className="auth-panel" aria-labelledby="access-title">
      <h1 id="access-title">{missing ? 'Student profile setup incomplete' : 'Account access unavailable'}</h1>
      <p>{missing ? 'Your Google identity is ready, but your trusted Student profile still needs a name.' : session?.issue === 'ACCOUNT_INACTIVE' ? 'This account is suspended or disabled. Contact HelpiNUS support.' : 'Your account profile could not be validated. Contact HelpiNUS support.'}</p>
      {missing && <ProfileRecoveryForm busy={busy} onRetry={retry} />}
      {notice && <p className="auth-error" role="alert">{notice}</p>}
      <Link to="/login">Return to sign in</Link>
    </section>
  </main>
}
