import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'

import { programApi } from '@/api/program'
import { queryKeys } from '@/api/queryKeys'
import { schedulesApi } from '@/api/schedules'
import { workoutsApi } from '@/api/workouts'
import { DAY_SHORT, dayLabelByTemplate, isSameDay, workoutsForDate } from '@/lib/schedule'
import { cn } from '@/lib/utils'

/** The seven dates of the current week, Monday-first. */
function currentWeekDates(today: Date): Date[] {
  const offset = (today.getDay() + 6) % 7 // days since the preceding Monday
  return Array.from({ length: 7 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset + i))
}

/**
 * Read-only "This Week" overview: shows which workout lands on each day of the
 * week (recurring or one-time), with today highlighted, and links to the full
 * calendar. Renders nothing until something is scheduled, so it never clutters
 * an empty home.
 */
export function ThisWeekCard() {
  const { data: schedules = [] } = useQuery({ queryKey: queryKeys.schedules(), queryFn: schedulesApi.getSchedules })
  const { data: program } = useQuery({ queryKey: ['program'], queryFn: programApi.getActive })
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: workoutsApi.getTemplates })

  const today = useMemo(() => new Date(), [])
  const week = useMemo(() => currentWeekDates(today), [today])

  if (schedules.length === 0) {return null}

  const labels = dayLabelByTemplate(program)
  const nameById = new Map(templates.map(t => [t.id, t.name]))

  // Legend: each distinct template that appears this week, label + full name.
  const seen = new Set<string>()
  const legend: { label: string; name: string }[] = []
  for (const date of week) {
    for (const { templateId } of workoutsForDate(date, schedules)) {
      if (seen.has(templateId)) {continue}
      seen.add(templateId)
      legend.push({ label: labels.get(templateId) ?? '•', name: nameById.get(templateId) ?? 'Workout' })
    }
  }

  if (legend.length === 0) {return null}

  return (
    <section aria-label="This week's training schedule" className="space-y-2">
      <Link className="text-muted-foreground flex items-center gap-1" to="/calendar">
        <h2 className="font-display font-600 text-lg tracking-wide uppercase">This Week</h2>
        <ChevronRight size={16} />
      </Link>

      <div className="bg-card border-border rounded-xl border p-3">
        <ul className="grid grid-cols-7 gap-1.5">
          {week.map(date => {
            const first = workoutsForDate(date, schedules)[0]
            const tid = first?.templateId ?? null
            const isToday = isSameDay(date, today)
            const day = date.getDay()
            const label = tid ? (labels.get(tid) ?? '•') : null
            const ariaLabel = `${DAY_SHORT[day]} ${date.getDate()}: ${
              tid ? (nameById.get(tid) ?? 'Workout') : 'Rest day'
            }${isToday ? ' (today)' : ''}`

            return (
              <li key={date.toISOString()} aria-label={ariaLabel} className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    'text-[10px] font-semibold tracking-wide uppercase',
                    isToday ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {DAY_SHORT[day]}
                </span>
                <div
                  className={cn(
                    'flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold tabular-nums',
                    isToday && tid && 'bg-primary text-primary-foreground',
                    isToday && !tid && 'text-primary ring-primary/40 ring-2 ring-inset',
                    !isToday && tid && 'bg-muted text-foreground',
                    !isToday && !tid && 'text-muted-foreground/30',
                  )}
                >
                  {label ?? '–'}
                </div>
                {isToday && <span aria-hidden="true" className="bg-primary h-1 w-1 rounded-full" />}
              </li>
            )
          })}
        </ul>

        {legend.length > 0 && (
          <div className="border-border mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2.5">
            {legend.map(({ label, name }) => (
              <span key={label + name} className="text-muted-foreground text-xs">
                <span className="text-foreground font-semibold">{label}</span> · {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
