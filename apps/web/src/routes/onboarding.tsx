import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { profileApi } from '@/api/profile'
import { queryKeys } from '@/api/queryKeys'
import { cn } from '@/lib/utils'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}
const DURATION_OPTIONS = [30, 45, 60, 75, 90]

type Step = 0 | 1 | 2 | 3

export function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>(0)
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced' | null>(null)
  const [goal, setGoal] = useState<'hypertrophy' | 'strength' | 'powerlifting' | 'general' | null>(null)
  const [trainingDays, setTrainingDays] = useState<string[]>([])
  const [sessionDuration, setSessionDuration] = useState<number>(60)

  const save = useMutation({
    mutationFn: () =>
      profileApi.update({
        experienceLevel: experienceLevel!,
        goal: goal!,
        trainingDays,
        sessionDurationMinutes: sessionDuration,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile() })
      void navigate({ to: '/program' })
    },
  })

  const toggleDay = (day: string) => {
    setTrainingDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]))
  }

  const canNext = () => {
    if (step === 0) {
      return experienceLevel !== null
    }
    if (step === 1) {
      return goal !== null
    }
    if (step === 2) {
      return trainingDays.length >= 2 && trainingDays.length <= 6
    }
    return true
  }

  const next = () => {
    if (step < 3) {
      setStep((step + 1) as Step)
    } else {
      save.mutate()
    }
  }

  return (
    <div className="bg-background flex h-svh flex-col">
      <div className="pt-safe-top flex-1 overflow-y-auto px-4">
        <div className="mx-auto max-w-md pt-8">
          <div className="mb-8">
            <div className="mb-2 flex gap-1">
              {([0, 1, 2, 3] as Step[]).map(i => (
                <div
                  key={i}
                  className={cn('h-1 flex-1 rounded-full transition-colors', i <= step ? 'bg-primary' : 'bg-muted')}
                />
              ))}
            </div>
            <p className="text-muted-foreground text-xs">Step {step + 1} of 4</p>
          </div>

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h1 className="font-display font-700 text-3xl tracking-wide">Experience Level</h1>
                <p className="text-muted-foreground mt-1 text-sm">How long have you been training consistently?</p>
              </div>
              <div className="space-y-3">
                {(['beginner', 'intermediate', 'advanced'] as const).map(lvl => (
                  <button
                    key={lvl}
                    className={cn(
                      'w-full rounded-xl border p-4 text-left transition-all',
                      experienceLevel === lvl ? 'border-primary bg-primary/5' : 'border-border bg-card',
                    )}
                    type="button"
                    onClick={() => setExperienceLevel(lvl)}
                  >
                    <p className="font-display font-600 tracking-wide capitalize">{lvl}</p>
                    <p className="text-muted-foreground text-sm">
                      {lvl === 'beginner' && 'Less than 1 year of consistent training'}
                      {lvl === 'intermediate' && '1–3 years of consistent training'}
                      {lvl === 'advanced' && '3+ years of consistent training'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h1 className="font-display font-700 text-3xl tracking-wide">Primary Goal</h1>
                <p className="text-muted-foreground mt-1 text-sm">What do you want to achieve?</p>
              </div>
              <div className="space-y-3">
                {(['hypertrophy', 'strength', 'powerlifting', 'general'] as const).map(g => (
                  <button
                    key={g}
                    className={cn(
                      'w-full rounded-xl border p-4 text-left transition-all',
                      goal === g ? 'border-primary bg-primary/5' : 'border-border bg-card',
                    )}
                    type="button"
                    onClick={() => setGoal(g)}
                  >
                    <p className="font-display font-600 tracking-wide capitalize">{g}</p>
                    <p className="text-muted-foreground text-sm">
                      {g === 'hypertrophy' && 'Build muscle size and definition'}
                      {g === 'strength' && 'Get stronger in compound movements'}
                      {g === 'powerlifting' && 'Maximise squat, bench, and deadlift'}
                      {g === 'general' && 'Stay fit and healthy overall'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h1 className="font-display font-700 text-3xl tracking-wide">Training Days</h1>
                <p className="text-muted-foreground mt-1 text-sm">Which days do you train? Pick 2–6.</p>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map(day => (
                  <button
                    key={day}
                    className={cn(
                      'flex h-12 flex-col items-center justify-center rounded-lg text-xs font-semibold transition-all',
                      trainingDays.includes(day)
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
              {trainingDays.length > 0 && (
                <p className="text-muted-foreground text-sm">
                  {trainingDays.length} {trainingDays.length === 1 ? 'day' : 'days'} selected
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h1 className="font-display font-700 text-3xl tracking-wide">Session Length</h1>
                <p className="text-muted-foreground mt-1 text-sm">How long are your typical workouts?</p>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {DURATION_OPTIONS.map(min => (
                  <button
                    key={min}
                    className={cn(
                      'font-display font-600 h-14 rounded-xl text-sm tracking-wide transition-all',
                      sessionDuration === min ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                    type="button"
                    onClick={() => setSessionDuration(min)}
                  >
                    {min}m
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pb-safe-bottom px-4 pt-4">
        <div className="mx-auto max-w-md">
          <button
            className="bg-primary text-primary-foreground font-display font-600 h-12 w-full rounded-xl tracking-wide transition-all active:scale-95 disabled:opacity-40"
            disabled={!canNext() || save.isPending}
            type="button"
            onClick={next}
          >
            {save.isPending ? 'Saving…' : step < 3 ? 'Continue' : "Let's go"}
          </button>
          {step > 0 && (
            <button
              className="text-muted-foreground mt-3 w-full text-sm"
              type="button"
              onClick={() => setStep((step - 1) as Step)}
            >
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
