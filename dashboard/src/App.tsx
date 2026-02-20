import { Header } from './components/Header'
import { StatsCards } from './components/StatsCards'
import { CallCheckPanel } from './components/CallCheckPanel'
import { WhitelistPanel } from './components/WhitelistPanel'
import { GreylistPanel } from './components/GreylistPanel'

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
