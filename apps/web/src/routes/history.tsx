import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, Clock, Dumbbell, Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { WorkoutSession } from '@gymtracker/shared'

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
import { formatSessionDuration } from '@/lib/utils'

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function groupByMonth(sessions: WorkoutSession[]) {
  const groups: Record<string, WorkoutSession[]> = {}
  sessions.forEach(s => {
    const label = new Date(s.startedAt * 1000).toLocaleDateString('en', { month: 'long', year: 'numeric' })
    if (!groups[label]) {
      groups[label] = []
    }
    groups[label].push(s)
  })
  return groups
}

export function HistoryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: sessions = [] } = useQuery({ queryKey: queryKeys.sessions(), queryFn: workoutsApi.getSessions })
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const { mutate: deleteSession, isPending } = useMutation({
    mutationFn: (id: string) => workoutsApi.deleteSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      setPendingDeleteId(null)
    },
  })

  const finished = sessions.filter(s => s.finishedAt)
  const grouped = groupByMonth(finished)
  const pendingSession = sessions.find(s => s.id === pendingDeleteId)

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-border border-b px-4 pt-4 pb-3">
        <button
          className="text-muted-foreground mb-3 -ml-1 flex items-center gap-1"
          type="button"
          onClick={() => navigate({ to: '/dashboard' })}
        >
          <ChevronLeft size={18} />
          <span className="text-sm">Dashboard</span>
        </button>
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Log</p>
        <h1 className="font-display font-700 text-3xl tracking-wide">HISTORY</h1>
      </div>

      {finished.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
          <Dumbbell className="text-muted-foreground" size={36} />
          <p className="text-muted-foreground">No completed workouts yet</p>
        </div>
      ) : (
        <div className="divide-border/30 divide-y">
          {Object.entries(grouped).map(([month, monthSessions]) => (
            <div key={month}>
              <div className="bg-background/95 sticky top-0 px-4 py-2 backdrop-blur-sm">
                <span className="text-muted-foreground text-[10px] font-bold tracking-widest uppercase">{month}</span>
              </div>
              {monthSessions.map(s => (
                <div key={s.id} className="border-border/50 flex items-center border-b">
                  <Link
                    className="active:bg-card flex flex-1 items-center justify-between p-4 transition-colors"
                    params={{ sessionId: s.id }}
                    to="/history/$sessionId"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-card border-border flex size-10 flex-shrink-0 items-center justify-center rounded-xl border">
                        <Dumbbell className="text-muted-foreground" size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{s.name}</p>
                        <p className="text-muted-foreground mt-0.5 text-xs">{formatDate(s.startedAt)}</p>
                      </div>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-1">
                      <Clock size={12} />
                      <span className="text-xs font-medium">{formatSessionDuration(s.startedAt, s.finishedAt!)}</span>
                    </div>
                  </Link>
                  <button
                    aria-label="Delete workout"
                    className="text-destructive/50 active:text-destructive flex size-16 flex-shrink-0 items-center justify-center transition-colors"
                    type="button"
                    onClick={() => setPendingDeleteId(s.id)}
                  >
                    <Trash2 size={22} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <Dialog open={pendingDeleteId !== null} onOpenChange={open => !open && setPendingDeleteId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete workout?</DialogTitle>
            <DialogDescription>
              {pendingSession?.name} will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button className="flex-1" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              className="flex-1"
              disabled={isPending}
              variant="destructive"
              onClick={() => pendingDeleteId && deleteSession(pendingDeleteId)}
            >
              {isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
