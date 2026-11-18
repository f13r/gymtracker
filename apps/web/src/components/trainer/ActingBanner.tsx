import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { stopActing, useActing } from '@/stores/acting.store'

/** Pinned above the page while a Trainer acts as an athlete, so it is never missed. */
export function ActingBanner() {
  const { athlete } = useActing()
  const { t } = useTranslation('trainer')
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  if (!athlete) {
    return null
  }

  const exit = () => {
    stopActing(queryClient)
    void navigate({ to: '/dashboard' })
  }

  return (
    <div
      className="bg-primary text-primary-foreground flex shrink-0 items-center justify-between gap-3 px-4 py-2 text-sm font-semibold"
      role="status"
    >
      <span className="min-w-0 truncate">{t('banner', { name: athlete.displayName })}</span>
      <button
        className="border-primary-foreground/60 min-h-9 shrink-0 rounded-lg border px-3 text-xs font-bold tracking-wide uppercase"
        type="button"
        onClick={exit}
      >
        {t('exit')}
      </button>
    </div>
  )
}
