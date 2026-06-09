import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus, Dumbbell, Play, Zap, Trash2, CalendarDays, Pencil } from 'lucide-react'
import { useState } from 'react'

import type { WorkoutTemplateWithExercises } from '@gymtracker/shared'

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
import { ScheduleDrawer } from '@/components/workout/ScheduleDrawer'
import { useWorkoutStore } from '@/stores/workout.store'

export function WorkoutStartPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setActiveSession = useWorkoutStore(s => s.setActiveSession)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [scheduleTemplateId, setScheduleTemplateId] = useState<string | null>(null)

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: workoutsApi.getTemplates,
  })

  const start = useMutation({
    mutationFn: ({ templateId, name }: { templateId?: string; name: string }) =>
      workoutsApi.startSession({ name, templateId }),
    onSuccess: session => {
      setActiveSession(session.id)
      queryClient.invalidateQueries({ queryKey: queryKeys.activeSession() })
      navigate({ to: '/workout/$sessionId', params: { sessionId: session.id } })
    },
  })

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => workoutsApi.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setPendingDeleteId(null)
    },
  })

  const pendingTemplate = templates.find((t: WorkoutTemplateWithExercises) => t.id === pendingDeleteId)
  const scheduleTemplate = templates.find((t: WorkoutTemplateWithExercises) => t.id === scheduleTemplateId)

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-border flex items-start justify-between border-b px-4 pt-4 pb-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Training</p>
          <h1 className="font-display font-700 text-3xl tracking-wide">WORKOUTS</h1>
        </div>
        <button
          aria-label="Create workout template"
          className="bg-primary text-primary-foreground mt-1 flex size-10 items-center justify-center rounded-xl transition-transform active:scale-95"
          type="button"
          onClick={() => navigate({ to: '/workout/template/new' })}
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex-1 p-4">
        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="bg-card border-border flex size-16 items-center justify-center rounded-2xl border">
              <Dumbbell className="text-muted-foreground" size={28} />
            </div>
            <div className="text-center">
              <p className="font-semibold">No workout templates yet</p>
              <p className="text-muted-foreground mt-1 text-sm">Create a workout template to plan your workouts</p>
            </div>
            <button
              className="bg-primary text-primary-foreground font-display font-600 rounded-xl px-5 py-2.5 text-sm tracking-wide uppercase transition-transform active:scale-95"
              type="button"
              onClick={() => navigate({ to: '/workout/template/new' })}
            >
              Create Workout Template
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((t: WorkoutTemplateWithExercises) => (
              <div key={t.id} className="bg-card border-border overflow-hidden rounded-2xl border">
                <div className="flex items-start justify-between px-4 pt-4 pb-3">
                  <div className="flex-1">
                    <p className="font-display font-700 text-lg tracking-wide">{t.name}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {(t.exercises ?? []).length} exercise{(t.exercises ?? []).length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      aria-label="Start workout"
                      className="text-muted-foreground/60 active:text-primary flex size-11 items-center justify-center transition-colors disabled:opacity-60"
                      disabled={start.isPending}
                      type="button"
                      onClick={() => start.mutate({ templateId: t.id, name: t.name })}
                    >
                      <Play fill="currentColor" size={18} strokeWidth={0} />
                    </button>
                    <button
                      aria-label="Schedule template"
                      className="text-muted-foreground/60 active:text-primary flex size-11 items-center justify-center transition-colors"
                      type="button"
                      onClick={() => setScheduleTemplateId(t.id)}
                    >
                      <CalendarDays size={18} strokeWidth={1.5} />
                    </button>
                    <button
                      aria-label="Delete template"
                      className="text-destructive/50 active:text-destructive -mr-1 flex size-11 items-center justify-center transition-colors"
                      type="button"
                      onClick={() => setPendingDeleteId(t.id)}
                    >
                      <Trash2 size={18} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
                <div className="border-border/50 border-t px-4 py-3">
                  <button
                    className="bg-primary text-primary-foreground font-display font-600 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base tracking-wide transition-transform active:scale-[0.98]"
                    type="button"
                    onClick={() => navigate({ to: '/workout/template/$templateId', params: { templateId: t.id } })}
                  >
                    <Pencil size={18} strokeWidth={2} />
                    Edit Workout
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Start — always available at the bottom */}
      <div className="border-border border-t p-4">
        <button
          className="border-border text-muted-foreground active:bg-card font-display font-600 flex w-full items-center justify-center gap-2 rounded-xl border py-3.5 text-sm tracking-wide uppercase transition-colors disabled:opacity-60"
          disabled={start.isPending}
          type="button"
          onClick={() => start.mutate({ name: 'Quick Workout' })}
        >
          <Zap size={16} />
          Quick Start
        </button>
      </div>

      <Dialog open={pendingDeleteId !== null} onOpenChange={open => !open && setPendingDeleteId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete workout template?</DialogTitle>
            <DialogDescription>
              "{pendingTemplate?.name}" will be permanently removed. This cannot be undone.
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
              disabled={deleteTemplate.isPending}
              variant="destructive"
              onClick={() => pendingDeleteId && deleteTemplate.mutate(pendingDeleteId)}
            >
              {deleteTemplate.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {scheduleTemplate && (
        <ScheduleDrawer
          open={!!scheduleTemplateId}
          templateId={scheduleTemplate.id}
          templateName={scheduleTemplate.name}
          onClose={() => setScheduleTemplateId(null)}
        />
      )}
    </div>
  )
}
