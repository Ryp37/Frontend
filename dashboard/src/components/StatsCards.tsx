import { useState, useEffect, useRef } from 'react'
import { usePolling } from '../hooks/usePolling'
import { getStats } from '../api/client'
import type { Stats } from '../api/types'

/* ─── single stat card ────────────────────────────────────────────────── */

interface StatCardProps {
  label:       string
  value:       number
  color:       string   // css colour value
  bgColor:     string
  borderColor: string
  glowColor:   string
  icon:        React.ReactNode
  description: string
}

function StatCard({
  label, value, color, bgColor, borderColor, glowColor, icon, description,
}: StatCardProps) {
  const prevRef           = useRef(value)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 600)
      return () => clearTimeout(t)
    }
  }, [value])

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3 shadow-card transition-all duration-300"
      style={{
        background:   flash ? bgColor : '#0d1520',
        borderColor:  flash ? borderColor : '#1a2d42',
        boxShadow:    flash
          ? `0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3), 0 0 20px ${glowColor}`
          : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] shrink-0"
            style={{ background: bgColor, border: `1px solid ${borderColor}` }}
          >
            {icon}
          </span>
          <span className="text-[12px] font-semibold text-ink-secondary uppercase tracking-widest">
            {label}
          </span>
        </div>
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${glowColor}` }}
        />
      </div>

      <div>
        <div
          className="font-mono text-[32px] font-bold leading-none tracking-tight"
          style={{ color }}
        >
          {value.toLocaleString()}
        </div>
        <div className="text-[11px] text-ink-muted mt-[5px]">{description}</div>
      </div>
    </div>
  )
}

/* ─── total card ──────────────────────────────────────────────────────── */

function TotalCard({ stats }: { stats: Stats }) {
  const total = stats.GREEN + stats.YELLOW + stats.RED

  return (
    <div className="rounded-xl bg-surface-card border border-line p-5 flex flex-col gap-3 shadow-card">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-blue-950/40 border border-blue-900/50 flex items-center justify-center text-[15px] text-blue-400 shrink-0">
          ∑
        </span>
        <span className="text-[12px] font-semibold text-ink-secondary uppercase tracking-widest">
          Total Calls
        </span>
      </div>

      <div>
        <div className="font-mono text-[32px] font-bold leading-none tracking-tight text-blue-400">
          {total.toLocaleString()}
        </div>
        <div className="text-[11px] text-ink-muted mt-[5px]">
          all scored since last Redis flush
        </div>

        {total > 0 && (
          <div className="mt-3">
            <div className="flex h-1 rounded-sm overflow-hidden gap-px">
              <div
                style={{
                  width: `${(stats.GREEN  / total) * 100}%`,
                  background: '#22c55e',
                  transition: 'width 0.4s ease',
                }}
              />
              <div
                style={{
                  width: `${(stats.YELLOW / total) * 100}%`,
                  background: '#f59e0b',
                  transition: 'width 0.4s ease',
                }}
              />
              <div
                style={{
                  width: `${(stats.RED / total) * 100}%`,
                  background: '#ef4444',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <div className="flex gap-3 mt-[6px] flex-wrap">
              <span className="text-[10px] text-green-400">
                {Math.round((stats.GREEN  / total) * 100)}% clean
              </span>
              <span className="text-[10px] text-amber-400">
                {Math.round((stats.YELLOW / total) * 100)}% monitored
              </span>
              <span className="text-[10px] text-red-400">
                {Math.round((stats.RED    / total) * 100)}% blocked
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── public component ────────────────────────────────────────────────── */

interface StatsCardsProps {
  /** Pass live stats from a parent hook; otherwise fetches independently. */
  stats?: Stats
}

export function StatsCards({ stats: propStats }: StatsCardsProps = {}) {
  const [ownStats, setOwnStats] = useState<Stats>({ GREEN: 0, YELLOW: 0, RED: 0 })
  const [error, setError]       = useState(false)

  usePolling(() => {
    if (propStats !== undefined) return
    getStats()
      .then(s => { setOwnStats(s); setError(false) })
      .catch(() => setError(true))
  }, 5_000)

  const stats = propStats ?? ownStats

  return (
    <div>
      {error && !propStats && (
        <div className="error-banner mb-3">
          Unable to reach API — check that the backend is running on :8080
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="Clean Calls"
          value={stats.GREEN}
          color="#22c55e"
          bgColor="rgba(34,197,94,0.08)"
          borderColor="rgba(34,197,94,0.25)"
          glowColor="rgba(34,197,94,0.4)"
          icon={<span className="text-green-400 font-bold">✓</span>}
          description="GREEN · passed without restriction"
        />
        <StatCard
          label="Monitored"
          value={stats.YELLOW}
          color="#f59e0b"
          bgColor="rgba(245,158,11,0.08)"
          borderColor="rgba(245,158,11,0.25)"
          glowColor="rgba(245,158,11,0.4)"
          icon={<span className="text-amber-400">⚠</span>}
          description="YELLOW · greylisted, under watch"
        />
        <StatCard
          label="Blocked"
          value={stats.RED}
          color="#ef4444"
          bgColor="rgba(239,68,68,0.08)"
          borderColor="rgba(239,68,68,0.25)"
          glowColor="rgba(239,68,68,0.4)"
          icon={<span className="text-red-400 font-bold">✕</span>}
          description="RED · CAPTCHA triggered / declined"
        />
        <TotalCard stats={stats} />
      </div>
    </div>
  )
}
