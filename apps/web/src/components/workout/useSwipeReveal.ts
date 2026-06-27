import { useRef, useState } from 'react'

/**
 * Swipe-left-to-reveal gesture for a list row.
 *
 * Tracks a horizontal drag (ignoring vertical scrolls and presses that start in
 * a focused input), exposes the live `dragX` translation, and snaps open/closed
 * on release. Pointer capture is only acquired once the gesture is confirmed
 * horizontal, so vertical scrolling and taps — including taps on the stepper
 * buttons the row contains — are left untouched.
 */
export function useSwipeReveal(openWidth = 96) {
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const axisRef = useRef<'none' | 'h' | 'v'>('none')
  const activeRef = useRef(false)
  const didDragRef = useRef(false)

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('input')) {
      return
    }
    startXRef.current = e.clientX
    startYRef.current = e.clientY
    axisRef.current = 'none'
    activeRef.current = true
    didDragRef.current = false
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!activeRef.current) {
      return
    }
    const dx = e.clientX - startXRef.current
    const dy = e.clientY - startYRef.current
    if (axisRef.current === 'none') {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
        return
      }
      axisRef.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      if (axisRef.current === 'h') {
        setDragging(true)
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
    }
    if (axisRef.current !== 'h') {
      return
    }
    didDragRef.current = true
    const base = revealed ? -openWidth : 0
    let next = base + dx
    if (next > 0) {
      next = 0
    }
    if (next < -(openWidth + 40)) {
      next = -(openWidth + 40)
    }
    setDragX(next)
  }

  const onPointerUp = () => {
    if (axisRef.current === 'h') {
      if (dragX <= -openWidth / 2) {
        setRevealed(true)
        setDragX(-openWidth)
      } else {
        setRevealed(false)
        setDragX(0)
      }
    }
    activeRef.current = false
    axisRef.current = 'none'
    setDragging(false)
  }

  const close = () => {
    setRevealed(false)
    setDragX(0)
  }

  /** True if the finished interaction was a drag — lets callers swallow the click. Resets the flag. */
  const consumeDrag = () => {
    if (didDragRef.current) {
      didDragRef.current = false
      return true
    }
    return false
  }

  return {
    dragX,
    dragging,
    revealed,
    close,
    consumeDrag,
    swipeHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
