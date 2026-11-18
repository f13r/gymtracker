import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthUser } from '@gymtracker/shared'

import { DashboardPage } from '@/routes/dashboard'
import { useActingStore } from '@/stores/acting.store'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/api/workouts', () => ({
  workoutsApi: {
    getActiveSession: () => Promise.resolve(null),
    getSessions: () => Promise.resolve([]),
    startSession: vi.fn(),
  },
}))
const getToday = vi.hoisted(() => vi.fn())
vi.mock('@/api/schedules', () => ({ schedulesApi: { getToday } }))
vi.mock('@/components/workout/ThisWeekCard', () => ({ ThisWeekCard: () => null }))

const athlete = { id: 'inna', name: 'Inna' } as unknown as AuthUser

function renderDashboard() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DashboardPage />
    </QueryClientProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    getToday.mockImplementation(() =>
      Promise.resolve({ schedule: { templateId: 't1' }, templateName: 'Push Day', exerciseCount: 3 }),
    )
    localStorage.clear()
    // Skip today's schedule prompt so the main dashboard shows.
    localStorage.setItem(`skipped_today_schedule:t1:${new Date().toISOString().slice(0, 10)}`, '1')
  })
  afterEach(() => useActingStore.setState({ athlete: null }))

  it('shows the Start Workout button when acting as yourself', async () => {
    renderDashboard()
    expect(await screen.findByText(/start workout/i)).toBeTruthy()
  })

  it('shows no Start Session control while acting', async () => {
    useActingStore.setState({ athlete })
    renderDashboard()
    await screen.findByText(/no workouts yet/i)
    expect(screen.queryByText(/start workout/i)).toBeNull()
    expect(screen.queryByText(/start your first one/i)).toBeNull()
  })

  it("offers to start today's scheduled Session when acting as yourself", async () => {
    localStorage.clear()
    renderDashboard()
    expect(await screen.findByText(/let's go/i)).toBeTruthy()
  })

  it("does not offer to start today's scheduled Session while acting", async () => {
    localStorage.clear()
    useActingStore.setState({ athlete })
    renderDashboard()
    await screen.findByText(/no workouts yet/i)
    // Let the schedule query resolve before asserting its prompt stays hidden.
    await act(async () => {
      await getToday.mock.results[0]?.value
    })
    expect(screen.queryByText(/let's go/i)).toBeNull()
  })
})
