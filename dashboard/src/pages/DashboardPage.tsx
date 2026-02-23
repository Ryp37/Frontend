import { StatsCards }       from '../components/StatsCards'
import { CallTrendChart }   from '../components/charts/CallTrendChart'
import { StatusPieChart }   from '../components/charts/StatusPieChart'
import { useStatsHistory }  from '../hooks/useStatsHistory'

export function DashboardPage() {
  const { history, current, error } = useStatsHistory()

  return (
    <div className="page-container">
      {error && (
        <div className="error-banner">
          Unable to reach API — check that the backend is running on :8080
        </div>
      )}

      {/* ── Stats row ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="page-label">Call Traffic Overview</h2>
          <span className="text-[11px] text-ink-muted">Refreshes every 5s</span>
        </div>
        <StatsCards stats={current} />
      </section>

      {/* ── Charts row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Trend line chart */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-semibold text-ink">
              Call Rate
            </h3>
            <span className="text-[11px] text-ink-muted">calls per 5-second interval</span>
          </div>
          <CallTrendChart history={history} />
        </div>

        {/* Donut chart */}
        <div className="card p-5">
          <h3 className="text-[13px] font-semibold text-ink mb-1">
            Status Distribution
          </h3>
          <p className="text-[11px] text-ink-muted mb-3">current totals</p>
          <StatusPieChart stats={current} />
        </div>
      </div>

      {/* ── Redis key info ─────────────────────────────────────────────── */}
      <div className="card px-5 py-4 flex items-start gap-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[13px]"
          style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}
        >
          ⚡
        </div>
        <div>
          <p className="text-[12px] font-medium text-ink">
            Scoring counter:{' '}
            <code className="font-mono text-blue-400 text-[11px]">
              score:{'{caller_id}'}
            </code>
          </p>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Redis key · 24-hour TTL · atomic INCR on every scored call or SIP INVITE.
            Whitelist prefix matches short-circuit scoring and return their tier directly.
          </p>
        </div>
      </div>
    </div>
  )
}
