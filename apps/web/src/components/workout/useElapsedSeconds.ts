import { useEffect, useState } from 'react'

/**
 * Seconds elapsed since `startedAt` (a unix-seconds timestamp), ticking once a
 * second. Returns 0 until `startedAt` is known. The interval is a real
 * subscription with cleanup — not an event-handler-in-an-effect.
 */
export function useElapsedSeconds(startedAt?: number): number {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!startedAt) { return }
    const id = setInterval(() => {
      setSeconds(Math.floor(Date.now() / 1000) - startedAt)
    }, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  return seconds
}
