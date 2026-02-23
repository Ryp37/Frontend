import { Header } from './components/Header'
import { StatsCards } from './components/StatsCards'
import { CallCheckPanel } from './components/CallCheckPanel'
import { WhitelistPanel } from './components/WhitelistPanel'
import { GreylistPanel } from './components/GreylistPanel'
import { DomainTakeoverPanel } from './components/DomainTakeoverPanel'

export function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <main style={{
        flex: 1,
        padding: '20px 24px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '1600px',
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}>
        <div>
          <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Call Traffic Overview
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Refreshes every 5s
            </span>
          </div>
          <StatsCards />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
          gap: '16px',
          flex: 1,
          minHeight: '520px',
        }}>
          <CallCheckPanel />
          <WhitelistPanel />
          <GreylistPanel />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
          gap: '16px',
          minHeight: '480px',
        }}>
          <DomainTakeoverPanel />
          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 28px', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>About Domain Takeover Detection</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              A <strong style={{ color: 'var(--text-primary)' }}>subdomain takeover</strong> occurs when a DNS record (usually a CNAME) points to an external service that no longer has an active account or project configured for that hostname.
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              An attacker can register the abandoned resource on the target platform and serve arbitrary content — phishing pages, malware, or cookie-stealing scripts — under your trusted domain.
            </p>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                What this scanner checks
              </span>
              {[
                'Dangling CNAME records that resolve to NXDOMAIN',
                'HTTP fingerprints of 20+ known vulnerable services',
                'Platforms: GitHub Pages, Heroku, Fastly, AWS S3, Azure, Netlify, Shopify, and more',
              ].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--green)', flexShrink: 0, marginTop: '1px' }}>›</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer style={{
        padding: '12px 24px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          SIP Guard · Go / Gin · Redis · UDP SIP Listener on :5060
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          API: <span style={{ fontFamily: 'var(--font-mono)' }}>localhost:8080</span>
        </span>
      </footer>
    </div>
  )
}
