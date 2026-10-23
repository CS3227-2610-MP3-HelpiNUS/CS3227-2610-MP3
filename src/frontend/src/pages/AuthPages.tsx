import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useServices } from '../services/useServices'
import type { Session } from '../services/contracts'
import type { UserRole } from '@helpinus/shared'

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
    'auth/missing-email': 'This Google account did not provide an email address. Try another account.',
    'auth/registration-required': 'Continue with Google again to finish registration.',
    'functions/already-exists': 'This Google account already has another role. Sign in with that role or use a different Google account.',
    'functions/failed-precondition': 'Your Google account details could not be verified. Try another account or contact support.',
    'functions/permission-denied': 'Your account could not be verified. Contact HelpiNUS support.',
    'functions/unavailable': 'The account service is temporarily unavailable. Try again shortly.',
    'mock/preview-only': 'This preview has no sign-in accounts. Start the Firebase emulator demo to use Google sign-in.',
  }
  if (typeof code === 'string') return messages[code] ?? 'We could not complete that request. Please try again.'
  return 'We could not complete that request. Please try again.'
}

function roleName(role: UserRole) { return role === 'STUDENT' ? 'Student' : 'Mentor' }

function issueMessage(issue: Session['issue'], role: UserRole, registering = false) {
  if (issue === 'WRONG_ROLE') return 'This Google account is registered with another role. Sign in using its existing role, or use another Google account.'
  if (issue === 'ROLE_CONFLICT') return 'This Google account has conflicting Student and Mentor profiles. Contact HelpiNUS support for review.'
  if (issue === 'PROFILE_MISSING') {
    return registering
      ? `Your Google account is ready, but we need your name to finish creating your ${roleName(role)} profile.`
      : `No ${roleName(role)} profile is linked to this Google account. Create a ${roleName(role)} account to continue.`
  }
  if (issue === 'ACCOUNT_INACTIVE') return 'This account is suspended or disabled. Contact HelpiNUS support.'
  return 'Your account profile could not be validated. Contact HelpiNUS support.'
}

function Brand({ to = '/login' }: { to?: string }) {
  return <Link className="brand auth-brand" to={to}><span className="brand-mark">H</span><span>Helpi<span className="brand-accent">NUS</span></span></Link>
}

function ProfileRecoveryForm({ busy, role, onRetry }: {
  busy: boolean
  role: UserRole
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
      {busy ? 'Finishing setup…' : `Finish ${roleName(role)} profile setup`}
    </button>
  </form>
}

export function LoginPage() {
  const { session, services, refreshSession } = useServices()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [roleChoice, setRoleChoice] = useState<UserRole | null>(null)
  const [params] = useSearchParams()
  const existingAccount = params.get('existing') === '1'
  const chosenRole = roleChoice ?? session?.selectedRole ?? null
  if (session?.user?.status === 'ACTIVE') return <Navigate to={destination(session.user.role)} replace />

  async function signIn(role: UserRole) {
    if (busy) return
    setError('')
    setBusy(true)
    setRoleChoice(role)
    try {
      const result = await services.session.signInWithGoogle(role)
      await refreshSession()
      if (result.user?.role === role) navigate(destination(role))
      else setError(issueMessage(result.issue, role))
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
      <p>{existingAccount ? 'Choose your existing role, then sign in with Google.' : 'Do you already have a HelpiNUS account?'}</p>
      {error && <p id="login-error" className="auth-error" role="alert">{error}</p>}
      {!existingAccount ? <div className="auth-actions">
        <Link className="button button-primary auth-submit" to="/login?existing=1">Yes, sign in</Link>
        <Link className="button button-secondary auth-submit" to="/register">No, create an account</Link>
      </div> : <div className="auth-actions" role="group" aria-label="Choose a role">
        <button type="button" className="button auth-role-button auth-role-student" disabled={busy} onClick={() => void signIn('STUDENT')}>Continue as Student</button>
        <button type="button" className="button auth-role-button auth-role-mentor" disabled={busy} onClick={() => void signIn('MENTOR')}>Continue as Mentor</button>
      </div>}
      {existingAccount && chosenRole && session?.issue === 'PROFILE_MISSING' && <p className="auth-secondary"><Link to={`/register?role=${chosenRole}`}>Create {roleName(chosenRole)} account</Link></p>}
      {existingAccount && <p className="auth-secondary"><Link to="/register">Create an account</Link> · <Link to="/login">Back</Link></p>}
      <p className="auth-secondary"><Link to="/forgot-password">Need help with your Google password?</Link></p>
    </section>
    <p className="auth-footnote">For students and mentors</p>
  </main>
}

export function RegisterPage() {
  const { services, session, refreshSession } = useServices()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const role: UserRole | null = params.get('role') === 'MENTOR' ? 'MENTOR' : params.get('role') === 'STUDENT' ? 'STUDENT' : null
  const [error, setError] = useState('')
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (session?.user?.status === 'ACTIVE') return <Navigate to={destination(session.user.role)} replace />
  const needsName = role && confirmedEmail && confirmedEmail === session?.identity?.email && session.selectedRole === role && session.issue === 'PROFILE_MISSING'

  async function register() {
    if (busy || !role) return
    setError('')
    setBusy(true)
    try {
      const result = role === 'STUDENT'
        ? await services.session.registerStudentWithGoogle()
        : await services.session.registerMentorWithGoogle()
      await refreshSession()
      if (result.user?.role === role) navigate(destination(role))
      else {
        setConfirmedEmail(result.issue === 'PROFILE_MISSING' ? result.identity?.email ?? null : null)
        setError(issueMessage(result.issue, role, true))
      }
    } catch (cause) {
      if ((cause as { code?: unknown })?.code !== 'auth/popup-closed-by-user') setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  async function retry(displayName: string) {
    if (!role || !needsName) return
    setError('')
    setBusy(true)
    try {
      const result = role === 'STUDENT'
        ? await services.session.retryStudentProfile(displayName)
        : await services.session.retryMentorProfile(displayName)
      await refreshSession()
      if (result.user?.role === role) navigate(destination(role))
      else setError(issueMessage(result.issue, role, true))
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  async function changeAccount() {
    setBusy(true)
    setError('')
    try {
      await services.session.signOut()
      setConfirmedEmail(null)
      await refreshSession()
    } catch (cause) { setError(message(cause)) }
    finally { setBusy(false) }
  }

  return <main className="auth-screen">
    <Brand />
    <section className="auth-panel" aria-labelledby="register-title">
      <h1 id="register-title">{role ? `Create your ${roleName(role)} account` : 'Create your account'}</h1>
      <p>Choose one role for your Google account. Students receive help; Mentors offer it.</p>
      <div className="auth-actions">
        <label htmlFor="registration-role">Account type</label>
        <select id="registration-role" value={role ?? ''} disabled={busy} onChange={(event) => { setConfirmedEmail(null); setError(''); setParams(event.target.value ? { role: event.target.value } : {}) }}>
          <option value="" disabled>Choose your role</option>
          <option value="STUDENT">Student (mentee)</option>
          <option value="MENTOR">Mentor</option>
        </select>
      </div>
      {error && <p id="register-error" className="auth-error" role="alert">{error}</p>}
      {session?.identity && <p>Google account: <strong>{session.identity.email}</strong></p>}
      {needsName && role
        ? <ProfileRecoveryForm busy={busy} role={role} onRetry={retry} />
        : <button type="button" className="button button-primary auth-submit" disabled={busy || !role} onClick={() => void register()}>{busy ? 'Opening Google…' : 'Continue with Google'}</button>}
      {session?.identity && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void changeAccount()}>Use another Google account</button>}
      <p className="auth-secondary">Already registered? <Link to="/login?existing=1">Sign in</Link></p>
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
  const { session } = useServices()
  const role = session?.selectedRole ?? 'STUDENT'
  if (session?.user?.status === 'ACTIVE') return <Navigate to={destination(session.user.role)} replace />

  const missing = session?.issue === 'PROFILE_MISSING'
  return <main className="auth-screen">
    <Brand />
    <section className="auth-panel" aria-labelledby="access-title">
      <h1 id="access-title">{missing ? `${roleName(role)} profile setup incomplete` : 'Account access unavailable'}</h1>
      <p>{missing ? `Continue with Google to finish creating your ${roleName(role)} profile.` : issueMessage(session?.issue, role)}</p>
      {session?.identity && <p>Google account: <strong>{session.identity.email}</strong></p>}
      {missing && <Link to={`/register?role=${role}`}>Create {roleName(role)} account</Link>}
      <Link to="/login?existing=1">Return to sign in</Link>
    </section>
  </main>
}
