import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Scale, Camera, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { BodyWeight } from '@gymtracker/shared'

import { bodyApi } from '@/api/body'
import { profileApi, type UpdateProfilePayload, type UserProfile } from '@/api/profile'
import { queryKeys } from '@/api/queryKeys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const EXPERIENCE = ['beginner', 'intermediate', 'advanced'] as const
const GOAL = ['hypertrophy', 'strength', 'powerlifting', 'general'] as const
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const DAY_KEYS: Record<string, string> = {
  monday: 'mon',
  tuesday: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  friday: 'fri',
  saturday: 'sat',
  sunday: 'sun',
}
const DURATIONS = [30, 45, 60, 75, 90]

const numOrNull = (v: string) => (v === '' ? null : Number(v))

export function BodyPage() {
  const { t, i18n } = useTranslation(['body', 'common'])
  const queryClient = useQueryClient()
  const [newWeight, setNewWeight] = useState('')

  const { data: weights = [] } = useQuery({ queryKey: ['bodyWeights'], queryFn: bodyApi.getWeights })

  const addWeight = useMutation({
    mutationFn: () => bodyApi.addWeight({ weightKg: parseFloat(newWeight) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bodyWeights'] })
      setNewWeight('')
    },
  })

  const latest: BodyWeight | undefined = weights[0]

  return (
    <div className="mx-auto max-w-lg space-y-5 p-4">
      <div className="pt-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{t('eyebrow')}</p>
        <h1 className="font-display font-700 text-3xl tracking-wide">{t('title')}</h1>
      </div>

      <ProfileCard />

      {latest && (
        <div className="bg-card border-border flex items-center gap-4 rounded-xl border p-5">
          <div className="bg-accent/10 flex size-12 items-center justify-center rounded-full">
            <Scale className="text-accent" size={22} />
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{t('latestWeight')}</p>
            <p className="font-display font-700 text-accent text-4xl leading-tight">
              {latest.weightKg} <span className="text-muted-foreground text-lg font-normal">{t('kg')}</span>
            </p>
            <p className="text-muted-foreground text-xs">
              {new Date(latest.recordedAt * 1000).toLocaleDateString(i18n.language, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault()
          if (newWeight && !addWeight.isPending) {
            addWeight.mutate()
          }
        }}
      >
        <input
          aria-label={t('weightInKg')}
          className="bg-card border-border focus:border-primary h-12 flex-1 rounded-xl border px-4 text-base transition-colors outline-none"
          inputMode="decimal"
          placeholder={t('weightInKg')}
          type="number"
          value={newWeight}
          onChange={e => setNewWeight(e.target.value)}
        />
        <button
          className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-xl transition-transform active:scale-95 disabled:opacity-40"
          disabled={!newWeight || addWeight.isPending}
          type="submit"
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      </form>

      <Link
        className="bg-card border-border active:bg-muted flex items-center justify-between rounded-xl border p-4 transition-colors"
        to="/photos"
      >
        <div className="flex items-center gap-3">
          <div className="bg-muted flex size-9 items-center justify-center rounded-lg">
            <Camera className="text-muted-foreground" size={18} />
          </div>
          <span className="font-medium">{t('progressPhotos')}</span>
        </div>
        <span className="text-muted-foreground text-sm">→</span>
      </Link>

      {weights.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground pb-1 text-xs font-semibold tracking-widest uppercase">{t('weightLog')}</p>
          <div className="bg-card border-border divide-border/50 divide-y overflow-hidden rounded-xl border">
            {weights.slice(0, 10).map(w => (
              <div key={w.id} className="flex items-center justify-between px-4 py-3">
                <span className="font-display font-600 text-lg">
                  {w.weightKg} <span className="text-muted-foreground text-sm font-normal">{t('kg')}</span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {new Date(w.recordedAt * 1000).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileCard() {
  // Gate on load so the form can initialise from data without an effect; `key`
  // remounts the form with fresh initial values once the profile resolves.
  const { data: profile, isLoading } = useQuery({ queryKey: queryKeys.profile(), queryFn: profileApi.get })

  if (isLoading) {
    return <div className="bg-card border-border h-40 animate-pulse rounded-xl border" />
  }
  return <ProfileForm key={profile ? 'loaded' : 'empty'} profile={profile ?? null} />
}

function ProfileForm({ profile }: { profile: UserProfile | null }) {
  const { t } = useTranslation(['body', 'common'])
  const queryClient = useQueryClient()

  const [form, setForm] = useState<UpdateProfilePayload>({
    age: profile?.age ?? null,
    heightCm: profile?.heightCm ?? null,
    gender: profile?.gender ?? null,
    experienceLevel: profile?.experienceLevel ?? null,
    goal: profile?.goal ?? null,
    trainingDays: profile?.trainingDays ?? [],
    sessionDurationMinutes: profile?.sessionDurationMinutes ?? 60,
  })

  const save = useMutation({
    mutationFn: () => profileApi.update(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile() })
      queryClient.invalidateQueries({ queryKey: ['program', 'preview'] })
    },
  })

  // Any edit clears the "Saved ✓" / error state so the button never falsely
  // implies unsaved changes are already saved.
  const update = (updater: (f: UpdateProfilePayload) => UpdateProfilePayload) => {
    if (save.isSuccess || save.isError) {
      save.reset()
    }
    setForm(updater)
  }

  const days = form.trainingDays ?? []
  const toggleDay = (day: string) =>
    update(f => {
      const cur = f.trainingDays ?? []
      return { ...f, trainingDays: cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day] }
    })

  return (
    <div className="bg-card border-border space-y-4 rounded-xl border p-5">
      <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{t('myProfile')}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="age">{t('age')}</Label>
          <Input
            id="age"
            inputMode="numeric"
            type="number"
            value={form.age ?? ''}
            onChange={e => update(f => ({ ...f, age: numOrNull(e.target.value) }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="height">{t('height')}</Label>
          <Input
            id="height"
            inputMode="numeric"
            type="number"
            value={form.heightCm ?? ''}
            onChange={e => update(f => ({ ...f, heightCm: numOrNull(e.target.value) }))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t('gender')}</Label>
        <Select
          value={form.gender ?? undefined}
          onValueChange={v => update(f => ({ ...f, gender: v as UpdateProfilePayload['gender'] }))}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('selectPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">{t('male')}</SelectItem>
            <SelectItem value="female">{t('female')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>{t('experienceLabel')}</Label>
        <Select
          value={form.experienceLevel ?? undefined}
          onValueChange={v => update(f => ({ ...f, experienceLevel: v as UpdateProfilePayload['experienceLevel'] }))}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('selectPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {EXPERIENCE.map(x => (
              <SelectItem key={x} value={x}>
                {t(`experience.${x}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>{t('goalLabel')}</Label>
        <Select
          value={form.goal ?? undefined}
          onValueChange={v => update(f => ({ ...f, goal: v as UpdateProfilePayload['goal'] }))}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('selectPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {GOAL.map(x => (
              <SelectItem key={x} value={x}>
                {t(`goal.${x}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>{t('trainingDays')}</Label>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map(day => (
            <button
              key={day}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                days.includes(day)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground'
              }`}
              type="button"
              onClick={() => toggleDay(day)}
            >
              {t(`common:days.${DAY_KEYS[day]}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t('sessionDuration')}</Label>
        <Select
          value={form.sessionDurationMinutes ? String(form.sessionDurationMinutes) : undefined}
          onValueChange={v => update(f => ({ ...f, sessionDurationMinutes: Number(v) }))}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('selectPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {DURATIONS.map(d => (
              <SelectItem key={d} value={String(d)}>
                {t('minutes', { minutes: d })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {save.isError && <p className="text-destructive text-xs">{t('saveError')}</p>}

      <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? t('saving') : save.isSuccess ? t('saved') : t('saveProfile')}
      </Button>
    </div>
  )
}
