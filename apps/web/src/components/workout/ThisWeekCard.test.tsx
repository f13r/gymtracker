import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkoutSchedule, WorkoutSession } from '@gymtracker/shared'

import { ThisWeekCard } from '@/components/workout/ThisWeekCard'
import i18n from '@/lib/i18n'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const weekly = (dayOfWeek: number, templateId: string): WorkoutSchedule => ({
  id: `s-${dayOfWeek}`,
  userId: 'u',
  templateId,
  type: 'weekly',
  dayOfWeek,
  scheduledDate: null,
  createdAt: 0,
})
const sessions = vi.hoisted(() => ({ list: [] as WorkoutSession[] }))
vi.mock('@/api/schedules', () => ({
  schedulesApi: { getSchedules: () => Promise.resolve([weekly(1, 'mon'), weekly(3, 'wed'), weekly(5, 'fri')]) },
}))
vi.mock('@/api/workouts', () => ({
  workoutsApi: {
    getSessions: () => Promise.resolve(sessions.list),
    getTemplates: () =>
      Promise.resolve([
        { id: 'mon', name: 'Legs + Back', exercises: [{}, {}, {}, {}, {}, {}, {}] },
        { id: 'wed', name: 'Legs + Arms', exercises: [{}, {}] },
        { id: 'fri', name: 'Glutes + Shoulders', exercises: [{}, {}, {}] },
      ]),
  },
}))

const finishedOn = (day: number, templateId: string): WorkoutSession => {
  const started = new Date(2026, 10, day, 9).getTime() / 1000
  return {
    id: `x${day}`,
    userId: 'u',
    templateId,
    name: 'S',
    startedAt: started,
    finishedAt: started + 3600,
    notes: null,
  }
}

function renderCard() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThisWeekCard />
    </QueryClientProvider>,
  )
}

describe('ThisWeekCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 10, 20, 9, 30) }) // Friday
    sessions.list = [finishedOn(18, 'wed')]
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('labels each day with its status', async () => {
    renderCard()
    expect(await screen.findByRole('button', { name: /Mon 16: Legs \+ Back, missed/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tue 17: Rest day/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Wed 18: Legs \+ Arms, done/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fri 20: Glutes \+ Shoulders, planned \(today\)/ })).toBeInTheDocument()
  })

  it("shows today's workout below the week by default, without a legend", async () => {
    renderCard()
    const summary = await screen.findByTestId('week-focus')
    expect(within(summary).getByText('Today')).toBeInTheDocument()
    expect(within(summary).getByText('Glutes + Shoulders')).toBeInTheDocument()
    expect(within(summary).getByText('3 exercises')).toBeInTheDocument()
    expect(summary).not.toHaveTextContent('·')
    expect(screen.queryByText(/^•/)).not.toBeInTheDocument()
  })

  it('shows the tapped day below the week', async () => {
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: /Wed 18/ }))
    const summary = screen.getByTestId('week-focus')
    expect(within(summary).getByText('Wednesday')).toBeInTheDocument()
    expect(within(summary).getByText('Legs + Arms')).toBeInTheDocument()
    expect(within(summary).getByText('done')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Wed 18/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
