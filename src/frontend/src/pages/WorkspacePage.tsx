import { Link, useLocation } from 'react-router-dom'
import { Icon } from '../components/Icon'

interface PageCopy { title: string; description: string; detail: string; action: string; icon: 'mentors' | 'requests' | 'messages' | 'calendar' | 'study' }
const pages: Record<string, PageCopy> = {
  '/student/mentors': { title: 'Find a mentor', description: 'Meet NUS students who can help you work through a module.', detail: 'Mentor profiles and matching will connect here during backend integration.', action: 'Browse help requests', icon: 'mentors' },
  '/student/requests': { title: 'Help requests', description: 'Ask for support with a module or topic.', detail: 'Request creation and status changes are being connected to the help request service.', action: 'Find a mentor', icon: 'requests' },
  '/student/conversations': { title: 'Conversations', description: 'Keep your mentor discussions in one place.', detail: 'Your conversations will appear here when messaging is connected.', action: 'View help requests', icon: 'messages' },
  '/student/consultations': { title: 'Consultations', description: 'Plan a time to learn together.', detail: 'Booking availability and consultation details will appear here when scheduling is connected.', action: 'Find a mentor', icon: 'calendar' },
  '/student/study-assistant': { title: 'Study assistant', description: 'Work through a question one step at a time.', detail: 'The NUS SoC LLM service is not connected in this sprint. No prompts are sent from this screen.', action: 'Back to dashboard', icon: 'study' },
  '/mentor/dashboard': { title: 'Mentor dashboard', description: 'Manage student requests and your consultation schedule.', detail: 'The mentor workspace will connect to its role-specific services during integration.', action: 'Student dashboard', icon: 'mentors' },
}

export function WorkspacePage() {
  const { pathname } = useLocation()
  const page = pages[pathname] ?? pages['/student/mentors']
  const to = page.action === 'Find a mentor' ? '/student/mentors' : page.action === 'Browse help requests' || page.action === 'View help requests' ? '/student/requests' : '/student/dashboard'
  return <section className="workspace-page">
    <div className="page-heading"><h1>{page.title}</h1><p>{page.description}</p></div>
    {pathname === '/student/mentors' && <div className="mentor-preview"><span className="mentor-avatar">AR</span><div><h2>Aisha Rahman</h2><p>Software Engineering · Data Structures and Algorithms</p><span className="mentor-bio">I enjoy breaking software design concepts into practical steps.</span></div><span className="availability-label">Active mentor</span></div>}
    <div className="coming-panel"><div className="coming-icon"><Icon name={page.icon}/></div><div><h2>{pathname === '/student/study-assistant' ? 'Study assistance is coming later' : 'This space is ready for integration'}</h2><p>{page.detail}</p><Link className="text-link" to={to}>{page.action}<Icon name="arrow"/></Link></div></div>
  </section>
}
