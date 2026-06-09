import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { profileApi } from '@/api/profile'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '@/stores/preferences.store'

const REST_PRESETS = [60, 90, 120, 180]
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}
const DURATION_OPTIONS = [30, 45, 60, 75, 90]

export function SettingsPage() {
  const { unit, setUnit, restTimerSeconds, setRestTimer } = usePreferencesStore()
  const queryClient = useQueryClient()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
  })

  const updateProfile = useMutation({
    mutationFn: profileApi.update,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  })

  const currentDays = profile?.trainingDays ?? []
  const currentDuration = profile?.sessionDurationMinutes ?? 60

  const toggleDay = (day: string) => {
    const days = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day]
    updateProfile.mutate({ trainingDays: days })
  }

  const setDuration = (min: number) => {
    updateProfile.mutate({ sessionDurationMinutes: min })
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <div className="pt-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Preferences</p>
        <h1 className="font-display font-700 text-3xl tracking-wide">SETTINGS</h1>
      </div>

      <div className="bg-card border-border overflow-hidden rounded-xl border">
        <div className="border-border border-b px-4 py-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Weight Units</p>
        </div>
        <div className="flex gap-2 p-3">
          {(['kg', 'lb'] as const).map(u => (
            <button
              key={u}
              className={cn(
                'font-display font-600 h-11 flex-1 rounded-lg text-base tracking-wide uppercase transition-all',
                unit === u
                  ? 'bg-primary text-primary-foreground shadow-primary/20 shadow-lg'
                  : 'bg-muted text-muted-foreground',
              )}
              type="button"
              onClick={() => setUnit(u)}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border-border overflow-hidden rounded-xl border">
        <div className="border-border border-b px-4 py-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Rest Timer</p>
        </div>
        <div className="grid grid-cols-4 gap-2 p-3">
          {REST_PRESETS.map(s => (
            <button
              key={s}
              className={cn(
                'font-display font-600 h-11 rounded-lg text-sm tracking-wide transition-all',
                restTimerSeconds === s
                  ? 'bg-primary text-primary-foreground shadow-primary/20 shadow-lg'
                  : 'bg-muted text-muted-foreground',
              )}
              type="button"
              onClick={() => setRestTimer(s)}
            >
              {s}s
            </button>
          ))}
        </div>
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Custom:</span>
            <input
              className="bg-muted border-border focus:border-primary h-9 w-20 rounded-lg border px-3 text-center text-sm tabular-nums outline-none"
              type="number"
              value={restTimerSeconds}
              onChange={e => setRestTimer(parseInt(e.target.value) || 90)}
            />
            <span className="text-muted-foreground text-sm">seconds</span>
          </div>
        </div>
      </div>

      <div className="bg-card border-border overflow-hidden rounded-xl border">
        <div className="border-border border-b px-4 py-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Training Days</p>
        </div>
        <div className="grid grid-cols-7 gap-1 p-3">
          {DAYS.map(day => (
            <button
              key={day}
              className={cn(
                'flex h-10 flex-col items-center justify-center rounded-lg text-xs font-semibold transition-all',
                currentDays.includes(day)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
              type="button"
              onClick={() => toggleDay(day)}
            >
              {DAY_LABELS[day]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border-border overflow-hidden rounded-xl border">
        <div className="border-border border-b px-4 py-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Session Duration</p>
        </div>
        <div className="grid grid-cols-5 gap-2 p-3">
          {DURATION_OPTIONS.map(min => (
            <button
              key={min}
              className={cn(
                'font-display font-600 h-11 rounded-lg text-sm tracking-wide transition-all',
                currentDuration === min
                  ? 'bg-primary text-primary-foreground shadow-primary/20 shadow-lg'
                  : 'bg-muted text-muted-foreground',
              )}
              type="button"
              onClick={() => setDuration(min)}
            >
              {min}m
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border-border overflow-hidden rounded-xl border">
        <div className="border-border border-b px-4 py-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">About</p>
        </div>
        <div className="space-y-2 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">App</span>
            <span className="font-display text-sm font-semibold tracking-wide">GYMTRACKER</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Version</span>
            <span className="text-muted-foreground font-mono text-sm">{__APP_VERSION__}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
