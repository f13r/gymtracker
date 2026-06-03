import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, CheckCircle2, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { Exercise, WorkoutSet } from '@gymtracker/shared'

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

  const setsByExercise = session.sets.reduce<Record<string, WorkoutSet[]>>((acc, s) => {
    const key = s.exerciseId
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(s)
    return acc
  }, {})

  const totalSets = session.sets.length
  const totalVolume = session.sets.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0)

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
        {Object.entries(setsByExercise).map(([exerciseId, sets]) => (
          <div key={exerciseId} className="bg-card border-border overflow-hidden rounded-xl border">
            <div className="border-border/50 border-b px-4 py-3">
              <p className="font-display font-600 text-base tracking-wide uppercase">
                {nameMap[exerciseId] ?? 'Exercise'}
              </p>
            </div>
            <div className="divide-border/50 divide-y">
              {sets.map((s, i) => (
                <div key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground w-8 text-xs font-semibold">S{i + 1}</span>
                      <span className="text-sm font-medium">
                        {s.weightKg != null ? `${s.weightKg} kg × ${s.reps}` : `${s.reps} reps`}
                      </span>
                    </div>
                    <CheckCircle2 className="text-accent" size={14} />
                  </div>
                  {s.notes && <p className="text-muted-foreground mt-1.5 pl-11 text-xs italic">{s.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
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
