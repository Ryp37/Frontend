import { useState, useEffect, useRef } from 'react'
import { getStats } from '../api/client'
import type { Stats } from '../api/types'

export interface StatsPoint {
  time: string
  GREEN: number
  YELLOW: number
  RED: number
  total: number
}

const MAX_POINTS = 24   // ~2 minutes of history at 5s intervals
const POLL_MS    = 5_000

export function useStatsHistory() {
  const [history, setHistory] = useState<StatsPoint[]>([])
  const [current, setCurrent] = useState<Stats>({ GREEN: 0, YELLOW: 0, RED: 0 })
  const [error, setError]     = useState(false)
  const prevRef               = useRef<Stats | null>(null)

  useEffect(() => {
    function poll() {
      getStats()
        .then(stats => {
          setCurrent(stats)
          setError(false)

          const prev = prevRef.current
          if (prev !== null) {
            const point: StatsPoint = {
              time:   new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              GREEN:  Math.max(0, stats.GREEN  - prev.GREEN),
              YELLOW: Math.max(0, stats.YELLOW - prev.YELLOW),
              RED:    Math.max(0, stats.RED    - prev.RED),
              total:  Math.max(
                0,
                (stats.GREEN + stats.YELLOW + stats.RED) -
                (prev.GREEN  + prev.YELLOW  + prev.RED)
              ),
            }
            setHistory(h => [...h, point].slice(-MAX_POINTS))
          }
          prevRef.current = stats
        })
        .catch(() => setError(true))
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [])

  return { history, current, error }
}
