import { CallCheckPanel } from '../components/CallCheckPanel'

export function CallsPage() {
  return (
    <div className="page-container h-full">
      <div className="flex items-center justify-between">
        <h2 className="page-label">Manual Call Scoring</h2>
        <span className="text-[11px] text-ink-muted">Last 60 entries retained in session</span>
      </div>

      <div className="flex-1 min-h-0" style={{ height: 'calc(100vh - 160px)' }}>
        <CallCheckPanel />
      </div>
    </div>
  )
}
