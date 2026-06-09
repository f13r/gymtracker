import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Calendar, Play, Plus, Repeat, Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { WorkoutTemplateWithExercises } from '@gymtracker/shared'

import { programApi } from '@/api/program'
import { queryKeys } from '@/api/queryKeys'
import { schedulesApi } from '@/api/schedules'
import { workoutsApi } from '@/api/workouts'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { dayLabelByTemplate, dayTitle, isSameDay, toYMD, workoutsForDate } from '@/lib/schedule'
import { cn } from '@/lib/utils'
import { useWorkoutStore } from '@/stores/workout.store'

interface DayScheduleSheetProps {
  /** The day whose schedule is shown. `null` keeps the sheet closed. */
  date: Date | null
  onClose: () => void
}

export function DayScheduleSheet({ date, onClose }: DayScheduleSheetProps) {
  const open = date != null
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setActiveSession = useWorkoutStore(s => s.setActiveSession)
  const [adding, setAdding] = useState(false)

  const { data: schedules = [] } = useQuery({
    queryKey: queryKeys.schedules(),
    queryFn: schedulesApi.getSchedules,
    enabled: open,
  })
  const { data: program } = useQuery({ queryKey: ['program'], queryFn: programApi.getActive, enabled: open })
  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: workoutsApi.getTemplates,
    enabled: open,
  })

  const labels = dayLabelByTemplate(program)
  const nameById = new Map(templates.map(t => [t.id, t.name]))
  const scheduled = date ? workoutsForDate(date, schedules) : []
  const isToday = date != null && isSameDay(date, new Date())

  const start = useMutation({
    mutationFn: ({ templateId, name }: { templateId: string; name: string }) =>
      workoutsApi.startSession({ name, templateId }),
    onSuccess: session => {
      setActiveSession(session.id)
      queryClient.invalidateQueries({ queryKey: queryKeys.activeSession() })
      navigate({ to: '/workout/$sessionId', params: { sessionId: session.id } })
    },
  })

  const addOnce = useMutation({
    mutationFn: (templateId: string) =>
      schedulesApi.createSchedule({ templateId, type: 'once', scheduledDate: toYMD(date!) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules() })
      setAdding(false)
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => schedulesApi.deleteSchedule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.schedules() }),
  })

  const close = () => {
    setAdding(false)
    onClose()
  }

  return (
    <Drawer open={open} onOpenChange={o => !o && close()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{date ? dayTitle(date) : ''}</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-2 px-4 pb-6">
          {scheduled.length === 0 && !adding && (
            <p className="text-muted-foreground py-2 text-sm">Nothing scheduled.</p>
          )}

          {scheduled.map(({ schedule, templateId }) => {
            const label = labels.get(templateId) ?? '•'
            const name = nameById.get(templateId) ?? 'Workout'
            return (
              <div key={schedule.id} className="bg-muted/50 flex items-center gap-3 rounded-xl px-3 py-2.5">
                <span className="bg-card text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
                  {label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    {schedule.type === 'weekly' ? (
                      <>
                        <Repeat size={11} /> Weekly
                      </>
                    ) : (
                      <>
                        <Calendar size={11} /> One-time
                      </>
                    )}
                  </p>
                </div>

                {isToday && (
                  <button
                    aria-label={`Start ${name}`}
                    className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-transform active:scale-95 disabled:opacity-60"
                    disabled={start.isPending}
                    type="button"
                    onClick={() => start.mutate({ templateId, name })}
                  >
                    <Play fill="currentColor" size={13} strokeWidth={0} />
                    Start
                  </button>
                )}

                {schedule.type === 'once' && (
                  <button
                    aria-label={`Remove ${name} from this day`}
                    className="text-destructive/60 active:text-destructive flex size-9 shrink-0 items-center justify-center transition-colors"
                    disabled={remove.isPending}
                    type="button"
                    onClick={() => remove.mutate(schedule.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            )
          })}

          {/* Add a one-time workout to this day */}
          {adding ? (
            <div className="space-y-1 pt-1">
              <p className="text-muted-foreground mb-1 px-1 text-xs font-semibold tracking-widest uppercase">
                Add a workout
              </p>
              {templates.length === 0 ? (
                <p className="text-muted-foreground px-1 py-2 text-sm">No templates yet.</p>
              ) : (
                templates.map((t: WorkoutTemplateWithExercises) => (
                  <button
                    key={t.id}
                    className="border-border active:border-primary flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:opacity-60"
                    disabled={addOnce.isPending}
                    type="button"
                    onClick={() => addOnce.mutate(t.id)}
                  >
                    <span className="truncate">{t.name}</span>
                    <Plus className="text-muted-foreground shrink-0" size={16} />
                  </button>
                ))
              )}
            </div>
          ) : (
            <button
              className={cn(
                'border-border text-muted-foreground mt-1 flex w-full items-center justify-center gap-2',
                'rounded-xl border border-dashed py-3 text-sm font-semibold transition-colors active:scale-[0.99]',
              )}
              type="button"
              onClick={() => setAdding(true)}
            >
              <Plus size={16} />
              Schedule a workout
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
