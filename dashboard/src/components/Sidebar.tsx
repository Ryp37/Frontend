import { LayoutDashboard, Phone, ShieldCheck, Clock, Settings, Shield, ExternalLink } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Page } from '../App'

const NAV: { key: Page; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard',     icon: LayoutDashboard },
  { key: 'calls',     label: 'Call Checker',  icon: Phone           },
  { key: 'whitelist', label: 'Whitelist',      icon: ShieldCheck     },
  { key: 'greylist',  label: 'Greylist',       icon: Clock           },
  { key: 'settings',  label: 'Settings',       icon: Settings        },
]

interface SidebarProps {
  page:       Page
  onNavigate: (p: Page) => void
  collapsed:  boolean
  onToggle:   () => void
}

export function Sidebar({ page, onNavigate, collapsed }: SidebarProps) {
  return (
    <aside
      className={`
        flex flex-col bg-surface-card border-r border-line h-full shrink-0
        transition-all duration-200
        ${collapsed ? 'w-[64px]' : 'w-[224px]'}
      `}
    >
      {/* Logo */}
      <div
        className={`
          flex items-center gap-3 h-14 border-b border-line shrink-0 px-4
          ${collapsed ? 'justify-center' : ''}
        `}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)' }}
        >
          <Shield size={14} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-ink tracking-tight leading-none">
              SIP Guard
            </div>
            <div className="text-[10px] text-ink-muted uppercase tracking-[0.06em] mt-0.5">
              Fraud Detection
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.map(item => {
          const Icon   = item.icon
          const active = page === item.key
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              title={collapsed ? item.label : undefined}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium
                transition-all duration-150 w-full text-left
                ${collapsed ? 'justify-center' : ''}
                ${
                  active
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    : 'text-ink-secondary hover:bg-surface-hover hover:text-ink border border-transparent'
                }
              `}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Footer – Swagger link */}
      <div className={`px-2 pb-3 pt-3 border-t border-line ${collapsed ? '' : ''}`}>
        <a
          href="http://localhost:8080/swagger/index.html"
          target="_blank"
          rel="noopener noreferrer"
          title={collapsed ? 'Swagger UI' : undefined}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-ink-muted
            hover:text-ink-secondary hover:bg-surface-hover transition-all duration-150
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <ExternalLink size={13} className="shrink-0" />
          {!collapsed && <span className="truncate">Swagger API</span>}
        </a>

        {/* Stack info */}
        {!collapsed && (
          <div className="mt-3 px-3 pb-1">
            <div className="text-[10px] text-ink-muted leading-relaxed">
              Go · Gin · Redis<br />
              UDP SIP :5060
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
