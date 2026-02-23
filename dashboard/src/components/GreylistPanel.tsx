import { useState, useEffect, useCallback, useRef } from 'react'
import { Clock, X, AlertCircle } from 'lucide-react'
import { usePolling } from '../hooks/usePolling'
import { getGreylist, deleteGreylistEntry } from '../api/client'
import type { GreylistEntry } from '../api/types'
import { formatTime, formatDuration } from '../lib/utils'

const MAX_TTL = 3600

interface LiveEntry extends GreylistEntry {
  liveTTL: number
}

function ttlColor(ttl: number): string {
  const pct = ttl / MAX_TTL
  if (pct > 0.5) return '#f59e0b'
  if (pct > 0.2) return '#f97316'
  return '#ef4444'
}

export function GreylistPanel() {
  const [entries,    setEntries]    = useState<LiveEntry[]>([])
  const [loadError,  setLoadError]  = useState('')
  const [deletingID, setDeletingID] = useState<string | null>(null)
  const tickRef                     = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchList = useCallback(() => {
    getGreylist()
      .then(data => {
        setEntries((data ?? []).map(e => ({ ...e, liveTTL: e.ttl_remaining_seconds })))
        setLoadError('')
      })
      .catch(e => setLoadError(e.message))
  }, [])

  usePolling(fetchList, 15_000)

  /* live countdown */
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

  return (
    <div className="card flex flex-col h-full">
      {/* Header */}
      <div className="section-header">
        <span className="section-title">
          <Clock size={14} />
          Greylist
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-muted">auto-expires · 1h TTL</span>
          <span className="section-count">{entries.length} active</span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto min-h-0">
        {loadError && (
          <div className="error-banner m-3 flex items-center gap-2">
            <AlertCircle size={13} className="shrink-0" />
            {loadError}
          </div>
        )}

        {entries.length === 0 && !loadError ? (
          <div className="empty-state">
            <Clock size={32} />
            <div>
              Greylist is empty.
              <br />
              YELLOW-scored callers appear here automatically.
            </div>
          </div>
        ) : (
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                {['Caller ID', 'Added At', 'TTL Remaining', ''].map(h => (
                  <th
                    key={h}
                    className="px-4 py-[9px] text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wider border-b border-line bg-surface-card sticky top-0 z-10"
                    style={h === '' ? { width: 40 } : undefined}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const pct   = Math.min(100, (entry.liveTTL / MAX_TTL) * 100)
                const color = ttlColor(entry.liveTTL)

                return (
                  <tr
                    key={entry.caller_id}
                    className="border-b border-line last:border-b-0 hover:bg-surface-row transition-colors"
                  >
                    <td className="td-mono px-4 py-[9px]">{entry.caller_id}</td>
                    <td className="px-4 py-[9px] text-ink-muted text-[12px]">
                      {formatTime(entry.added_at)}
                    </td>
                    <td className="px-4 py-[9px]">
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
                    <td className="px-4 py-[9px]">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDelete(entry.caller_id)}
                        disabled={deletingID === entry.caller_id}
                        title="Remove from greylist"
                      >
                        {deletingID === entry.caller_id ? (
                          <span className="spinner" />
                        ) : (
                          <X size={11} />
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
