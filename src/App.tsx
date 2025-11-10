import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [backendStatus, setBackendStatus] = useState<string>('Checking...')

  useEffect(() => {
    fetch('/api/test')
      .then(res => res.json())
      .then(data => setBackendStatus(data.message))
      .catch(() => setBackendStatus('Backend not connected'))
  }, [])

  return (
    <div className="App">
      <header className="App-header">
        <h1>Eco Project Tracker</h1>
        <p>Frontend Application</p>
        <p className="status">Backend Status: {backendStatus}</p>
      </header>
    </div>
  )
}

export default App



