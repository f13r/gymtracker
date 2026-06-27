import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from '@tanstack/react-router'
import { Dumbbell, Clock, Zap, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { WorkoutSession, WorkoutSet } from '@gymtracker/shared'
import { computeExceededExercises } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { queryKeys } from '@/api/queryKeys'
import { schedulesApi } from '@/api/schedules'
import { workoutsApi } from '@/api/workouts'
import { Button } from '@/components/ui/button'
import { ThisWeekCard } from '@/components/workout/ThisWeekCard'
import { buildSupersetMeta } from '@/components/workout/superset-display'
import { useSessionVolume } from '@/hooks/useSessionVolume'
import { cn, formatElapsed, formatSessionDuration } from '@/lib/utils'

function getGreetingKey() {
  const h = new Date().getHours()
  if (h < 12) {
    return 'greeting.morning'
  }
  if (h < 17) {
    return 'greeting.afternoon'
  }
  return 'greeting.evening'
}

const SKIP_KEY = 'skipped_today_schedule'

const fmtVol = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)
const fmtDelta = (v: number) => {
  const abs = Math.abs(v)
  return abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : Math.round(abs).toString()
}

function WorkoutSummaryCard({
  currentVolume,
  prevVolume,
  completedCount,
  totalExercises,
  exceededExercises,
  hasTemplate,
}: {
  currentVolume: number
  prevVolume: number | null
  completedCount: number
  totalExercises: number
  exceededExercises: { id: string; name: string; delta: number }[]
  hasTemplate: boolean
}) {
  const { t } = useTranslation('dashboard')
  const deltaVol = prevVolume !== null ? currentVolume - prevVolume : null
  const hasPrev = prevVolume !== null

  return (
    <div className="border-border/30 rounded-2xl border px-4 pt-3 pb-4">
      {hasPrev && (
        <p className="text-muted-foreground/50 mb-2.5 text-[9px] font-semibold tracking-widest uppercase">
          {t('vsLastSession')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/30 rounded-xl px-3 py-2.5">
          <p className="text-muted-foreground mb-1 text-[9px] font-semibold tracking-widest uppercase">{t('volume')}</p>
          <p className="font-display font-700 text-[26px] leading-none tabular-nums">
            {currentVolume > 0 ? (
              <>
                {fmtVol(currentVolume)}
                <span className="text-muted-foreground ml-0.5 font-sans text-[11px] font-normal">{t('kg')}</span>
              </>
            ) : (
              '—'
            )}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {t('was')}{' '}
              {hasPrev ? (
                <>
                  {fmtVol(prevVolume!)}
                  <span className="ml-0.5 font-sans font-normal">{t('kg')}</span>
                </>
              ) : (
                '—'
              )}
            </span>
            {currentVolume > 0 && deltaVol !== null && deltaVol !== 0 && (
              <span
                className={cn('text-[10px] font-bold tabular-nums', deltaVol > 0 ? 'text-accent' : 'text-destructive')}
              >
                {deltaVol > 0 ? '+' : '−'}
                {fmtDelta(deltaVol)}
              </span>
            )}
          </div>
        </div>

        {hasTemplate && (
          <div className="bg-muted/30 rounded-xl px-3 py-2.5">
            <p className="text-muted-foreground mb-1 text-[9px] font-semibold tracking-widest uppercase">{t('done')}</p>
            <p className="font-display font-700 text-[26px] leading-none tabular-nums">
              {completedCount}
              <span className="text-muted-foreground ml-0.5 font-sans text-[11px] font-normal">/{totalExercises}</span>
            </p>
            <div className="mt-1.5">
              <span className="text-muted-foreground text-[11px]">{t('exercisesComplete')}</span>
            </div>
          </div>
        )}
      </div>

      {exceededExercises.length > 0 && (
        <div className="border-border/20 mt-3 border-t pt-3">
          <p className="text-muted-foreground/50 mb-2 text-[9px] font-semibold tracking-widest uppercase">
            {t('beatLastTime', { count: exceededExercises.length })}
          </p>
          <div className="space-y-1">
            {exceededExercises.map(ex => (
              <div key={ex.id} className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium">{ex.name}</span>
                <span className="text-accent text-[10px] font-bold tabular-nums">
                  +{fmtVol(ex.delta)}
                  <span className="ml-0.5 font-normal">{t('kg')}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function WorkoutHub({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation('dashboard')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const { data: session } = useQuery({
    queryKey: queryKeys.session(sessionId),
    queryFn: () => workoutsApi.getSession(sessionId),
  })

  const { data: template } = useQuery({
    queryKey: queryKeys.template(session?.templateId),
    queryFn: () => workoutsApi.getTemplate(session!.templateId!),
    enabled: !!session?.templateId,
  })

  const { data: allExercises = [] } = useQuery({
    queryKey: queryKeys.exercises(),
    queryFn: exercisesApi.getAll,
  })

  const { data: allSessions = [] } = useQuery({
    queryKey: queryKeys.sessions(),
    queryFn: workoutsApi.getSessions,
  })

  const templateId = session?.templateId

  const prevSession = useMemo(() => {
    if (!templateId) {
      return null
    }
    // Single O(n) pass for the most-recently-finished prior session — no full sort.
    return allSessions
      .filter((s: WorkoutSession) => s.templateId === templateId && s.finishedAt && s.id !== sessionId)
      .reduce<WorkoutSession | null>(
        (latest, s) => (!latest || (s.finishedAt ?? 0) > (latest.finishedAt ?? 0) ? s : latest),
        null,
      )
  }, [allSessions, templateId, sessionId])

  const { data: prevSessionData } = useQuery({
    queryKey: queryKeys.session(prevSession?.id),
    queryFn: () => workoutsApi.getSession(prevSession!.id),
    enabled: !!prevSession?.id,
  })

  const exerciseNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    allExercises.forEach((e: { id: string; name: string }) => {
      map[e.id] = e.name
    })
    return map
  }, [allExercises])

  const exercises = useMemo(() => {
    if (!session) {
      return []
    }
    // Superset grouping comes from the start-time snapshot (ADR-0008), the same
    // authoritative source the round-robin logger reads — not the live template.
    const supersetByExerciseId = new Map<string, string | null>(
      (session.exercises ?? []).map(se => [se.exerciseId, se.supersetGroup]),
    )
    if (template) {
      return template.exercises
        .slice()
        .filter(te => te.exerciseId !== null)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(te => ({
          id: te.exerciseId!,
          name: exerciseNameMap[te.exerciseId!] ?? t('exerciseFallback'),
          supersetGroup: supersetByExerciseId.get(te.exerciseId!) ?? null,
          loggedSets: (session.sets ?? []).filter(
            (s: WorkoutSet) => s.exerciseId === te.exerciseId && s.removedAt == null,
          ),
        }))
    }
    const ids = [
      ...new Set(
        (session.sets ?? []).filter((s: WorkoutSet) => s.removedAt == null).map((s: WorkoutSet) => s.exerciseId),
      ),
    ]
    return ids.map(id => ({
      id,
      name: exerciseNameMap[id] ?? t('exerciseFallback'),
      supersetGroup: supersetByExerciseId.get(id) ?? null,
      loggedSets: (session.sets ?? []).filter((s: WorkoutSet) => s.exerciseId === id && s.removedAt == null),
    }))
  }, [template, session, exerciseNameMap, t])

  const supersetMeta = useMemo(() => buildSupersetMeta(exercises.map(e => e.supersetGroup)), [exercises])

  // The resume target shown as "current" in the overview: the first Exercise
  // that isn't fully done (-1 if all complete). Mirrors the logger's first-not-done
  // resolution so the highlight matches where a tap-through lands (ADR-0009).
  const resumeIndex = exercises.findIndex(ex => {
    const total = ex.loggedSets.length
    const done = ex.loggedSets.filter((s: WorkoutSet) => s.done).length
    return !(total > 0 && done >= total)
  })

  const sessionSets = session?.sets ?? []
  const prevSessionDataSets = useMemo(() => prevSessionData?.sets ?? [], [prevSessionData?.sets])
  const { current: currentVolume, prev: sessionPrevVolume } = useSessionVolume(sessionSets, prevSessionDataSets)

  const summaryStats = useMemo(() => {
    const prevSets = prevSessionDataSets

    const prevVolume = prevSets.length > 0 ? sessionPrevVolume : null

    const completedCount = exercises.filter(
      ex => ex.loggedSets.length > 0 && ex.loggedSets.every((s: WorkoutSet) => s.done),
    ).length

    const exceededExercises = computeExceededExercises(exercises, prevSets)

    return { currentVolume, prevVolume, completedCount, exceededExercises }
  }, [sessionPrevVolume, prevSessionDataSets, exercises, currentVolume])

  useEffect(() => {
    if (!session?.startedAt) {
      return
    }
    const startedAt = session.startedAt
    const tick = () => setElapsedSeconds(Math.floor(Date.now() / 1000) - startedAt)
    const initId = setTimeout(tick, 0)
    const id = setInterval(tick, 1000)
    return () => {
      clearTimeout(initId)
      clearInterval(id)
    }
  }, [session?.startedAt])

  const finishWorkout = useMutation({
    mutationFn: () => workoutsApi.finishSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeSession() })
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      navigate({ to: '/dashboard' })
    },
  })

  if (!session) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Loader2 className="text-muted-foreground animate-spin" size={24} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-6">
      {/* Session header */}
      <div className="flex items-start justify-between pt-2">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{t('activeWorkout')}</p>
          <h1 className="font-display font-700 mt-0.5 text-3xl leading-tight tracking-wide">
            {session.name.toUpperCase()}
          </h1>
        </div>
        <span className="text-muted-foreground font-mono text-xl tabular-nums">{formatElapsed(elapsedSeconds)}</span>
      </div>

      {/* Exercise list */}
      <div className="bg-card border-border overflow-hidden rounded-2xl border">
        {exercises.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Dumbbell className="text-muted-foreground" size={28} />
            <p className="text-muted-foreground text-sm">{t('noExercisesYet')}</p>
          </div>
        ) : (
          exercises.map((ex, i) => {
            const loggedCount = ex.loggedSets.length
            const doneCount = ex.loggedSets.filter((s: WorkoutSet) => s.done).length
            const isComplete = loggedCount > 0 && doneCount >= loggedCount
            // "Started" means at least one Set marked done — the snapshot
            // materialises all Planned Sets at Start (ADR-0008), so loggedCount
            // is > 0 for every Exercise and says nothing about progress.
            const isInProgress = !isComplete && doneCount > 0
            // Highlight the resume target: the first not-complete Exercise. Mirrors
            // the logger's first-not-done resolution (ADR-0009).
            const isCurrent = i === resumeIndex
            // Members of a Superset share a colored left accent (matches the template editor),
            // so contiguous runs read as one group. Standalone exercises stay neutral.
            const groupColor = ex.supersetGroup ? supersetMeta.get(ex.supersetGroup)?.color : undefined

            return (
              <button
                key={ex.id}
                className={cn(
                  'border-border/40 active:bg-muted/50 flex w-full items-center justify-between border-b px-4 py-3.5 text-left transition-colors last:border-b-0',
                  isCurrent && !isComplete && 'bg-primary/5',
                )}
                style={groupColor ? { borderLeftColor: groupColor, borderLeftWidth: 4 } : undefined}
                type="button"
                onClick={() =>
                  navigate({ to: '/workout/$sessionId', params: { sessionId }, search: { exercise: ex.id } })
                }
              >
                <div className="flex items-center gap-3">
                  {isComplete ? (
                    <CheckCircle2 className="text-accent shrink-0" size={18} />
                  ) : isCurrent ? (
                    <span className="relative flex size-4 shrink-0 items-center justify-center">
                      <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                      <span className="bg-primary relative inline-flex size-2.5 rounded-full" />
                    </span>
                  ) : isInProgress ? (
                    <span className="bg-primary/60 relative flex size-2.5 shrink-0 rounded-full" />
                  ) : (
                    <Circle className="text-muted-foreground/40 shrink-0" size={18} />
                  )}
                  <span className={cn('text-sm font-semibold', isComplete && 'text-muted-foreground line-through')}>
                    {ex.name}
                  </span>
                </div>
                <span
                  className={cn(
                    'text-xs font-semibold tabular-nums',
                    isComplete ? 'text-accent' : 'text-muted-foreground',
                  )}
                >
                  {doneCount}/{loggedCount > 0 ? loggedCount : '?'}
                </span>
              </button>
            )
          })
        )}
      </div>

      {/* Workout summary */}
      {exercises.length > 0 && (
        <WorkoutSummaryCard
          completedCount={summaryStats.completedCount}
          currentVolume={summaryStats.currentVolume}
          exceededExercises={summaryStats.exceededExercises}
          hasTemplate={!!template}
          prevVolume={summaryStats.prevVolume}
          totalExercises={exercises.length}
        />
      )}

      {/* Finish button */}
      <button
        className="border-destructive/30 text-destructive active:bg-destructive/5 h-12 w-full rounded-xl border text-sm font-semibold transition-colors disabled:opacity-40"
        disabled={finishWorkout.isPending}
        type="button"
        onClick={() => finishWorkout.mutate()}
      >
        {finishWorkout.isPending ? t('finishing') : t('finishWorkout')}
      </button>
    </div>
  )
}

export function DashboardPage() {
  const { t, i18n } = useTranslation('dashboard')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [promptDismissed, setPromptDismissed] = useState(false)
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const greetingKey = useMemo(() => getGreetingKey(), [])
  const dayName = useMemo(() => new Date().toLocaleDateString(i18n.language, { weekday: 'long' }), [i18n.language])

  const { data: active } = useQuery({ queryKey: queryKeys.activeSession(), queryFn: workoutsApi.getActiveSession })
  const { data: sessions = [] } = useQuery({ queryKey: queryKeys.sessions(), queryFn: workoutsApi.getSessions })
  const { data: todaySchedule } = useQuery({
    queryKey: ['todaySchedule'],
    queryFn: schedulesApi.getToday,
  })

  const startFromSchedule = useMutation({
    mutationFn: () =>
      workoutsApi.startSession({
        templateId: todaySchedule!.schedule.templateId!,
        name: todaySchedule!.templateName,
      }),
    onSuccess: session => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeSession() })
      queryClient.invalidateQueries({ queryKey: ['todaySchedule'] })
      navigate({ to: '/workout/$sessionId', params: { sessionId: session.id } })
    },
  })

  const dismissPrompt = () => {
    if (todaySchedule) {
      localStorage.setItem(`${SKIP_KEY}:${todaySchedule.schedule.templateId!}:${todayStr}`, '1')
    }
    setPromptDismissed(true)
  }

  const isSkipped =
    todaySchedule && localStorage.getItem(`${SKIP_KEY}:${todaySchedule.schedule.templateId!}:${todayStr}`) === '1'

  const showPrompt = !!todaySchedule && !promptDismissed && !isSkipped && !active

  if (active) {
    return <WorkoutHub sessionId={active.id} />
  }

  const finished = sessions.filter((s: WorkoutSession) => s.finishedAt)
  const recent = finished.slice(0, 5)

  if (showPrompt) {
    return (
      <div className="bg-background flex h-svh flex-col items-center justify-center px-6 text-center">
        <div className="bg-primary/10 mb-6 flex size-20 items-center justify-center rounded-3xl">
          <Dumbbell className="text-primary" size={36} />
        </div>
        <p className="text-muted-foreground mb-1 text-sm font-semibold tracking-widest uppercase">{dayName}</p>
        <h1 className="font-display font-700 mb-2 text-4xl leading-tight tracking-wide">
          {todaySchedule!.templateName.toUpperCase()}
        </h1>
        <p className="text-muted-foreground mb-10 text-sm">
          {t('exercisesPlanned', { count: todaySchedule!.exerciseCount })}
        </p>
        <button
          className="bg-primary text-primary-foreground font-display font-700 shadow-primary/30 mb-3 h-16 w-full max-w-sm rounded-2xl text-2xl tracking-widest shadow-lg transition-all active:scale-[0.97] disabled:opacity-60"
          disabled={startFromSchedule.isPending}
          type="button"
          onClick={() => startFromSchedule.mutate()}
        >
          {startFromSchedule.isPending ? '…' : t('letsGo')}
        </button>
        <button className="text-muted-foreground text-sm font-medium" type="button" onClick={dismissPrompt}>
          {t('skipToday')}
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 p-4 pb-4">
      <div className="pt-2">
        <p className="text-muted-foreground text-sm font-medium tracking-widest uppercase">{t(greetingKey)}</p>
        <h1 className="font-display font-700 mt-0.5 text-4xl leading-tight tracking-wide">
          GYM<span className="text-primary">TRACKER</span>
        </h1>
      </div>

      <Button
        className="font-display font-700 shadow-primary/20 h-14 w-full rounded-xl text-xl tracking-widest shadow-lg transition-transform active:scale-[0.98]"
        asChild
      >
        <Link to="/workout/start">
          <Zap className="mr-1" size={20} />
          {t('startWorkout')}
        </Link>
      </Button>

      <ThisWeekCard />

      {recent.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-600 text-muted-foreground text-lg tracking-wide uppercase">
              {t('recent')}
            </h2>
            <Link className="text-primary text-xs font-medium" to="/history">
              {t('viewAll')} →
            </Link>
          </div>
          <div className="space-y-2">
            {recent.map((s, i) => (
              <Link key={s.id} params={{ sessionId: s.id }} to="/history/$sessionId">
                <div
                  className={cn(
                    'bg-card border-border active:bg-muted flex items-center justify-between rounded-xl border px-4 py-3 transition-colors',
                    i === 0 && 'border-border',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-muted flex size-9 items-center justify-center rounded-lg">
                      <Dumbbell className="text-muted-foreground" size={16} />
                    </div>
                    <div>
                      <p className="text-sm leading-tight font-semibold">{s.name}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {new Date(s.startedAt * 1000).toLocaleDateString(i18n.language, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-muted-foreground flex items-center gap-1.5">
                    <Clock size={12} />
                    <span className="text-xs font-medium">{formatSessionDuration(s.startedAt, s.finishedAt!)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {finished.length === 0 && !active && (
        <div className="border-border space-y-2 rounded-xl border border-dashed p-8 text-center">
          <Dumbbell className="text-muted-foreground mx-auto" size={32} />
          <p className="text-muted-foreground text-sm">{t('noWorkoutsYet')}</p>
        </div>
      )}
    </div>
  )
}
