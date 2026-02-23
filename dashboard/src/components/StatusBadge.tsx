import { cn } from '../lib/utils'

interface Cfg {
  text:   string
  bg:     string
  border: string
  dot:    string
}

const STATUS_CFG: Record<string, Cfg> = {
  GREEN:  { text: 'text-green-400',  bg: 'bg-green-950/40',  border: 'border-green-900/50',  dot: 'bg-green-500'  },
  YELLOW: { text: 'text-amber-400',  bg: 'bg-amber-950/40',  border: 'border-amber-900/50',  dot: 'bg-amber-500'  },
  RED:    { text: 'text-red-400',    bg: 'bg-red-950/40',    border: 'border-red-900/50',    dot: 'bg-red-500'    },
  TELCO:  { text: 'text-cyan-400',   bg: 'bg-cyan-950/40',   border: 'border-cyan-900/50',   dot: 'bg-cyan-500'   },
  CLOUD:  { text: 'text-orange-400', bg: 'bg-orange-950/40', border: 'border-orange-900/50', dot: 'bg-orange-500' },
}

interface StatusBadgeProps {
  status: string
  size?:  'sm' | 'md'
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const cfg      = STATUS_CFG[status] ?? STATUS_CFG['RED']
  const dotSize  = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-[11px]'
  const padding  = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded font-semibold border tracking-wide',
        cfg.text, cfg.bg, cfg.border,
        textSize, padding
      )}
    >
      <span className={cn('rounded-full shrink-0', cfg.dot, dotSize)} />
      {status}
    </span>
  )
}
