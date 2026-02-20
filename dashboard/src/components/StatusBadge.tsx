import type { CallStatus } from '../api/types'

interface Props {
  status: CallStatus | string
  size?: 'sm' | 'md'
}

const config: Record<string, { color: string; bg: string; border: string; label: string }> = {
  GREEN:  { color: 'var(--green)',  bg: 'var(--green-bg)',  border: 'var(--green-border)',  label: 'GREEN'  },
  YELLOW: { color: 'var(--yellow)', bg: 'var(--yellow-bg)', border: 'var(--yellow-border)', label: 'YELLOW' },
  RED:    { color: 'var(--red)',    bg: 'var(--red-bg)',    border: 'var(--red-border)',     label: 'RED'    },
  TELCO:  { color: 'var(--green)',  bg: 'var(--green-bg)',  border: 'var(--green-border)',   label: 'TELCO'  },
  CLOUD:  { color: 'var(--red)',    bg: 'var(--red-bg)',    border: 'var(--red-border)',     label: 'CLOUD'  },
}

export function StatusBadge({ status, size = 'md' }: Props) {
  const c = config[status] ?? { color: 'var(--text-muted)', bg: 'transparent', border: 'var(--border)', label: status }
  const padding = size === 'sm' ? '2px 7px' : '3px 9px'
  const fontSize = size === 'sm' ? '10px' : '11px'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding,
      fontSize,
      fontWeight: 600,
      fontFamily: 'var(--font-sans)',
      letterSpacing: '0.06em',
      color: c.color,
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: '4px',
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: '5px',
        height: '5px',
        borderRadius: '50%',
        background: c.color,
        flexShrink: 0,
      }} />
      {c.label}
    </span>
  )
}
