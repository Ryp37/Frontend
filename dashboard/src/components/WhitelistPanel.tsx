import { useState, useCallback } from 'react'
import { usePolling } from '../hooks/usePolling'
import { getWhitelist, addWhitelistEntry, deleteWhitelistEntry } from '../api/client'
import type { WhitelistEntry } from '../api/types'
import { StatusBadge } from './StatusBadge'

const TIERS = ['GREEN', 'YELLOW', 'RED', 'TELCO', 'CLOUD'] as const

const TIER_DESCRIPTIONS: Record<string, string> = {
  GREEN:  '→ GREEN',
  YELLOW: '→ YELLOW',
  RED:    '→ RED',
  TELCO:  '→ GREEN (carrier)',
  CLOUD:  '→ RED (VPS/cloud)',
}

export function WhitelistPanel() {
  const [entries, setEntries] = useState<WhitelistEntry[]>([])
  const [loadError, setLoadError] = useState('')
  const [prefix, setPrefix] = useState('')
  const [label, setLabel] = useState('')
  const [tier, setTier] = useState('GREEN')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [deletingPrefix, setDeletingPrefix] = useState<string | null>(null)

  const fetchList = useCallback(() => {
    getWhitelist()
      .then(data => { setEntries(data ?? []); setLoadError('') })
      .catch(e => setLoadError(e.message))
  }, [])

  usePolling(fetchList, 30_000)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!prefix.trim() || !label.trim()) return
    setAdding(true)
    setAddError('')
    try {
      await addWhitelistEntry({ prefix: prefix.trim(), label: label.trim(), tier })
      setPrefix('')
      setLabel('')
      setTier('GREEN')
      fetchList()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add entry')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(p: string) {
    setDeletingPrefix(p)
    try {
      await deleteWhitelistEntry(p)
      fetchList()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingPrefix(null)
    }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="section-header">
        <span className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Whitelist
        </span>
        <span className="section-count">{entries.length} prefixes</span>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div className="field">
              <label>Prefix</label>
              <input
                className="input mono"
                type="text"
                value={prefix}
                onChange={e => setPrefix(e.target.value)}
                placeholder="+467"
                disabled={adding}
              />
            </div>
            <div className="field">
              <label>Label</label>
              <input
                className="input"
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Swedish mobile"
                disabled={adding}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'flex-end' }}>
            <div className="field">
              <label>Tier</label>
              <select className="select" value={tier} onChange={e => setTier(e.target.value)} disabled={adding}>
                {TIERS.map(t => (
                  <option key={t} value={t}>{t} {TIER_DESCRIPTIONS[t]}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={adding || !prefix.trim() || !label.trim()}>
              {adding ? <span className="spinner" /> : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              )}
              Add
            </button>
          </div>
          {addError && <div className="error-banner">{addError}</div>}
        </form>
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loadError && <div className="error-banner" style={{ margin: '10px' }}>{loadError}</div>}
        {entries.length === 0 && !loadError ? (
          <div className="empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <div>Whitelist is empty.<br/>Add a prefix above.</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Prefix</th>
                <th>Label</th>
                <th>Tier</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.prefix}>
                  <td className="td-mono">{entry.prefix}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{entry.label}</td>
                  <td><StatusBadge status={entry.tier} size="sm" /></td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(entry.prefix)}
                      disabled={deletingPrefix === entry.prefix}
                    >
                      {deletingPrefix === entry.prefix ? <span className="spinner" /> : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                        </svg>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
