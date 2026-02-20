import { useEffect, useRef } from 'react'

export function usePolling(fn: () => void, intervalMs: number, immediate = true) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (immediate) fnRef.current()
    const id = setInterval(() => fnRef.current(), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, immediate])
}
