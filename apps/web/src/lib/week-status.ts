import type { WorkoutSchedule, WorkoutSession } from '@gymtracker/shared'

import { isSameDay, workoutsForDate } from '@/lib/schedule'

/**
 * What a day of the week looks like from the athlete's side:
 * - `done`    — a finished Session started that day (scheduled or not);
 * - `missed`  — scheduled, already past, no finished Session;
 * - `planned` — scheduled, today or later, not done yet;
 * - `rest`    — nothing scheduled and nothing done.
 */
export type DayStatus = 'done' | 'missed' | 'planned' | 'rest'

export type WeekDay = {
  date: Date
  status: DayStatus
  /** For a done day the Template actually trained (falling back to the scheduled one); otherwise the scheduled Template. */
  templateId: string | null
}

export function weekDayStatuses(
  week: Date[],
  today: Date,
  schedules: WorkoutSchedule[],
  sessions: WorkoutSession[],
): WeekDay[] {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return week.map(date => {
    const scheduledId = workoutsForDate(date, schedules)[0]?.templateId ?? null
    const finished = sessions.find(s => s.finishedAt != null && isSameDay(new Date(s.startedAt * 1000), date))
    if (finished) {
      return { date, status: 'done', templateId: finished.templateId ?? scheduledId }
    }
    if (scheduledId == null) {
      return { date, status: 'rest', templateId: null }
    }
    return { date, status: date < startOfToday ? 'missed' : 'planned', templateId: scheduledId }
  })
}
