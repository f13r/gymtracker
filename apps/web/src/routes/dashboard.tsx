import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from '@tanstack/react-router'
import { Dumbbell, Clock, Zap, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'

import type { WorkoutSession, WorkoutSet } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { schedulesApi } from '@/api/schedules'
import { workoutsApi } from '@/api/workouts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useWorkoutStore } from '@/stores/workout.store'

function formatDuration(start: number, end: number) {
  const mins = Math.round((end - start) / 60)
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) {
    return 'Good morning'
  }
  if (h < 17) {
    return 'Good afternoon'
  }
  return 'Good evening'
}

const SKIP_KEY = 'skipped_today_schedule'

function getSkippedKey(templateId: string) {
  return `${SKIP_KEY}:${templateId}:${new Date().toISOString().slice(0, 10)}`
}

function WorkoutHub({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeExerciseIndex, setActiveExerciseIndex } = useWorkoutStore()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => workoutsApi.getSession(sessionId),
  })

  const { data: template } = useQuery({
    queryKey: ['template', session?.templateId],
    queryFn: () => workoutsApi.getTemplate(session!.templateId!),
    enabled: !!session?.templateId,
  })

  const { data: allExercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: exercisesApi.getAll,
  })

  const exerciseNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    allExercises.forEach((e: { id: string; name: string }) => { map[e.id] = e.name })
    return map
  }, [allExercises])

  const exercises = useMemo(() => {
    if (!session) { return [] }
    if (template) {
      return template.exercises
        .slice()
        .sort((a: { orderIndex: number }, b: { orderIndex: number }) => a.orderIndex - b.orderIndex)
        .map((te: { exerciseId: string; defaultSets?: number; orderIndex: number }) => ({
          id: te.exerciseId,
          name: exerciseNameMap[te.exerciseId] ?? 'Exercise',
          defaultSets: te.defaultSets ?? 3,
          loggedSets: (session.sets ?? []).filter((s: WorkoutSet) => s.exerciseId === te.exerciseId),
        }))
    }
    const ids = [...new Set((session.sets ?? []).map((s: WorkoutSet) => s.exerciseId).filter(Boolean) as string[])]
    return ids.map(id => ({
      id,
      name: exerciseNameMap[id] ?? 'Exercise',
      defaultSets: 0,
      loggedSets: (session.sets ?? []).filter((s: WorkoutSet) => s.exerciseId === id),
    }))
  }, [template, session, exerciseNameMap])

  useEffect(() => {
    if (!session?.startedAt) { return }
    setElapsedSeconds(Math.floor(Date.now() / 1000) - session.startedAt)
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor(Date.now() / 1000) - session.startedAt)
    }, 1000)
    return () => clearInterval(id)
  }, [session?.startedAt])

  const finishWorkout = useMutation({
    mutationFn: () => workoutsApi.finishSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSession'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      navigate({ to: '/dashboard' })
    },
  })

  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')
  const ss = String(elapsedSeconds % 60).padStart(2, '0')

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
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Active workout</p>
          <h1 className="font-display font-700 mt-0.5 text-3xl leading-tight tracking-wide">
            {session.name.toUpperCase()}
          </h1>
        </div>
        <span className="text-muted-foreground font-mono text-xl tabular-nums">{mm}:{ss}</span>
      </div>

      {/* Exercise list */}
      <div className="bg-card border-border overflow-hidden rounded-2xl border">
        {exercises.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Dumbbell className="text-muted-foreground" size={28} />
            <p className="text-muted-foreground text-sm">No exercises yet</p>
          </div>
        ) : (
          exercises.map((ex, i) => {
            const doneSets = ex.loggedSets.filter((s: WorkoutSet) => s.done !== 0).length
            const totalSets = ex.defaultSets > 0 ? ex.defaultSets : ex.loggedSets.length
            const isComplete = totalSets > 0 && doneSets >= totalSets
            const isCurrent = i === activeExerciseIndex

            return (
              <button
                key={ex.id}
                className={cn(
                  'border-border/40 active:bg-muted/50 flex w-full items-center justify-between border-b px-4 py-3.5 text-left last:border-b-0 transition-colors',
                  isCurrent && 'bg-primary/5',
                )}
                onClick={() => {
                  setActiveExerciseIndex(i)
                  navigate({ to: '/workout/$sessionId', params: { sessionId } })
                }}
              >
                <div className="flex items-center gap-3">
                  {isComplete ? (
                    <CheckCircle2 className="text-accent shrink-0" size={18} />
                  ) : isCurrent ? (
                    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                      <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                      <span className="bg-primary relative inline-flex h-2.5 w-2.5 rounded-full" />
                    </span>
                  ) : (
                    <Circle className="text-muted-foreground/40 shrink-0" size={18} />
                  )}
                  <span className={cn('text-sm font-semibold', isComplete && 'text-muted-foreground line-through')}>
                    {ex.name}
                  </span>
                </div>
                <span className={cn('text-xs font-semibold tabular-nums', isComplete ? 'text-accent' : 'text-muted-foreground')}>
                  {doneSets}/{totalSets > 0 ? totalSets : '?'}
                </span>
              </button>
            )
          })
        )}
      </div>

      {/* Finish button */}
      <button
        className="border-destructive/30 text-destructive active:bg-destructive/5 h-12 w-full rounded-xl border text-sm font-semibold transition-colors disabled:opacity-40"
        disabled={finishWorkout.isPending}
        onClick={() => finishWorkout.mutate()}
      >
        {finishWorkout.isPending ? 'Finishing…' : 'Finish Workout'}
      </button>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setActiveSession = useWorkoutStore(s => s.setActiveSession)
  const [promptDismissed, setPromptDismissed] = useState(false)

  const { data: active } = useQuery({ queryKey: ['activeSession'], queryFn: workoutsApi.getActiveSession })
  const { data: sessions = [] } = useQuery({ queryKey: ['sessions'], queryFn: workoutsApi.getSessions })
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
      setActiveSession(session.id)
      queryClient.invalidateQueries({ queryKey: ['activeSession'] })
      queryClient.invalidateQueries({ queryKey: ['todaySchedule'] })
      navigate({ to: '/workout/$sessionId', params: { sessionId: session.id } })
    },
  })

  const dismissPrompt = () => {
    if (todaySchedule) {
      localStorage.setItem(getSkippedKey(todaySchedule.schedule.templateId!), '1')
    }
    setPromptDismissed(true)
  }

  const isSkipped = todaySchedule && localStorage.getItem(getSkippedKey(todaySchedule.schedule.templateId!)) === '1'

  const showPrompt = !!todaySchedule && !promptDismissed && !isSkipped && !active

  if (active) {
    return <WorkoutHub sessionId={active.id} />
  }

  const finished = sessions.filter((s: WorkoutSession) => s.finishedAt)
  const recent = finished.slice(0, 5)

  const dayName = new Date().toLocaleDateString('en', { weekday: 'long' })

  if (showPrompt) {
    return (
      <div className="bg-background flex h-svh flex-col items-center justify-center px-6 text-center">
        <div className="bg-primary/10 mb-6 flex h-20 w-20 items-center justify-center rounded-3xl">
          <Dumbbell className="text-primary" size={36} />
        </div>
        <p className="text-muted-foreground mb-1 text-sm font-semibold tracking-widest uppercase">{dayName}</p>
        <h1 className="font-display font-700 mb-2 text-4xl leading-tight tracking-wide">
          {todaySchedule!.templateName.toUpperCase()}
        </h1>
        <p className="text-muted-foreground mb-10 text-sm">
          {todaySchedule!.exerciseCount} exercise{todaySchedule!.exerciseCount !== 1 ? 's' : ''} planned
        </p>
        <button
          className="bg-primary text-primary-foreground font-display font-700 shadow-primary/30 mb-3 h-16 w-full max-w-sm rounded-2xl text-2xl tracking-widest shadow-lg transition-all active:scale-[0.97] disabled:opacity-60"
          disabled={startFromSchedule.isPending}
          onClick={() => startFromSchedule.mutate()}
        >
          {startFromSchedule.isPending ? '…' : "LET'S GO"}
        </button>
        <button className="text-muted-foreground text-sm font-medium" onClick={dismissPrompt}>
          Skip today
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 p-4 pb-4">
      <div className="pt-2">
        <p className="text-muted-foreground text-sm font-medium tracking-widest uppercase">{getGreeting()}</p>
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
          START WORKOUT
        </Link>
      </Button>

      {recent.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-600 text-muted-foreground text-lg tracking-wide uppercase">Recent</h2>
            <Link className="text-primary text-xs font-medium" to="/history">
              View all →
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
                    <div className="bg-muted flex h-9 w-9 items-center justify-center rounded-lg">
                      <Dumbbell className="text-muted-foreground" size={16} />
                    </div>
                    <div>
                      <p className="text-sm leading-tight font-semibold">{s.name}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {new Date(s.startedAt * 1000).toLocaleDateString('en', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-muted-foreground flex items-center gap-1.5">
                    <Clock size={12} />
                    <span className="text-xs font-medium">{formatDuration(s.startedAt, s.finishedAt!)}</span>
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
          <p className="text-muted-foreground text-sm">No workouts yet. Start your first one!</p>
        </div>
      )}
    </div>
  )
}
