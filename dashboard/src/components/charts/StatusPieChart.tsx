import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import type { Stats } from '../../api/types'

interface StatusPieChartProps {
  stats: Stats
}

const SLICE_COLORS = {
  GREEN:  '#22c55e',
  YELLOW: '#f59e0b',
  RED:    '#ef4444',
}

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#0d1520',
    border: '1px solid #1a2d42',
    borderRadius: '8px',
    color: '#dce8f5',
    fontSize: '12px',
    padding: '8px 12px',
  },
}

export function StatusPieChart({ stats }: StatusPieChartProps) {
  const total = stats.GREEN + stats.YELLOW + stats.RED

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[220px] text-ink-muted text-[13px] gap-2">
        <div className="text-[40px] opacity-20 leading-none select-none">◯</div>
        <span>No call data yet</span>
      </div>
    )
  }

  const data = [
    { name: 'Green',  value: stats.GREEN,  color: SLICE_COLORS.GREEN  },
    { name: 'Yellow', value: stats.YELLOW, color: SLICE_COLORS.YELLOW },
    { name: 'Red',    value: stats.RED,    color: SLICE_COLORS.RED    },
  ].filter(d => d.value > 0)

  const greenPct = Math.round((stats.GREEN / total) * 100)

  return (
    <div className="flex flex-col">
      {/* Donut */}
      <div className="relative">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={76}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip {...TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>

        {/* Centre label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-[24px] font-bold font-mono text-green-400 leading-none">
            {greenPct}%
          </div>
          <div className="text-[11px] text-ink-muted mt-0.5">clean</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-around mt-1 pb-1">
        <LegendItem color="#22c55e" label="GREEN"  value={stats.GREEN}  />
        <LegendItem color="#f59e0b" label="YELLOW" value={stats.YELLOW} />
        <LegendItem color="#ef4444" label="RED"    value={stats.RED}    />
      </div>
    </div>
  )
}

function LegendItem({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: number
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="font-mono text-[18px] font-bold leading-none"
        style={{ color }}
      >
        {value.toLocaleString()}
      </div>
      <div className="flex items-center gap-1 text-[10px] text-ink-muted">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: color }}
        />
        {label}
      </div>
    </div>
  )
}
