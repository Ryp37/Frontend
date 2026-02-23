import { useState, useRef, useEffect } from 'react'
import { Phone, ChevronRight, AlertCircle } from 'lucide-react'
import { checkCall } from '../api/client'
import type { CallLogEntry } from '../api/types'
import { StatusBadge } from './StatusBadge'
import { formatTime } from '../lib/utils'

const STATUS_LEFT: Record<string, string> = {
  GREEN:  '#22c55e',
  YELLOW: '#f59e0b',
  RED:    '#ef4444',
}

export function CallCheckPanel() {
  const [callerID,    setCallerID]    = useState('+46701234567')
  const [destination, setDestination] = useState('+46891234567')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [log,         setLog]         = useState<CallLogEntry[]>([])
  const logRef                        = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current && log.length > 0) logRef.current.scrollTop = 0
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
        id:          crypto.randomUUID(),
        caller_id:   callerID.trim(),
        destination: destination.trim(),
      }
      setLog(prev => [entry, ...prev].slice(0, 60))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card flex flex-col h-full">
      {/* Header */}
      <div className="section-header">
        <span className="section-title">
          <Phone size={14} />
          Call Checker
        </span>
        <span className="section-count">{log.length} entries</span>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-b border-line flex flex-col gap-2.5"
      >
        <div className="grid grid-cols-2 gap-2.5">
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

        {error && (
          <div className="error-banner flex items-center gap-2">
            <AlertCircle size={13} className="shrink-0" />
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? (
            <span className="spinner" />
          ) : (
            <ChevronRight size={14} />
          )}
          {loading ? 'Scoring…' : 'Check Call'}
        </button>
      </form>

      {/* Log */}
      <div ref={logRef} className="flex-1 overflow-y-auto min-h-0">
        {log.length === 0 ? (
          <div className="empty-state">
            <Phone size={32} />
            <div>
              No calls scored yet.
              <br />
              Submit a check above to populate the log.
            </div>
          </div>
        ) : (
          log.map((entry, i) => (
            <div
              key={entry.id}
              className={`
                px-4 py-2.5 border-b border-line
                hover:bg-surface-row transition-colors duration-100
                ${i === 0 ? 'fade-in' : ''}
              `}
              style={{
                borderLeft: `3px solid ${STATUS_LEFT[entry.status] ?? '#1a2d42'}`,
              }}
            >
              {/* Row 1: numbers + badge */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-mono text-[12px] text-ink flex-wrap">
                  <span>{entry.caller_id}</span>
                  <span className="text-ink-muted">→</span>
                  <span>{entry.destination}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={entry.status} size="sm" />
                  {entry.blocked && (
                    <span className="text-[10px] text-red-400 font-bold tracking-wide">
                      BLOCKED
                    </span>
                  )}
                </div>
              </div>

              {/* Row 2: reason + score + time */}
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-[11px] text-ink-muted truncate flex-1">
                  {entry.reason}
                </span>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="font-mono text-[11px] text-ink-secondary">
                    score:{entry.score}
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
