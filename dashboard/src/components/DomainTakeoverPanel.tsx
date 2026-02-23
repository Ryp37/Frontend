import { useState } from 'react'
import { scanDomains } from '../api/client'
import type { DomainResult } from '../api/types'

const PLACEHOLDER = `sub.example.com
blog.example.com
status.example.com`

export function DomainTakeoverPanel() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<DomainResult[]>([])
  const [summary, setSummary] = useState<{ scanned: number; vulnerable: number } | null>(null)

  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    const domains = input
      .split('\n')
      .map(d => d.trim())
      .filter(Boolean)
    if (domains.length === 0) return
    if (domains.length > 50) {
      setError('Maximum 50 domains per scan')
      return
    }
    setLoading(true)
    setError('')
    setResults([])
    setSummary(null)
    try {
      const resp = await scanDomains(domains)
      setResults(resp.results)
      setSummary({ scanned: resp.scanned, vulnerable: resp.vulnerable })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setLoading(false)
    }
  }

  const vulnCount = results.filter(r => r.vulnerable).length

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="section-header">
        <span className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          Domain Takeover
        </span>
        {summary !== null && (
          <span
            className="section-count"
            style={
              summary.vulnerable > 0
                ? { color: 'var(--red)', borderColor: 'var(--red-border)', background: 'var(--red-bg)' }
                : { color: 'var(--green)', borderColor: 'var(--green-border)', background: 'var(--green-bg)' }
            }
          >
            {summary.vulnerable > 0 ? `${summary.vulnerable} vulnerable` : `${summary.scanned} clean`}
          </span>
        )}
      </div>

      {/* Input form */}
      <form
        onSubmit={handleScan}
        style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}
      >
        <div className="field">
          <label>Domains to scan (one per line, max 50)</label>
          <textarea
            className="input mono"
            rows={4}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={PLACEHOLDER}
            disabled={loading}
            style={{ resize: 'vertical', minHeight: '80px', lineHeight: 1.6 }}
          />
        </div>
        {error && <div className="error-banner">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={loading || input.trim() === ''}>
          {loading ? <span className="spinner" /> : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          )}
          {loading ? 'Scanning…' : 'Scan Domains'}
        </button>
      </form>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {results.length === 0 && !loading ? (
          <div className="empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <div>Enter domains above and click Scan.<br />Checks for dangling CNAME &amp; unclaimed service fingerprints.</div>
          </div>
        ) : (
          <div>
            {/* Summary bar */}
            {summary !== null && (
              <div style={{
                padding: '8px 14px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                gap: '16px',
                fontSize: '11px',
                color: 'var(--text-secondary)',
              }}>
                <span>Scanned: <strong style={{ color: 'var(--text-primary)' }}>{summary.scanned}</strong></span>
                <span style={{ color: vulnCount > 0 ? 'var(--red)' : 'var(--green)' }}>
                  Vulnerable: <strong>{summary.vulnerable}</strong>
                </span>
                <span style={{ color: 'var(--green)' }}>
                  Clean: <strong>{summary.scanned - summary.vulnerable}</strong>
                </span>
              </div>
            )}

            {/* Results list */}
            {results.map((r, i) => (
              <div
                key={`${r.domain}-${i}`}
                className={i === 0 ? 'fade-in' : undefined}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: `3px solid ${r.error ? 'var(--text-muted)' : r.vulnerable ? 'var(--red)' : 'var(--green)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  transition: 'background var(--transition)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-row-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Row 1: domain + badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    {r.domain}
                  </span>
                  <VulnBadge result={r} />
                </div>

                {/* Row 2: CNAME if present */}
                {r.cname && (
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', gap: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>CNAME</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>→ {r.cname}</span>
                  </div>
                )}

                {/* Row 3: reason / service */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {r.service && (
                    <span style={{
                      background: 'var(--bg-card-alt)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '3px',
                      padding: '0 5px',
                      color: 'var(--text-secondary)',
                      flexShrink: 0,
                    }}>
                      {r.service}
                    </span>
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {r.error ? r.error : r.reason}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function VulnBadge({ result }: { result: DomainResult }) {
  if (result.error) {
    return (
      <span style={{
        fontSize: '10px',
        fontWeight: 600,
        padding: '2px 7px',
        borderRadius: '3px',
        background: 'var(--bg-card-alt)',
        border: '1px solid var(--border)',
        color: 'var(--text-muted)',
        flexShrink: 0,
      }}>
        ERROR
      </span>
    )
  }
  if (result.vulnerable) {
    return (
      <span style={{
        fontSize: '10px',
        fontWeight: 600,
        padding: '2px 7px',
        borderRadius: '3px',
        background: 'var(--red-bg)',
        border: '1px solid var(--red-border)',
        color: 'var(--red)',
        flexShrink: 0,
      }}>
        VULNERABLE
      </span>
    )
  }
  return (
    <span style={{
      fontSize: '10px',
      fontWeight: 600,
      padding: '2px 7px',
      borderRadius: '3px',
      background: 'var(--green-bg)',
      border: '1px solid var(--green-border)',
      color: 'var(--green)',
      flexShrink: 0,
    }}>
      SAFE
    </span>
  )
}
