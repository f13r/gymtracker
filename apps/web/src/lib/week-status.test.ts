import { describe, expect, it } from 'vitest'

import type { WorkoutSchedule, WorkoutSession } from '@gymtracker/shared'

import { weekDayStatuses } from '@/lib/week-status'

// Week of Mon 16 – Sun 22 Nov 2026; "today" is Friday 20th.
const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 16 + i))
const today = new Date(2026, 10, 20, 9, 30)

const weekly = (dayOfWeek: number, templateId: string) =>
  ({
    id: `s-${dayOfWeek}`,
    userId: 'u',
    templateId,
    type: 'weekly',
    dayOfWeek,
    scheduledDate: null,
    createdAt: 0,
  }) satisfies WorkoutSchedule
const schedules = [weekly(1, 'mon'), weekly(3, 'wed'), weekly(5, 'fri'), weekly(6, 'sat')]

const session = (day: number, templateId: string | null, finished = true): WorkoutSession => {
  const started = new Date(2026, 10, day, 9, 0).getTime() / 1000
  return {
    id: `x${day}`,
    userId: 'u',
    templateId,
    name: 'S',
    startedAt: started,
    finishedAt: finished ? started + 3600 : null,
    notes: null,
  }
}

describe('weekDayStatuses', () => {
  it('marks a scheduled day with a finished session as done', () => {
    const s = weekDayStatuses(week, today, schedules, [session(18, 'wed')])
    expect(s[2]).toMatchObject({ status: 'done', templateId: 'wed' })
  })

  it('marks a past scheduled day without a session as missed', () => {
    const s = weekDayStatuses(week, today, schedules, [])
    expect(s[0]).toMatchObject({ status: 'missed', templateId: 'mon' })
  })

  it('keeps today and later scheduled days planned', () => {
    const s = weekDayStatuses(week, today, schedules, [])
    expect(s[4].status).toBe('planned')
    expect(s[5].status).toBe('planned')
  })

  it('marks unscheduled days as rest', () => {
    const s = weekDayStatuses(week, today, schedules, [])
    expect(s[1]).toMatchObject({ status: 'rest', templateId: null })
    expect(s[6].status).toBe('rest')
  })

  it('counts an unfinished (active) session as not done', () => {
    const s = weekDayStatuses(week, today, schedules, [session(20, 'fri', false)])
    expect(s[4].status).toBe('planned')
  })

  it('shows an extra workout on a rest day as done, with its own template', () => {
    const s = weekDayStatuses(week, today, schedules, [session(17, 'extra')])
    expect(s[1]).toMatchObject({ status: 'done', templateId: 'extra' })
  })

  it('ignores sessions from other weeks', () => {
    const s = weekDayStatuses(week, today, schedules, [session(9, 'mon')])
    expect(s[0].status).toBe('missed')
  })
})
