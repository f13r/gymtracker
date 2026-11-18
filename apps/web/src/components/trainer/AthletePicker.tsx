import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { AuthUser } from '@gymtracker/shared'

import { startActing } from '@/stores/acting.store'

/** The "Act as…" list: one button per athlete the Trainer may act as. */
export function AthletePicker({ athletes }: { athletes: AuthUser[] }) {
  const { t } = useTranslation('trainer')
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const pick = (athlete: AuthUser) => {
    startActing(queryClient, athlete)
    void navigate({ to: '/dashboard' })
  }

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border">
      <div className="border-border border-b px-4 py-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{t('athletes')}</p>
      </div>
      <div className="flex flex-wrap gap-2 p-3">
        {athletes.map(athlete => (
          <button
            key={athlete.id}
            className="bg-muted text-foreground font-display font-600 h-11 flex-1 rounded-lg px-4 text-base tracking-wide"
            type="button"
            onClick={() => pick(athlete)}
          >
            {athlete.displayName}
          </button>
        ))}
      </div>
    </div>
  )
}
