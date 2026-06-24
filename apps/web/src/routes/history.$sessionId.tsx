import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, CheckCircle2, Circle, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { calculateVolume, getDoneSets } from '@gymtracker/shared'
import type { Exercise, ExerciseComparison, WorkoutSet } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { queryKeys } from '@/api/queryKeys'
import { workoutsApi } from '@/api/workouts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function HistoryDetailPage() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string }
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: session } = useQuery({
    queryKey: queryKeys.session(sessionId),
    queryFn: () => workoutsApi.getSession(sessionId),
  })

  const { data: allExercises = [] } = useQuery({
    queryKey: queryKeys.exercises(),
    queryFn: exercisesApi.getAll,
  })

  const { data: comparison = [] } = useQuery({
    queryKey: queryKeys.sessionComparison(sessionId),
    queryFn: () => workoutsApi.getSessionComparison(sessionId),
  })

  const { mutate: deleteSession, isPending } = useMutation({
    mutationFn: () => workoutsApi.deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      navigate({ to: '/history' })
    },
  })

  const nameMap = useMemo(() => {
    const map: Record<string, string> = {}
    allExercises.forEach((e: Exercise) => {
      map[e.id] = e.name
    })
    return map
  }, [allExercises])

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="border-primary size-6 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  const duration = session.finishedAt ? Math.round((session.finishedAt - session.startedAt) / 60) : null

  const comparisonMap: Record<string, ExerciseComparison> = {}
  comparison.forEach(c => {
    comparisonMap[c.exerciseId] = c
  })

  // Hide Removed sets (kept in DB for stats); group the rest by exercise.
  const visibleByExercise: Record<string, WorkoutSet[]> = {}
  for (const s of session.sets) {
    if (s.removedAt != null) {
      continue
    }
    ;(visibleByExercise[s.exerciseId] ??= []).push(s)
  }

  // Render order: the snapshot's exercise list (orderIndex) first, then any
  // exercise with sets but no session_exercises row (freeform / mid-session add).
  const orderedIds: string[] = []
  const seen = new Set<string>()
  for (const se of [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex)) {
    if (!seen.has(se.exerciseId)) {
      seen.add(se.exerciseId)
      orderedIds.push(se.exerciseId)
    }
  }
  for (const s of session.sets) {
    if (!seen.has(s.exerciseId)) {
      seen.add(s.exerciseId)
      orderedIds.push(s.exerciseId)
    }
  }
  const renderIds = orderedIds.filter(id => (visibleByExercise[id]?.length ?? 0) > 0)

  // Headline + per-exercise figures count Done Sets only (Done & not Removed).
  const doneSets = getDoneSets(session.sets)
  const totalSets = doneSets.length
  const totalVolume = calculateVolume(doneSets)

  return (
    <div className="flex h-full flex-col">
      <div className="border-border shrink-0 border-b px-4 pt-4 pb-3">
        <div className="mb-3 flex items-center justify-between">
          <button
            className="text-muted-foreground -ml-1 flex items-center gap-1"
            type="button"
            onClick={() => navigate({ to: '/history' })}
          >
            <ChevronLeft size={18} />
            <span className="text-sm">History</span>
          </button>
          <button
            aria-label="Delete workout"
            className="text-destructive/50 active:text-destructive -mr-1 flex size-11 items-center justify-center transition-colors"
            type="button"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={22} strokeWidth={1.5} />
          </button>
        </div>
        <h1 className="font-display font-700 text-2xl leading-tight tracking-wide">{session.name}</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {new Date(session.startedAt * 1000).toLocaleDateString('en', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
          {duration && ` · ${duration}m`}
        </p>
      </div>

      {totalSets > 0 && (
        <div className="grid shrink-0 grid-cols-2 gap-3 p-4">
          <div className="bg-card border-border rounded-xl border p-4 text-center">
            <p className="font-display font-700 text-primary text-3xl">{totalSets}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">total sets</p>
          </div>
          <div className="bg-card border-border rounded-xl border p-4 text-center">
            <p className="font-display font-700 text-3xl">{Math.round(totalVolume).toLocaleString()}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">volume (kg)</p>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {renderIds.map(exerciseId => {
          const sets = visibleByExercise[exerciseId] ?? []
          const done = getDoneSets(sets)
          // Bodyweight Sets carry weight 0 (not null); treat only a positive
          // load as "weighted" so kg/Volume are dropped for them (CONTEXT.md).
          const weights = done.map(s => s.weightKg).filter((w): w is number => w != null && w > 0)
          const current = {
            topSetKg: weights.length ? Math.max(...weights) : null,
            doneSets: done.length,
            volume: weights.length ? calculateVolume(done) : null,
          }
          return (
            <div key={exerciseId} className="bg-card border-border overflow-hidden rounded-xl border">
              <div className="border-border/50 border-b px-4 py-3">
                <p className="font-display font-600 text-base tracking-wide uppercase">
                  {nameMap[exerciseId] ?? 'Exercise'}
                </p>
                <ExerciseDeltas current={current} prev={comparisonMap[exerciseId]} />
              </div>
              <div className="divide-border/50 divide-y">
                {sets.map((s, i) => (
                  <div key={s.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground w-8 text-xs font-semibold">S{i + 1}</span>
                        <span className={`text-sm font-medium ${s.done ? '' : 'text-muted-foreground/60'}`}>
                          {s.weightKg ? `${s.weightKg} kg × ${s.reps}` : `${s.reps} reps`}
                        </span>
                        {!s.done && (
                          <span className="bg-muted text-muted-foreground/70 rounded px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
                            missed
                          </span>
                        )}
                      </div>
                      {s.done ? (
                        <CheckCircle2 className="text-accent" size={14} />
                      ) : (
                        <Circle className="text-muted-foreground/40" size={14} />
                      )}
                    </div>
                    {s.notes && <p className="text-muted-foreground mt-1.5 pl-11 text-xs italic">{s.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <Dialog open={confirmDelete} onOpenChange={open => !open && setConfirmDelete(false)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete workout?</DialogTitle>
            <DialogDescription>{session.name} will be permanently removed. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button className="flex-1" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button className="flex-1" disabled={isPending} variant="destructive" onClick={() => deleteSession()}>
              {isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const deltaTone = (d: number) => (d > 0 ? 'text-accent' : d < 0 ? 'text-destructive' : 'text-muted-foreground')
const deltaSign = (d: number) => (d === 0 ? '—' : d > 0 ? `+${d}` : `${d}`)

/**
 * Last-Done Comparison line under an exercise name: top-set kg, Done-Set count,
 * and Volume vs the same exercise's most recent earlier occurrence. Renders
 * "First time" when there is no prior. kg/volume are dropped for weightless
 * (bodyweight) exercises, where the prior occurrence carries no weight.
 */
function ExerciseDeltas({
  current,
  prev,
}: {
  current: { topSetKg: number | null; doneSets: number; volume: number | null }
  prev: ExerciseComparison | undefined
}) {
  if (!prev) {
    return <span className="text-muted-foreground mt-1 block text-[11px]">First time</span>
  }
  const date = new Date(prev.comparedToStartedAt * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric' })

  const setsDelta = current.doneSets - prev.doneSets
  const showWeight = current.topSetKg != null && prev.topSetKg != null
  const weightDelta = showWeight ? Math.round((current.topSetKg! - prev.topSetKg!) * 10) / 10 : 0
  const showVol = current.volume != null && prev.volume != null && prev.volume > 0
  const volPct = showVol ? Math.round(((current.volume! - prev.volume!) / prev.volume!) * 100) : 0

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-muted-foreground text-[10px] tracking-wide uppercase">vs {date}</span>
      {showWeight && (
        <span className="text-[11px] tabular-nums">
          <span className="text-muted-foreground">top </span>
          {current.topSetKg}kg{' '}
          <span className={`font-semibold ${deltaTone(weightDelta)}`}>{deltaSign(weightDelta)}</span>
        </span>
      )}
      <span className="text-[11px] tabular-nums">
        <span className="text-muted-foreground">sets </span>
        {current.doneSets} <span className={`font-semibold ${deltaTone(setsDelta)}`}>{deltaSign(setsDelta)}</span>
      </span>
      {showVol && (
        <span className="text-[11px] tabular-nums">
          <span className="text-muted-foreground">vol </span>
          <span className={`font-semibold ${deltaTone(volPct)}`}>{volPct > 0 ? `+${volPct}%` : `${volPct}%`}</span>
        </span>
      )}
    </div>
  )
}
