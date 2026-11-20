import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, ChevronRight, Dumbbell } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { queryKeys } from '@/api/queryKeys'
import { schedulesApi } from '@/api/schedules'
import { workoutsApi } from '@/api/workouts'
import { dateLocale } from '@/lib/date-locale'
import { isSameDay } from '@/lib/schedule'
import { cn } from '@/lib/utils'
import { type WeekDay, weekDayStatuses } from '@/lib/week-status'

// JS getDay() index (0 = Sunday) → shared common:days key, so labels react to language.
const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** The seven dates of the current week, Monday-first. */
function currentWeekDates(today: Date): Date[] {
  const offset = (today.getDay() + 6) % 7 // days since the preceding Monday
  return Array.from(
    { length: 7 },
    (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset + i),
  )
}

/** Today when it has a workout (planned or done), else the next planned day this week. */
function defaultFocus(days: WeekDay[], today: Date): number | null {
  const todayIdx = days.findIndex(d => isSameDay(d.date, today))
  if (todayIdx >= 0 && days[todayIdx].status !== 'rest') {
    return todayIdx
  }
  const next = days.findIndex((d, i) => i > todayIdx && d.status === 'planned')
  return next >= 0 ? next : null
}

/**
 * "This Week" overview: one tile per day showing whether its workout is done,
 * planned or missed (rest days stay empty), today ringed. Below the week, the
 * focused day's workout and its status — today (or the next planned day) by
 * default, or whichever tile was tapped. Renders nothing until something is
 * scheduled, so it never clutters an empty home.
 */
export function ThisWeekCard() {
  const { t } = useTranslation(['workout', 'common'])
  const { data: schedules = [] } = useQuery({ queryKey: queryKeys.schedules(), queryFn: schedulesApi.getSchedules })
  const { data: sessions = [] } = useQuery({ queryKey: queryKeys.sessions(), queryFn: workoutsApi.getSessions })
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: workoutsApi.getTemplates })
  const [selected, setSelected] = useState<number | null>(null)

  const today = useMemo(() => new Date(), [])
  const week = useMemo(() => currentWeekDates(today), [today])
  const days = useMemo(() => weekDayStatuses(week, today, schedules, sessions), [week, today, schedules, sessions])

  if (schedules.length === 0 || days.every(d => d.status === 'rest')) {
    return null
  }

  const templateById = new Map(templates.map(tpl => [tpl.id, tpl]))
  const nameOf = (d: WeekDay) =>
    d.templateId ? (templateById.get(d.templateId)?.name ?? t('session.fallbackName')) : t('week.restDay')
  const shortDay = (d: WeekDay) => t(`common:days.${DOW_KEYS[d.date.getDay()]}`)

  const focusIdx = selected ?? defaultFocus(days, today)
  const focus = focusIdx != null ? days[focusIdx] : null

  function focusWhen(d: WeekDay): string {
    if (isSameDay(d.date, today)) {
      return t('week.today')
    }
    const weekday = d.date.toLocaleDateString(dateLocale(), { weekday: 'long' })
    return weekday.charAt(0).toUpperCase() + weekday.slice(1)
  }

  function focusBadge(d: WeekDay) {
    if (d.status === 'done') {
      return (
        <span className="bg-primary/15 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold capitalize">
          <Check size={12} strokeWidth={3} />
          {t('week.status.done')}
        </span>
      )
    }
    if (d.status === 'missed') {
      return (
        <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize">
          {t('week.status.missed')}
        </span>
      )
    }
    const count = d.status === 'planned' && d.templateId ? (templateById.get(d.templateId)?.exercises.length ?? 0) : 0
    return count > 0 ? (
      <span className="text-muted-foreground shrink-0 text-xs">{t('week.exerciseCount', { count })}</span>
    ) : null
  }

  return (
    <section aria-label={t('week.sectionLabel')} className="space-y-2">
      <Link className="text-muted-foreground flex items-center gap-1" to="/calendar">
        <h2 className="font-display font-600 text-lg tracking-wide uppercase">{t('week.title')}</h2>
        <ChevronRight size={16} />
      </Link>

      <div className="bg-card border-border rounded-xl border p-3">
        <ul className="grid grid-cols-7 gap-1.5">
          {days.map((d, i) => {
            const isToday = isSameDay(d.date, today)
            const isFocused = i === focusIdx
            const status = d.status === 'rest' ? t('week.restDay') : `${nameOf(d)}, ${t(`week.status.${d.status}`)}`
            const ariaLabel = t(isToday ? 'week.dayAriaToday' : 'week.dayAria', {
              day: shortDay(d),
              date: d.date.getDate(),
              status,
            })

            return (
              <li key={d.date.toISOString()}>
                <button
                  aria-label={ariaLabel}
                  aria-pressed={isFocused}
                  className="flex w-full flex-col items-center gap-1.5"
                  type="button"
                  onClick={() => setSelected(i)}
                >
                  <span
                    className={cn(
                      'text-[10px] font-semibold tracking-wide uppercase',
                      isToday ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {shortDay(d)}
                  </span>
                  <span
                    className={cn(
                      'flex h-11 w-full items-center justify-center rounded-lg transition-colors',
                      d.status === 'done' && 'bg-primary text-primary-foreground',
                      (d.status === 'planned' || d.status === 'missed') && 'bg-muted text-muted-foreground',
                      d.status === 'missed' && 'opacity-40',
                      isToday && 'ring-primary ring-offset-card ring-2 ring-offset-2',
                    )}
                  >
                    {d.status === 'done' && <Check size={18} strokeWidth={3} />}
                    {(d.status === 'planned' || d.status === 'missed') && <Dumbbell size={16} />}
                  </span>
                  <span
                    className={cn(
                      'text-[11px] tabular-nums',
                      isFocused ? 'text-foreground font-semibold' : 'text-muted-foreground/60',
                    )}
                  >
                    {d.date.getDate()}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {focus && (
          <div
            aria-live="polite"
            className="border-border mt-3 flex items-center justify-between gap-3 border-t pt-2.5"
            data-testid="week-focus"
          >
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">{focusWhen(focus)}</p>
              <p className="text-foreground truncate text-sm font-semibold">{nameOf(focus)}</p>
            </div>
            {focusBadge(focus)}
          </div>
        )}
      </div>
    </section>
  )
}
