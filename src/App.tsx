import React, { useEffect, useState, type ReactNode } from 'react'
import './App.css'

type NavItem = {
  label: string
  icon: ReactNode
  active?: boolean
}

type ProjectItem = {
  name: string
  status: 'success' | 'warning' | 'info'
  active?: boolean
}

const navItems: NavItem[] = [
  { label: 'Home', icon: <span className="nav-icon-shape" />, active: true },
  { label: 'Messages', icon: <span className="nav-icon-shape" /> },
  { label: 'Tasks', icon: <span className="nav-icon-shape" /> },
  { label: 'Members', icon: <span className="nav-icon-shape" /> },
  { label: 'Settings', icon: <span className="nav-icon-shape" /> },
]

const projects: ProjectItem[] = [
  { name: 'Mobile App', status: 'success', active: true },
  { name: 'Website Redesign', status: 'warning' },
  { name: 'Design System', status: 'info' },
  { name: 'Wireframes', status: 'info' },
]

type Thought = {
  id: string
  content: string
  order: number
}

function App() {
  const [backendStatus, setBackendStatus] = useState<string>('Checking...')
  const [thoughts, setThoughts] = useState<Thought[]>([])
  const [authToken, setAuthToken] = useState('')
  const [thoughtInput, setThoughtInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const fallbackThought =
    'We do not have any notice for you yet. Share your thoughts with your peers.'

  useEffect(() => {
    fetch('/health')
      .then(res => res.json())
      .then(data => setBackendStatus(data.message || 'OK'))
      .catch(() => setBackendStatus('Backend not connected'))
  }, [])

  useEffect(() => {
    const fetchThoughts = async () => {
      try {
        const res = await fetch('/api/thoughts')
        const data = await res.json()
        const list = Array.isArray(data.thoughts) ? data.thoughts : []
        setThoughts(list)
        setThoughtInput(list.map((item: Thought) => item.content).join('\n'))
      } catch {
        setThoughts([])
      }
    }

    fetchThoughts()
  }, [])

  const handleUpdateThoughts = async () => {
    setMessage('')
    if (!authToken.trim()) {
      setMessage('Superadmin token is required to update thoughts.')
      return
    }

    const entries = thoughtInput
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    if (!entries.length) {
      setMessage('Add at least one thought before saving.')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/thoughts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken.trim()}`,
        },
        body: JSON.stringify({ thoughts: entries }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update thoughts')
      }

      const list = Array.isArray(data.thoughts) ? data.thoughts : []
      setThoughts(list)
      setMessage('Thoughts updated successfully.')
    } catch (error: any) {
      setMessage(error?.message || 'Failed to update thoughts')
    } finally {
      setIsSaving(false)
    }
  }

  const primaryThought = (() => {
    if (!thoughts.length) return fallbackThought
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
    return thoughts[dayIndex % thoughts.length]?.content || fallbackThought
  })()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <div className="avatar">PM</div>
            <span className="product-name">Project M.</span>
          </div>
          <button className="collapse-btn" type="button" aria-label="Collapse sidebar">
            {'<'}
          </button>
        </div>

        <nav className="nav-section" aria-label="Primary">
          <ul className="nav-list">
            {navItems.map(item => (
              <li key={item.label}>
                <button className={`nav-button ${item.active ? 'is-active' : ''}`} type="button">
                  {item.icon}
                  <span className="nav-label">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="projects-section">
          <div className="projects-header">
            <span className="projects-title">My Projects</span>
            <button className="add-project" type="button" aria-label="Add project">
              +
            </button>
          </div>
          <ul className="project-list">
            {projects.map(project => (
              <li key={project.name}>
                <button className={`project-button ${project.active ? 'is-active' : ''}`} type="button">
                  <span className={`status-dot ${project.status}`} aria-hidden="true" />
                  <span>{project.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="thoughts-card">
          <div className="bulb-icon" aria-hidden="true" />
          <div className="thoughts-content">
            <div className="card-title">Thoughts Time</div>
            <p>{primaryThought}</p>
          </div>
          <button className="ghost-button" type="button">
            Write a message
          </button>
        </div>
      </aside>

      <main className="content">
        <div className="content-inner">
          <h1>Eco Project Tracker</h1>
          <p>Your workspace area goes here.</p>
          <p className="status">Backend Status: {backendStatus}</p>

          <div className="admin-toggle-row">
            <button className="ghost-button" type="button" onClick={() => setShowAdminPanel(!showAdminPanel)}>
              {showAdminPanel ? 'Hide superadmin controls' : 'Superadmin: update thoughts'}
            </button>
          </div>

          {showAdminPanel && (
            <div className="thoughts-admin">
              <div className="admin-header">
                <div>
                  <h2>Thoughts control</h2>
                  <p className="muted">Only superadmins can update the list.</p>
                </div>
              </div>

              <label className="input-label">
                Superadmin token
                <input
                  className="text-input"
                  type="password"
                  placeholder="Paste JWT token"
                  value={authToken}
                  onChange={e => setAuthToken(e.target.value)}
                />
              </label>

              <label className="input-label">
                Thoughts (one per line)
                <textarea
                  className="text-area"
                  rows={10}
                  value={thoughtInput}
                  onChange={e => setThoughtInput(e.target.value)}
                />
              </label>

              <div className="admin-actions">
                <button className="primary-button" type="button" onClick={handleUpdateThoughts} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Update thoughts'}
                </button>
                {message && <span className="helper-text">{message}</span>}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
