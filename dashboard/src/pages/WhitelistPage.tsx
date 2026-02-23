import { WhitelistPanel } from '../components/WhitelistPanel'

export function WhitelistPage() {
  return (
    <div className="page-container h-full">
      <div className="flex items-center justify-between">
        <h2 className="page-label">Prefix Rules</h2>
        <span className="text-[11px] text-ink-muted">Polled every 30s · backed by Redis Hash</span>
      </div>

      <div className="flex-1 min-h-0" style={{ height: 'calc(100vh - 160px)' }}>
        <WhitelistPanel />
      </div>
    </div>
  )
}
