import { useState, useEffect, useCallback, useRef } from 'react'
import { usePolling } from '../hooks/usePolling'
import { getGreylist, deleteGreylistEntry } from '../api/client'
import type { GreylistEntry } from '../api/types'

const MAX_TTL = 3600

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

interface LiveEntry extends GreylistEntry {
  liveTTL: number
}

export function GreylistPanel() {
  const [entries, setEntries] = useState<LiveEntry[]>([])
  const [loadError, setLoadError] = useState('')
  const [deletingID, setDeletingID] = useState<string | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchList = useCallback(() => {
    getGreylist()
      .then(data => {
        setEntries((data ?? []).map(e => ({ ...e, liveTTL: e.ttl_remaining_seconds })))
        setLoadError('')
      })
      .catch(e => setLoadError(e.message))
  }, [])

  usePolling(fetchList, 15_000)

  useEffect(() => {
    tickRef.current = setInterval(() => {
      setEntries(prev =>
        prev
          .map(e => ({ ...e, liveTTL: Math.max(0, e.liveTTL - 1) }))
          .filter(e => e.liveTTL > 0)
      )
    }, 1_000)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [])

  async function handleDelete(callerID: string) {
    setDeletingID(callerID)
    try {
      await deleteGreylistEntry(callerID)
      setEntries(prev => prev.filter(e => e.caller_id !== callerID))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingID(null)
    }
  }

  const ttlColor = (ttl: number) => {
    const pct = ttl / MAX_TTL
    if (pct > 0.5) return 'var(--yellow)'
    if (pct > 0.2) return '#f97316'
    return 'var(--red)'
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="section-header">
        <span className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Greylist
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>auto-expires · 1h TTL</span>
          <span className="section-count">{entries.length} active</span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loadError && <div className="error-banner" style={{ margin: '10px' }}>{loadError}</div>}
        {entries.length === 0 && !loadError ? (
          <div className="empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <div>Greylist is empty.<br/>YELLOW-scored callers appear here automatically.</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Caller ID</th>
                <th>Added At</th>
                <th>TTL Remaining</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const pct = Math.min(100, (entry.liveTTL / MAX_TTL) * 100)
                const color = ttlColor(entry.liveTTL)
                return (
                  <tr key={entry.caller_id}>
                    <td className="td-mono">{entry.caller_id}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {formatDate(entry.added_at)}
                    </td>
                    <td>
                      <div className="ttl-bar-wrap">
                        <span className="ttl-text" style={{ color }}>
                          {formatDuration(entry.liveTTL)}
                        </span>
                        <div className="ttl-bar-bg">
                          <div
                            className="ttl-bar-fill"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDelete(entry.caller_id)}
                        disabled={deletingID === entry.caller_id}
                        title="Remove from greylist"
                      >
                        {deletingID === entry.caller_id ? <span className="spinner" /> : (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
