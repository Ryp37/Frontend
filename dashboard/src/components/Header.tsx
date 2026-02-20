import { useEffect, useState } from 'react'
import { getHealth } from '../api/client'

export function Header() {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    const check = () =>
      getHealth()
        .then(() => setOnline(true))
        .catch(() => setOnline(false))

    check()
    const id = setInterval(check, 15_000)
    return () => clearInterval(id)
  }, [])

  return (
    <header style={{
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
      height: '56px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '28px',
          height: '28px',
          background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
          borderRadius: '7px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          flexShrink: 0,
        }}>
          🛡
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            SIP Guard
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Fraud Detection Console
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <a
          href="http://localhost:8080/swagger/index.html"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'color var(--transition)',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--blue)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Swagger UI
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          {online === null ? (
            <span className="spinner" />
          ) : (
            <span className="pulse-dot" style={{
              background: online ? 'var(--green)' : 'var(--red)',
              boxShadow: online ? '0 0 6px var(--green-glow)' : '0 0 6px var(--red-glow)',
            }} />
          )}
          <span style={{
            fontSize: '12px',
            color: online === null
              ? 'var(--text-muted)'
              : online ? 'var(--green)' : 'var(--red)',
            fontWeight: 500,
          }}>
            {online === null ? 'Connecting' : online ? 'API Online' : 'API Offline'}
          </span>
        </div>
      </div>
    </header>
  )
}
