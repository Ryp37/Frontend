import { useState } from 'react'
import { scanDomain } from '../api/client'
import type { ScanFinding, ScanResult, ScanSeverity } from '../api/types'

const severityConfig: Record<ScanSeverity, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: 'var(--red)',    bg: 'var(--red-bg)',    border: 'var(--red-border)',    label: 'CRITICAL' },
  high:     { color: 'var(--yellow)', bg: 'var(--yellow-bg)', border: 'var(--yellow-border)', label: 'HIGH'     },
  medium:   { color: 'var(--blue)',   bg: 'var(--blue-bg)',   border: 'var(--blue-border)',   label: 'MEDIUM'   },
}

function SeverityBadge({ severity }: { severity: ScanSeverity }) {
  const c = severityConfig[severity]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '2px 8px',
      fontSize: '10px',
      fontWeight: 600,
      letterSpacing: '0.06em',
      color: c.color,
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: '4px',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: c.color, flexShrink: 0 }} />
      {c.label}
    </span>
  )
}

function formatBytes(n: number): string {
  if (n < 0) return '—'
  if (n === 0) return '0 B'
  if (n < 1024) return `${n} B`
  return `${(n / 1024).toFixed(1)} KB`
}

export function DocScannerPanel() {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [filter, setFilter] = useState<ScanSeverity | 'all'>('all')

  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    const target = domain.trim()
    if (!target) return
    setLoading(true)
    setError('')
    setResult(null)
    setFilter('all')
    try {
      const res = await scanDomain(target)
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setLoading(false)
    }
  }

  const displayed: ScanFinding[] = result
    ? (filter === 'all' ? result.findings : result.findings.filter(f => f.severity === filter))
    : []

  const counts = result
    ? {
        critical: result.findings.filter(f => f.severity === 'critical').length,
        high:     result.findings.filter(f => f.severity === 'high').length,
        medium:   result.findings.filter(f => f.severity === 'medium').length,
      }
    : null

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="section-header">
        <span className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
            <path d="M11 8v6M8 11h6"/>
          </svg>
          Exposed Document Scanner
        </span>
        {result && (
          <span className="section-count">{result.found} found / {result.scanned} probed</span>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleScan} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Target Domain</label>
            <input
              className="input mono"
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="example.com"
              disabled={loading}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading || !domain.trim()}>
            {loading ? <span className="spinner" /> : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            )}
            {loading ? 'Scanning…' : 'Scan'}
          </button>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
          Only scan domains you own or have explicit authorisation to test.
        </p>
        {error && <div className="error-banner">{error}</div>}
      </form>

      {/* Summary chips + filter */}
      {result && counts && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>Filter:</span>
          {(['all', 'critical', 'high', 'medium'] as const).map(sev => {
            const active = filter === sev
            const count = sev === 'all' ? result.found : counts[sev]
            const c = sev === 'all'
              ? { color: 'var(--text-secondary)', bg: active ? 'var(--bg-card-alt)' : 'transparent', border: 'var(--border-light)' }
              : { ...severityConfig[sev], bg: active ? severityConfig[sev].bg : 'transparent' }
            return (
              <button
                key={sev}
                onClick={() => setFilter(sev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  color: sev === 'all' ? 'var(--text-secondary)' : severityConfig[sev].color,
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                  borderRadius: '4px',
                  transition: 'all var(--transition)',
                }}
              >
                {sev === 'all' ? 'All' : sev.toUpperCase()} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Results table */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {!result && !loading && (
          <div className="empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <div>Enter a domain and press Scan.<br />The scanner probes {/* count */}common sensitive paths.</div>
          </div>
        )}

        {result && displayed.length === 0 && (
          <div className="empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <div>
              {filter === 'all'
                ? `No exposed files found across ${result.scanned} paths checked.`
                : `No ${filter.toUpperCase()} findings. Try a different filter.`}
            </div>
          </div>
        )}

        {displayed.length > 0 && (
          <div className="table-wrap" style={{ maxHeight: '400px' }}>
            <table>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Path</th>
                  <th>Description</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((f, i) => (
                  <tr key={i} className="fade-in">
                    <td><SeverityBadge severity={f.severity} /></td>
                    <td>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="td-mono"
                        style={{ color: severityConfig[f.severity].color, textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                      >
                        {f.path}
                      </a>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '280px' }}>
                      {f.description}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatBytes(f.content_length)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
