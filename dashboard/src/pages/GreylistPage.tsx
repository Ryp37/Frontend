import { GreylistPanel } from '../components/GreylistPanel'

export function GreylistPage() {
  return (
    <div className="page-container h-full">
      <div className="flex items-center justify-between">
        <h2 className="page-label">Active Greylist</h2>
        <span className="text-[11px] text-ink-muted">
          Auto-populated on YELLOW scores · polled every 15s
        </span>
      </div>

      <div className="flex-1 min-h-0" style={{ height: 'calc(100vh - 160px)' }}>
        <GreylistPanel />
      </div>
    </div>
  )
}
