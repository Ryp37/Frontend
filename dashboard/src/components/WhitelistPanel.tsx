import { useState, useCallback } from 'react'
import { ShieldCheck, Plus, Trash2, AlertCircle } from 'lucide-react'
import { usePolling } from '../hooks/usePolling'
import { getWhitelist, addWhitelistEntry, deleteWhitelistEntry } from '../api/client'
import type { WhitelistEntry } from '../api/types'
import { StatusBadge } from './StatusBadge'

const TIERS = ['GREEN', 'YELLOW', 'RED', 'TELCO', 'CLOUD'] as const

const TIER_HINT: Record<string, string> = {
  GREEN:  '→ GREEN (standard pass)',
  YELLOW: '→ YELLOW (warn + monitor)',
  RED:    '→ RED (block)',
  TELCO:  '→ GREEN (carrier — always allowed)',
  CLOUD:  '→ RED (VPS/cloud — always blocked)',
}

export function WhitelistPanel() {
  const [entries,        setEntries]        = useState<WhitelistEntry[]>([])
  const [loadError,      setLoadError]      = useState('')
  const [prefix,         setPrefix]         = useState('')
  const [label,          setLabel]          = useState('')
  const [tier,           setTier]           = useState('GREEN')
  const [adding,         setAdding]         = useState(false)
  const [addError,       setAddError]       = useState('')
  const [deletingPrefix, setDeletingPrefix] = useState<string | null>(null)

  const fetchList = useCallback(() => {
    getWhitelist()
      .then(data => { setEntries(data ?? []); setLoadError('') })
      .catch(e   => setLoadError(e.message))
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
    <div className="card flex flex-col h-full">
      {/* Header */}
      <div className="section-header">
        <span className="section-title">
          <ShieldCheck size={14} />
          Whitelist
        </span>
        <span className="section-count">{entries.length} prefixes</span>
      </div>

      {/* Add form */}
      <div className="p-4 border-b border-line">
        <form onSubmit={handleAdd} className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
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

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="field">
              <label>Tier — {TIER_HINT[tier]}</label>
              <select
                className="select"
                value={tier}
                onChange={e => setTier(e.target.value)}
                disabled={adding}
              >
                {TIERS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={adding || !prefix.trim() || !label.trim()}
            >
              {adding ? <span className="spinner" /> : <Plus size={13} />}
              Add
            </button>
          </div>

          {addError && (
            <div className="error-banner flex items-center gap-2">
              <AlertCircle size={13} className="shrink-0" />
              {addError}
            </div>
          )}
        </form>
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
            <ShieldCheck size={32} />
            <div>
              Whitelist is empty.
              <br />
              Add a prefix above.
            </div>
          </div>
        ) : (
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                {['Prefix', 'Label', 'Tier', ''].map(h => (
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
              {entries.map(entry => (
                <tr
                  key={entry.prefix}
                  className="border-b border-line last:border-b-0 hover:bg-surface-row transition-colors"
                >
                  <td className="td-mono px-4 py-[9px]">{entry.prefix}</td>
                  <td className="px-4 py-[9px] text-ink-secondary text-[12px]">
                    {entry.label}
                  </td>
                  <td className="px-4 py-[9px]">
                    <StatusBadge status={entry.tier} size="sm" />
                  </td>
                  <td className="px-4 py-[9px]">
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(entry.prefix)}
                      disabled={deletingPrefix === entry.prefix}
                      title="Remove from whitelist"
                    >
                      {deletingPrefix === entry.prefix ? (
                        <span className="spinner" />
                      ) : (
                        <Trash2 size={11} />
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
