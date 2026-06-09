import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { programApi } from '@/api/program'
import { queryKeys } from '@/api/queryKeys'
import { schedulesApi } from '@/api/schedules'
import { workoutsApi } from '@/api/workouts'
import { DayScheduleSheet } from '@/components/workout/DayScheduleSheet'
import {
  buildMonthGrid,
  DAY_SHORT,
  dayLabelByTemplate,
  isSameDay,
  monthLabel,
  WEEK_ORDER,
  workoutsForDate,
} from '@/lib/schedule'
import { cn } from '@/lib/utils'

export function CalendarPage() {
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selected, setSelected] = useState<Date | null>(null)

  const { data: schedules = [] } = useQuery({
    queryKey: queryKeys.schedules(),
    queryFn: schedulesApi.getSchedules,
  })
  const { data: program } = useQuery({ queryKey: ['program'], queryFn: programApi.getActive })
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: workoutsApi.getTemplates })

  const labels = dayLabelByTemplate(program)
  const nameById = useMemo(() => new Map(templates.map(t => [t.id, t.name])), [templates])
  const grid = useMemo(() => buildMonthGrid(view.year, view.month), [view])

  const step = (delta: number) => {
    setView(v => {
      const d = new Date(v.year, v.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }
  const goToday = () => setView({ year: today.getFullYear(), month: today.getMonth() })

  // Legend: each distinct template scheduled in the visible month.
  const seen = new Set<string>()
  const legend: { label: string; name: string }[] = []
  for (const date of grid) {
    if (date.getMonth() !== view.month) continue
    for (const { templateId } of workoutsForDate(date, schedules)) {
      if (seen.has(templateId)) continue
      seen.add(templateId)
      legend.push({ label: labels.get(templateId) ?? '•', name: nameById.get(templateId) ?? 'Workout' })
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-border flex items-center justify-between border-b px-4 pt-4 pb-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Plan</p>
          <h1 className="font-display font-700 text-3xl tracking-wide">CALENDAR</h1>
        </div>
        <button
          type="button"
          className="border-border text-muted-foreground rounded-lg border px-3 py-1.5 text-xs font-semibold tracking-wide uppercase transition-colors active:scale-95"
          onClick={goToday}
        >
          Today
        </button>
      </div>

      <div className="p-4">
        {/* Month navigation */}
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            className="text-muted-foreground active:text-foreground flex size-9 items-center justify-center transition-colors"
            onClick={() => step(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="font-display font-600 text-lg tracking-wide">{monthLabel(view.year, view.month)}</h2>
          <button
            type="button"
            aria-label="Next month"
            className="text-muted-foreground active:text-foreground flex size-9 items-center justify-center transition-colors"
            onClick={() => step(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Weekday header */}
        <div className="mb-1 grid grid-cols-7">
          {WEEK_ORDER.map(day => (
            <span
              key={day}
              className="text-muted-foreground text-center text-[10px] font-semibold tracking-wide uppercase"
            >
              {DAY_SHORT[day]}
            </span>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {grid.map(date => {
            const inMonth = date.getMonth() === view.month
            const isToday = isSameDay(date, today)
            const dayWorkouts = workoutsForDate(date, schedules)
            const first = dayWorkouts[0]
            const label = first ? (labels.get(first.templateId) ?? '•') : null
            const more = dayWorkouts.length - 1
            const ariaLabel = `${date.getDate()}: ${
              dayWorkouts.length === 0
                ? 'nothing scheduled'
                : dayWorkouts.map(w => nameById.get(w.templateId) ?? 'Workout').join(', ')
            }${isToday ? ' (today)' : ''}`

            return (
              <button
                key={date.toISOString()}
                type="button"
                aria-label={ariaLabel}
                className={cn(
                  'flex aspect-square flex-col items-center justify-start gap-1 rounded-lg p-1.5 transition-colors',
                  'active:scale-[0.97]',
                  isToday ? 'ring-primary ring-2 ring-inset' : 'border-border/40 border',
                  !inMonth && 'opacity-40',
                )}
                onClick={() => setSelected(date)}
              >
                <span
                  className={cn(
                    'text-xs font-semibold tabular-nums',
                    isToday ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {date.getDate()}
                </span>
                {label && (
                  <span className="bg-primary/15 text-primary flex items-center gap-0.5 rounded px-1 text-[10px] font-bold leading-4">
                    {label}
                    {more > 0 && <span className="opacity-70">+{more}</span>}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {legend.length > 0 && (
          <div className="border-border mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3">
            {legend.map(({ label, name }) => (
              <span key={label + name} className="text-muted-foreground text-xs">
                <span className="text-foreground font-semibold">{label}</span> · {name}
              </span>
            ))}
          </div>
        )}
      </div>

      <DayScheduleSheet date={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
