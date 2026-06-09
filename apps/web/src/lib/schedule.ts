import type { Program, WorkoutSchedule } from '@gymtracker/shared'

/** Monday-first column order, expressed in JS getDay() indices (0 = Sunday). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

export const DAY_SHORT: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
}

export const DAY_FULL: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}

const MONTH_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** A workout that lands on a given day, paired with the schedule that placed it there. */
export type ScheduledWorkout = {
  schedule: WorkoutSchedule
  templateId: string
}

/**
 * Local-time `YYYY-MM-DD`. Deliberately NOT `toISOString().slice(0, 10)`, which
 * is UTC and can land on the wrong calendar day near midnight — one-time
 * schedules are stored as the local date the user picked.
 */
export function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_FULL[month]} ${year}`
}

export function dayTitle(date: Date): string {
  return `${DAY_FULL[date.getDay()]}, ${MONTH_FULL[date.getMonth()]} ${date.getDate()}`
}

/**
 * The workouts scheduled on `date`: every weekly schedule whose day-of-week
 * matches, plus every one-time schedule whose date matches. Schedules without a
 * templateId are skipped — they can't resolve to a workout.
 */
export function workoutsForDate(date: Date, schedules: WorkoutSchedule[]): ScheduledWorkout[] {
  const dow = date.getDay()
  const ymd = toYMD(date)
  const out: ScheduledWorkout[] = []
  for (const s of schedules) {
    if (s.templateId == null) continue
    const matches =
      (s.type === 'weekly' && s.dayOfWeek === dow) || (s.type === 'once' && s.scheduledDate === ymd)
    if (matches) out.push({ schedule: s, templateId: s.templateId })
  }
  return out
}

/**
 * The 42 dates (6 weeks × 7 days, Monday-first) that fill a month-grid view of
 * `month` in `year`. Leading/trailing days belong to the adjacent months.
 */
export function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // days since the preceding Monday
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i))
}

/** Maps each template id used in the active phase to its day label (A / B / Upper …). */
export function dayLabelByTemplate(program: Program | null | undefined): Map<string, string> {
  const map = new Map<string, string>()
  const phase = program?.phases.find(p => p.status === 'active') ?? program?.phases[0]
  for (const t of phase?.templates ?? []) {
    if (t.templateId) map.set(t.templateId, t.dayLabel)
  }
  return map
}
