import { useRef, useCallback } from 'react'

export function useLongPress(callback: () => void, interval = 125) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(() => {
    callback()
    timerRef.current = setInterval(callback, interval)
  }, [callback, interval])

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return { onPointerDown: start, onPointerUp: stop, onPointerLeave: stop }
}
