import { useState, useEffect, useRef } from 'react'
import { usePolling } from '../hooks/usePolling'
import { getStats } from '../api/client'
import type { Stats } from '../api/types'

interface CardProps {
  label: string
  value: number
  color: string
  bg: string
  border: string
  glow: string
  icon: string
  description: string
}

function StatCard({ label, value, color, bg, border, glow, icon, description }: CardProps) {
  const prevRef = useRef(value)
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
    <div style={{
      background: flash ? bg : 'var(--bg-card)',
      border: `1px solid ${flash ? border : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '20px 22px',
      boxShadow: flash ? `var(--shadow-card), 0 0 20px ${glow}` : 'var(--shadow-card)',
      transition: 'all 0.4s ease',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            width: '30px',
            height: '30px',
            background: bg,
            border: `1px solid ${border}`,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
          }}>{icon}</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {label}
          </span>
        </div>
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 8px ${glow}`,
        }} />
      </div>

      <div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '32px',
          fontWeight: 700,
          color,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}>
          {value.toLocaleString()}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
          {description}
        </div>
      </div>
    </div>
  )
}

export function StatsCards() {
  const [stats, setStats] = useState<Stats>({ GREEN: 0, YELLOW: 0, RED: 0 })
  const [error, setError] = useState(false)

  usePolling(() => {
    getStats()
      .then(s => { setStats(s); setError(false) })
      .catch(() => setError(true))
  }, 5_000)

  const total = stats.GREEN + stats.YELLOW + stats.RED

  return (
    <div>
      {error && (
        <div className="error-banner" style={{ marginBottom: '12px' }}>
          Unable to reach API — check that the backend is running on :8080
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
      }}>
        <StatCard
          label="Clean Calls"
          value={stats.GREEN}
          color="var(--green)"
          bg="var(--green-bg)"
          border="var(--green-border)"
          glow="var(--green-glow)"
          icon="✓"
          description="GREEN · passed without restriction"
        />
        <StatCard
          label="Monitored"
          value={stats.YELLOW}
          color="var(--yellow)"
          bg="var(--yellow-bg)"
          border="var(--yellow-border)"
          glow="var(--yellow-glow)"
          icon="⚠"
          description="YELLOW · greylisted, under watch"
        />
        <StatCard
          label="Blocked"
          value={stats.RED}
          color="var(--red)"
          bg="var(--red-bg)"
          border="var(--red-border)"
          glow="var(--red-glow)"
          icon="✕"
          description="RED · CAPTCHA triggered / declined"
        />
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 22px',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '30px',
              height: '30px',
              background: 'var(--blue-bg)',
              border: '1px solid var(--blue-border)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
            }}>∑</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Total Calls
            </span>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: 700, color: 'var(--blue)', lineHeight: 1, letterSpacing: '-0.02em' }}>
              {total.toLocaleString()}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
              all scored since last Redis flush
            </div>
            {total > 0 && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ display: 'flex', height: '4px', borderRadius: '2px', overflow: 'hidden', gap: '1px' }}>
                  <div style={{ width: `${(stats.GREEN / total) * 100}%`, background: 'var(--green)', transition: 'width 0.4s ease' }} />
                  <div style={{ width: `${(stats.YELLOW / total) * 100}%`, background: 'var(--yellow)', transition: 'width 0.4s ease' }} />
                  <div style={{ width: `${(stats.RED / total) * 100}%`, background: 'var(--red)', transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', color: 'var(--green)' }}>{Math.round((stats.GREEN / total) * 100)}% clean</span>
                  <span style={{ fontSize: '10px', color: 'var(--yellow)' }}>{Math.round((stats.YELLOW / total) * 100)}% monitored</span>
                  <span style={{ fontSize: '10px', color: 'var(--red)' }}>{Math.round((stats.RED / total) * 100)}% blocked</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
