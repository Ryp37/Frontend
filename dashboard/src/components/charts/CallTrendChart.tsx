import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { StatsPoint } from '../../hooks/useStatsHistory'

interface CallTrendChartProps {
  history: StatsPoint[]
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
  labelStyle: { color: '#7a9ab8', marginBottom: '4px' },
  cursor: { stroke: '#213448' },
}

export function CallTrendChart({ history }: CallTrendChartProps) {
  if (history.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] text-ink-muted text-[13px] gap-2">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="opacity-30"
        >
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <span>Accumulating data — score calls to populate the chart</span>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2d42" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fill: '#3d5570', fontSize: 10, fontFamily: 'inherit' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#3d5570', fontSize: 10, fontFamily: 'inherit' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend
          wrapperStyle={{ fontSize: '11px', paddingTop: '10px', color: '#7a9ab8' }}
          iconType="circle"
          iconSize={7}
        />
        <Line
          type="monotone"
          dataKey="GREEN"
          name="Green"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }}
        />
        <Line
          type="monotone"
          dataKey="YELLOW"
          name="Yellow"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
        />
        <Line
          type="monotone"
          dataKey="RED"
          name="Red"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
