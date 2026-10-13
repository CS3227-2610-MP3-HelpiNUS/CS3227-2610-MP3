import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DashboardData } from '../services/contracts'
import { Icon } from '../components/Icon'
import { useServices } from '../services/useServices'

const dateFormat = new Intl.DateTimeFormat('en-SG', {
  weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore',
})

export function StudentDashboard() {
  const { services, session } = useServices()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  async function loadDashboard() {
    setLoading(true); setError(false)
    try { setData(await services.dashboard.getStudentDashboard()) }
    catch { setError(true) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    let active = true
    services.dashboard.getStudentDashboard().then((result) => {
      if (active) setData(result)
    }).catch(() => {
      if (active) setError(true)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [services])
  const greetingName = session?.user?.displayName.split(' ')[0] ?? 'there'
  if (loading) return <div className="skeleton-page" role="status" aria-label="Loading dashboard"><div/><div/><div/></div>
  if (error || !data) return <section className="empty-panel"><h1>Your dashboard isn’t available</h1><p>We couldn’t load your learning overview. Try again in a moment.</p><button className="button button-primary" onClick={() => void loadDashboard()}>Try again</button></section>

  const openRequests = data.requests.filter((request) => request.status === 'PENDING' || request.status === 'ACCEPTED')
  const confirmed = data.appointments.filter((appointment) => appointment.status === 'CONFIRMED')
  const upcoming = confirmed.map((appointment) => ({ appointment, slot: data.slots.find((slot) => slot.id === appointment.slotId) }))
    .filter(({ slot }) => slot && !slot.withdrawn)
    .sort((a, b) => Date.parse(a.slot!.startsAt) - Date.parse(b.slot!.startsAt))

  return <div className="dashboard-page">
    <section className="welcome-row"><div><h1>Welcome back, {greetingName}</h1><p>Pick up where you left off with your learning.</p></div><Link className="button button-primary" to="/student/mentors">Find a mentor <Icon name="arrow"/></Link></section>
    <section className="summary-strip" aria-label="Your learning overview">
      <div><span className="summary-value">{openRequests.length}</span><span className="summary-label">Open help requests</span></div>
      <div><span className="summary-value">{confirmed.length}</span><span className="summary-label">Confirmed consultations</span></div>
      <div><span className="summary-value">{data.conversations.length}</span><span className="summary-label">Conversations</span></div>
    </section>
    <div className="dashboard-grid">
      <section className="content-section"><div className="section-heading"><div><h2>Help requests</h2><p>Track the support you’re looking for.</p></div><Link to="/student/requests">View all</Link></div>
        {openRequests.length ? <ul className="request-list">{openRequests.map((request) => {
          const module = data.mentors.flatMap((item) => item.modules).find((item) => item.id === request.moduleId)
          return <li key={request.id}><div className="request-icon"><Icon name="requests"/></div><div className="request-copy"><strong>{request.title}</strong><span>{module?.code ?? 'Module'} · {request.mentorId ? 'Mentor assigned' : 'Finding a mentor'}</span></div><span className={`status-pill status-${request.status.toLowerCase()}`}>{request.status === 'ACCEPTED' ? 'Accepted' : 'Pending'}</span></li>
        })}</ul> : <div className="inline-empty"><p>No open requests yet.</p><Link to="/student/requests">Explore help options</Link></div>}
      </section>
      <section className="content-section next-session"><div className="section-heading"><div><h2>Next consultation</h2><p>Your upcoming mentor session.</p></div></div>
        {upcoming.length ? upcoming.slice(0, 1).map(({ appointment, slot }) => {
          const mentor = data.mentors.find((item) => item.user.id === appointment.mentorId)?.user
          return <div className="session-detail" key={appointment.id}><div className="session-date"><Icon name="calendar"/><span>{dateFormat.format(new Date(slot!.startsAt))}</span></div><h3>{appointment.topic}</h3><p>with {mentor?.displayName ?? 'your mentor'}</p><Link to="/student/conversations" className="text-link">Open conversation <Icon name="arrow"/></Link></div>
        }) : <div className="inline-empty"><p>No upcoming consultations yet.</p><Link to="/student/mentors">Find a mentor</Link></div>}
      </section>
    </div>
    <section className="study-callout"><div className="study-icon"><Icon name="spark"/></div><div><h2>Need a study nudge?</h2><p>Get help thinking through a topic at your own pace.</p></div><Link to="/student/study-assistant" className="text-link">Explore study assistant <Icon name="arrow"/></Link></section>
    <p className="mock-note">Sample workspace data for frontend preview.</p>
  </div>
}
