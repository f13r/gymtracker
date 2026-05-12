import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Repeat, Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { WorkoutSchedule } from '@gymtracker/shared'

import { schedulesApi } from '@/api/schedules'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

interface ScheduleDrawerProps {
  open: boolean
  templateId: string
  templateName: string
  onClose: () => void
}

export function ScheduleDrawer({ open, templateId, templateName, onClose }: ScheduleDrawerProps) {
  const queryClient = useQueryClient()
  const [type, setType] = useState<'once' | 'weekly'>('weekly')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedDays, setSelectedDays] = useState<number[]>([])

  const { data: allSchedules = [] } = useQuery({
    queryKey: ['schedules'],
    queryFn: schedulesApi.getSchedules,
    enabled: open,
  })

  const templateSchedules = allSchedules.filter((s: WorkoutSchedule) => s.templateId === templateId)

  const create = useMutation({
    mutationFn: async () => {
      if (type === 'once') {
        if (!selectedDate) {return}
        await schedulesApi.createSchedule({ templateId, type: 'once', scheduledDate: selectedDate })
      } else {
        if (selectedDays.length === 0) {return}
        await Promise.all(
          selectedDays.map(day => schedulesApi.createSchedule({ templateId, type: 'weekly', dayOfWeek: day })),
        )
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      setSelectedDate('')
      setSelectedDays([])
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => schedulesApi.deleteSchedule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  })

  const toggleDay = (day: number) => {
    setSelectedDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]))
  }

  const canSave = (type === 'once' && !!selectedDate) || (type === 'weekly' && selectedDays.length > 0)

  return (
    <Drawer open={open} onOpenChange={o => !o && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Schedule "{templateName}"</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-4 px-4 pb-2">
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-colors',
                type === 'once'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground',
              )}
              onClick={() => setType('once')}
            >
              <Calendar size={15} />
              One time
            </button>
            <button
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-colors',
                type === 'weekly'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground',
              )}
              onClick={() => setType('weekly')}
            >
              <Repeat size={15} />
              Weekly
            </button>
          </div>

          {/* Date or day selector */}
          {type === 'once' ? (
            <input
              className="bg-card border-border focus:border-primary w-full rounded-xl border px-4 py-3 text-sm font-medium transition-colors outline-none"
              min={new Date().toISOString().slice(0, 10)}
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
            />
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((label, i) => (
                <button
                  key={i}
                  className={cn(
                    'flex flex-col items-center rounded-lg py-2 text-xs font-semibold transition-colors',
                    selectedDays.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                  onClick={() => toggleDay(i)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <DrawerFooter>
          <button
            className={cn(
              'font-display font-700 h-13 w-full rounded-xl text-base tracking-widest transition-all active:scale-[0.97]',
              canSave ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
            disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Saving…' : 'Save Schedule'}
          </button>

          {/* Existing schedules */}
          {templateSchedules.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-widest uppercase">
                Scheduled
              </p>
              {templateSchedules.map((s: WorkoutSchedule) => (
                <div key={s.id} className="bg-muted/50 flex items-center justify-between rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    {s.type === 'once' ? (
                      <Calendar className="text-muted-foreground" size={14} />
                    ) : (
                      <Repeat className="text-muted-foreground" size={14} />
                    )}
                    <span className="text-sm font-medium">
                      {s.type === 'once' ? s.scheduledDate : `Every ${DAYS[s.dayOfWeek!]}`}
                    </span>
                  </div>
                  <button
                    className="text-destructive/60 active:text-destructive flex h-8 w-8 items-center justify-center transition-colors"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(s.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
