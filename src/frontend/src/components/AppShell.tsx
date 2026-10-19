import { NavLink, Outlet, useNavigate, type NavLinkRenderProps } from 'react-router-dom'
import { useState } from 'react'
import { Icon } from './Icon'
import { useServices } from '../services/useServices'

const studentLinks = [
  { to: '/student/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/student/mentors', label: 'Find a mentor', icon: 'mentors' },
  { to: '/student/requests', label: 'Help requests', icon: 'requests' },
  { to: '/student/conversations', label: 'Conversations', icon: 'messages' },
  { to: '/student/consultations', label: 'Consultations', icon: 'calendar' },
  { to: '/student/study-assistant', label: 'Study assistant', icon: 'study' },
] as const
const mentorLinks = [
  { to: '/mentor/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/mentor/requests', label: 'Help requests', icon: 'requests' },
  { to: '/mentor/conversations', label: 'Conversations', icon: 'messages' },
  { to: '/mentor/consultations', label: 'Consultations', icon: 'calendar' },
  { to: '/mentor/profile', label: 'My profile', icon: 'mentors' },
] as const

export type AppShellOutletContext = { signOut: () => void; signingOut: boolean }

export function AppShell() {
  const { services, session, refreshSession } = useServices()
  const navigate = useNavigate()
  const [signOutError, setSignOutError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const isMentor = session?.user?.role === 'MENTOR'
  const links = isMentor ? mentorLinks : studentLinks
  const home = isMentor ? '/mentor/dashboard' : '/student/dashboard'
  async function logOut() {
    setSigningOut(true)
    setSignOutError('')
    try {
      await services.session.signOut()
      await refreshSession()
      await navigate('/login')
    } catch {
      setSignOutError('We could not sign you out. Check your connection and try again.')
    } finally {
      setSigningOut(false)
    }
  }
  return <div className="app-frame">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar">
      <NavLink className="brand" to={home} aria-label="HelpiNUS home"><span className="brand-mark">H</span><span>Helpi<span className="brand-accent">NUS</span></span></NavLink>
      <div className="sidebar-label">{isMentor ? 'MENTOR SPACE' : 'STUDENT SPACE'}</div>
      <nav className="side-nav" aria-label={isMentor ? 'Mentor navigation' : 'Student navigation'}>
        {links.map(({ to, label, icon }) => <NavLink key={to} to={to} className={(state: NavLinkRenderProps) => `nav-link${state.isActive ? ' active' : ''}`}><Icon name={icon} /><span>{label}</span></NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="profile-chip"><span className="avatar">{session?.user?.displayName.slice(0, 1) ?? 'S'}</span><span><strong>{session?.user?.displayName ?? 'Student'}</strong><small>{isMentor ? 'Mentor account' : 'Student account'}</small></span></div>
        <button className="logout-button" onClick={() => void logOut()} disabled={signingOut}><Icon name="logout"/>{signingOut ? 'Signing out…' : 'Sign out'}</button>
      </div>
    </aside>
    <div className="main-column">
      <header className="topbar"><NavLink className="topbar-mobile-brand" to={home} aria-label="HelpiNUS home"><span className="brand-mark">H</span> HelpiNUS</NavLink><span className="topbar-caption">Your NUS learning community</span><span className="topbar-account"><span className="topbar-avatar" aria-label={`Signed in as ${session?.user?.displayName ?? 'Student'}`}>{session?.user?.displayName.slice(0, 1) ?? 'S'}</span><button className="mobile-signout" onClick={() => void logOut()} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button></span></header>
      {signOutError && <p className="signout-error" role="alert">{signOutError}</p>}
      <main id="main-content" className="main-content" tabIndex={-1}><Outlet context={{ signOut: () => void logOut(), signingOut } satisfies AppShellOutletContext} /></main>
      <nav className="mobile-nav" aria-label={isMentor ? 'Mentor navigation' : 'Student navigation'}>
        {links.map(({ to, label, icon }) => <NavLink key={to} to={to} aria-label={label} title={label} className={(state: NavLinkRenderProps) => `mobile-nav-link${state.isActive ? ' active' : ''}`}><Icon name={icon}/><span>{label === 'Find a mentor' ? 'Mentors' : label === 'My profile' ? 'Profile' : label === 'Help requests' ? 'Requests' : label === 'Conversations' ? 'Messages' : label === 'Study assistant' ? 'Study' : label === 'Dashboard' ? 'Home' : label}</span></NavLink>)}
      </nav>
    </div>
  </div>
}
