import { Settings, Info, Zap, Shield, Clock, Volume2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/* ─── types ──────────────────────────────────────────────────────────── */

interface ConfigRow {
  variable: string
  default:  string
  description: string
}

interface ConfigSection {
  title:   string
  icon:    LucideIcon
  rows:    ConfigRow[]
}

/* ─── data ────────────────────────────────────────────────────────────── */

const SECTIONS: ConfigSection[] = [
  {
    title: 'Service',
    icon:  Zap,
    rows:  [
      { variable: 'API_PORT',  default: '8080',                     description: 'HTTP server port'                   },
      { variable: 'SIP_PORT',  default: '5060',                     description: 'UDP SIP listener port'              },
      { variable: 'GIN_MODE',  default: 'release',                  description: 'Gin mode (debug / release)'         },
      { variable: 'LOG_LEVEL', default: 'info',                     description: 'zerolog level (debug/info/warn/error)' },
      { variable: 'REDIS_URL', default: 'redis://localhost:6379',   description: 'Redis connection string'            },
    ],
  },
  {
    title: 'Scoring',
    icon:  Shield,
    rows:  [
      { variable: 'GREEN_THRESHOLD', default: '10', description: 'Score below this → GREEN'              },
      { variable: 'RED_THRESHOLD',   default: '50', description: 'Score above this → RED'               },
      { variable: 'AUDIT_MODE',      default: 'true', description: 'Log but never block when true'      },
    ],
  },
  {
    title: 'Greylist',
    icon:  Clock,
    rows:  [
      { variable: 'GREYLIST_TTL_SEC', default: '3600', description: 'Greylist entry TTL in seconds (1 hour)' },
    ],
  },
  {
    title: 'CAPTCHA',
    icon:  Volume2,
    rows:  [
      { variable: 'CAPTCHA_DIGIT',       default: '5',  description: 'DTMF digit caller must press to pass' },
      { variable: 'CAPTCHA_TIMEOUT_SEC', default: '15', description: 'Seconds to wait for DTMF response'   },
    ],
  },
]

/* ─── scoring table ───────────────────────────────────────────────────── */

const SCORING_ROWS = [
  { range: '< GREEN_THRESHOLD',         status: 'GREEN',  behavior: 'Pass through',                        color: 'text-green-400' },
  { range: 'GREEN to RED thresholds',   status: 'YELLOW', behavior: 'Pass through, auto-added to greylist', color: 'text-amber-400' },
  { range: '> RED_THRESHOLD',           status: 'RED',    behavior: 'CAPTCHA challenge, then block (unless AUDIT_MODE)', color: 'text-red-400' },
]

const TIER_ROWS = [
  { tier: 'GREEN',  resolves: 'GREEN',  description: 'Standard pass-through',             color: 'text-green-400'  },
  { tier: 'YELLOW', resolves: 'YELLOW', description: 'Warn and monitor',                   color: 'text-amber-400'  },
  { tier: 'RED',    resolves: 'RED',    description: 'Block (unless AUDIT_MODE)',           color: 'text-red-400'    },
  { tier: 'TELCO',  resolves: 'GREEN',  description: 'Legitimate carrier — always allowed', color: 'text-cyan-400'   },
  { tier: 'CLOUD',  resolves: 'RED',    description: 'VPS/cloud range — always blocked',   color: 'text-orange-400' },
]

/* ─── sub-components ──────────────────────────────────────────────────── */

function SectionCard({ section }: { section: ConfigSection }) {
  const Icon = section.icon
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-line bg-surface-raised/30">
        <Icon size={14} className="text-ink-muted" />
        <h3 className="text-[12px] font-semibold text-ink-secondary uppercase tracking-wider">
          {section.title}
        </h3>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            {['Variable', 'Default', 'Description'].map(h => (
              <th
                key={h}
                className="px-5 py-2 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wider border-b border-line"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map(row => (
            <tr
              key={row.variable}
              className="border-b border-line last:border-b-0 hover:bg-surface-row transition-colors"
            >
              <td className="px-5 py-[9px]">
                <code className="font-mono text-[12px] text-blue-400 bg-blue-950/20 px-1.5 py-0.5 rounded">
                  {row.variable}
                </code>
              </td>
              <td className="px-5 py-[9px] font-mono text-[12px] text-ink-secondary">
                {row.default}
              </td>
              <td className="px-5 py-[9px] text-ink-secondary">
                {row.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ─── main export ─────────────────────────────────────────────────────── */

export function SettingsPanel() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header banner */}
      <div className="card px-5 py-4 flex items-start gap-3">
        <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-[13px] text-ink font-medium">Configuration Reference</p>
          <p className="text-[12px] text-ink-secondary mt-0.5">
            All values are set via environment variables (copy{' '}
            <code className="font-mono text-blue-400 text-[11px]">.env.example</code> →{' '}
            <code className="font-mono text-blue-400 text-[11px]">.env</code>
            ). The service must restart to pick up changes.
          </p>
        </div>
      </div>

      {/* Config sections */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {SECTIONS.map(s => (
          <SectionCard key={s.title} section={s} />
        ))}
      </div>

      {/* Scoring logic */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line bg-surface-raised/30">
          <Settings size={14} className="text-ink-muted" />
          <h3 className="text-[12px] font-semibold text-ink-secondary uppercase tracking-wider">
            Scoring Logic
          </h3>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {['Score Range', 'Status', 'Behavior'].map(h => (
                <th
                  key={h}
                  className="px-5 py-2 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wider border-b border-line"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCORING_ROWS.map(row => (
              <tr
                key={row.status}
                className="border-b border-line last:border-b-0 hover:bg-surface-row transition-colors"
              >
                <td className="px-5 py-[9px] font-mono text-[12px] text-ink-secondary">
                  {row.range}
                </td>
                <td className={`px-5 py-[9px] font-semibold text-[12px] ${row.color}`}>
                  {row.status}
                </td>
                <td className="px-5 py-[9px] text-ink-secondary">{row.behavior}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-line bg-surface-raised/20 text-[12px] text-ink-muted">
          Redis key:{' '}
          <code className="font-mono text-blue-400">score:{'{caller_id}'}</code> — TTL 24 hours.
          Each call to <code className="font-mono text-blue-400">/api/v1/check</code> or a SIP
          INVITE increments the counter atomically. Whitelist entries short-circuit scoring.
        </div>
      </div>

      {/* Tier table */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line bg-surface-raised/30">
          <Shield size={14} className="text-ink-muted" />
          <h3 className="text-[12px] font-semibold text-ink-secondary uppercase tracking-wider">
            Whitelist Tiers
          </h3>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {['Tier', 'Resolves To', 'Description'].map(h => (
                <th
                  key={h}
                  className="px-5 py-2 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wider border-b border-line"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIER_ROWS.map(row => (
              <tr
                key={row.tier}
                className="border-b border-line last:border-b-0 hover:bg-surface-row transition-colors"
              >
                <td className={`px-5 py-[9px] font-semibold font-mono text-[12px] ${row.color}`}>
                  {row.tier}
                </td>
                <td className="px-5 py-[9px] font-mono text-[12px] text-ink-secondary">
                  {row.resolves}
                </td>
                <td className="px-5 py-[9px] text-ink-secondary">{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
