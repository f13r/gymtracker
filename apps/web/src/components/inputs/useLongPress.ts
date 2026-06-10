import { useRef, useCallback, useEffect } from 'react'

/**
 * Tap / press-and-hold handler that is scroll-safe.
 *
 * - A quick tap fires the callback once (on release), so a touch that turns
 *   into a scroll never commits a value.
 * - Pressing and holding past `holdDelay` repeats the callback every
 *   `interval` ms.
 * - Any meaningful movement (a scroll gesture) or a `pointercancel` — which the
 *   browser dispatches when the surrounding scroll container claims the
 *   gesture — aborts without firing.
 */
export function useLongPress(callback: () => void, interval = 125, holdDelay = 300) {
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef({ x: 0, y: 0 })
  const movedRef = useRef(false)
  const repeatedRef = useRef(false)

  const clearTimers = useCallback(() => {
    if (repeatRef.current) { clearInterval(repeatRef.current); repeatRef.current = null }
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY }
    movedRef.current = false
    repeatedRef.current = false
    holdRef.current = setTimeout(() => {
      if (movedRef.current) { return }
      repeatedRef.current = true
      callback()
      repeatRef.current = setInterval(callback, interval)
    }, holdDelay)
  }, [callback, interval, holdDelay])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (movedRef.current) { return }
    if (Math.abs(e.clientX - startRef.current.x) > 8 || Math.abs(e.clientY - startRef.current.y) > 8) {
      movedRef.current = true
      clearTimers()
    }
  }, [clearTimers])

  const onPointerUp = useCallback(() => {
    if (!movedRef.current && !repeatedRef.current) { callback() }
    clearTimers()
  }, [callback, clearTimers])

  const onPointerLeave = useCallback(() => {
    movedRef.current = true
    clearTimers()
  }, [clearTimers])

  const onPointerCancel = useCallback(() => {
    movedRef.current = true
    clearTimers()
  }, [clearTimers])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel }
}
