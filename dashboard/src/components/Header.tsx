import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { getHealth } from '../api/client'
import type { Page } from '../App'

const PAGE_META: Record<Page, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard',    subtitle: 'Real-time call traffic overview'               },
  calls:     { title: 'Call Checker', subtitle: 'Score and monitor individual calls'             },
  whitelist: { title: 'Whitelist',    subtitle: 'Manage caller prefix rules and tiers'           },
  greylist:  { title: 'Greylist',     subtitle: 'YELLOW-tier callers with auto-expiry TTL'       },
  settings:  { title: 'Settings',     subtitle: 'Service configuration and scoring thresholds'  },
}

interface HeaderProps {
  page:            Page
  onToggleSidebar: () => void
}

export function Header({ page, onToggleSidebar }: HeaderProps) {
  const [online, setOnline] = useState<boolean | null>(null)
  const meta = PAGE_META[page]

  useEffect(() => {
    const check = () =>
      getHealth()
        .then(() => setOnline(true))
        .catch(() => setOnline(false))

    check()
    const id = setInterval(check, 15_000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="h-14 bg-surface-card border-b border-line flex items-center justify-between px-5 shrink-0 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu size={16} />
        </button>
        <div>
          <h1 className="text-[15px] font-semibold text-ink tracking-tight leading-none">
            {meta.title}
          </h1>
          <p className="text-[11px] text-ink-muted mt-0.5">{meta.subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-5">
        {/* API status */}
        <div className="flex items-center gap-2">
          {online === null ? (
            <span className="spinner" />
          ) : (
            <span
              className="w-2 h-2 rounded-full pulse-dot-anim"
              style={{
                background:  online ? '#22c55e' : '#ef4444',
                boxShadow:   online
                  ? '0 0 6px rgba(34,197,94,0.55)'
                  : '0 0 6px rgba(239,68,68,0.55)',
              }}
            />
          )}
          <span
            className={`text-[12px] font-medium ${
              online === null
                ? 'text-ink-muted'
                : online
                ? 'text-green-400'
                : 'text-red-400'
            }`}
          >
            {online === null ? 'Connecting…' : online ? 'API Online' : 'API Offline'}
          </span>
        </div>

        {/* API endpoint */}
        <span className="text-[11px] text-ink-muted font-mono hidden sm:block">
          :8080
        </span>
      </div>
    </header>
  )
}
