import { useEffect } from 'react'

import { dismissToast, useToast } from '@/lib/toast'

const TOAST_MS = 5000

// Mounted once at the app root; sits above the bottom nav and full-screen panels.
export function Toaster() {
  const { message, id } = useToast()

  useEffect(() => {
    if (!message) {
      return
    }
    const timer = setTimeout(dismissToast, TOAST_MS)
    return () => clearTimeout(timer)
  }, [message, id])

  if (!message) {
    return null
  }
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4">
      <div
        className="bg-card border-border text-card-foreground pointer-events-auto max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg"
        role="status"
        onClick={dismissToast}
      >
        {message}
      </div>
    </div>
  )
}
