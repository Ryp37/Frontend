import { useState, useRef, useEffect } from 'react'
import { checkCall } from '../api/client'
import type { CallLogEntry } from '../api/types'
import { StatusBadge } from './StatusBadge'

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

export function CallCheckPanel() {
  const [callerID, setCallerID] = useState('+46701234567')
  const [destination, setDestination] = useState('+46891234567')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [log, setLog] = useState<CallLogEntry[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current && log.length > 0) {
      logRef.current.scrollTop = 0
    }
  }, [log.length])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!callerID.trim() || !destination.trim()) return
    setLoading(true)
    setError('')
    try {
      const result = await checkCall(callerID.trim(), destination.trim())
      const entry: CallLogEntry = {
        ...result,
        id: crypto.randomUUID(),
        caller_id: callerID.trim(),
        destination: destination.trim(),
      }
      setLog(prev => [entry, ...prev].slice(0, 60))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const statusColors: Record<string, string> = {
    GREEN: 'var(--green)',
    YELLOW: 'var(--yellow)',
    RED: 'var(--red)',
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="section-header">
        <span className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.6 4.87 2 2 0 0 1 3.58 2.69h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.1a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          Call Checker
        </span>
        <span className="section-count">{log.length} entries</span>
      </div>

      <form onSubmit={handleSubmit} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="field">
            <label>Caller ID</label>
            <input
              className="input mono"
              type="text"
              value={callerID}
              onChange={e => setCallerID(e.target.value)}
              placeholder="+46701234567"
              disabled={loading}
            />
          </div>
          <div className="field">
            <label>Destination</label>
            <input
              className="input mono"
              type="text"
              value={destination}
              onChange={e => setDestination(e.target.value)}
              placeholder="+46891234567"
              disabled={loading}
            />
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <span className="spinner" /> : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          )}
          {loading ? 'Scoring…' : 'Check Call'}
        </button>
      </form>

      <div
        ref={logRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
        }}
      >
        {log.length === 0 ? (
          <div className="empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.6 4.87 2 2 0 0 1 3.58 2.69h3"/>
            </svg>
            <div>No calls scored yet.<br/>Submit a check above to populate the log.</div>
          </div>
        ) : (
          <div>
            {log.map((entry, i) => (
              <div
                key={entry.id}
                className={i === 0 ? 'fade-in' : undefined}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: `3px solid ${statusColors[entry.status] ?? 'var(--border)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                  transition: 'background var(--transition)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-row-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-primary)', flexWrap: 'wrap' }}>
                    <span>{entry.caller_id}</span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <span>{entry.destination}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <StatusBadge status={entry.status} size="sm" />
                    {entry.blocked && (
                      <span style={{ fontSize: '10px', color: 'var(--red)', fontWeight: 600 }}>BLOCKED</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.reason}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      score:{entry.score}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
