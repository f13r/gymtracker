import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthUser } from '@gymtracker/shared'

import { DashboardPage } from '@/routes/dashboard'
import { useActingStore } from '@/stores/acting.store'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => navigate,
}))
const getActiveSession = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
vi.mock('@/api/workouts', () => ({
  workoutsApi: {
    getActiveSession,
    getSession: () =>
      Promise.resolve({
        id: 's1',
        name: 'Push Day',
        startedAt: Math.floor(Date.now() / 1000),
        templateId: null,
        exercises: [],
        sets: [{ id: 'set1', exerciseId: 'e1', done: false, removedAt: null }],
      }),
    getSessions: () => Promise.resolve([]),
    startSession: vi.fn(),
  },
}))
const getToday = vi.hoisted(() => vi.fn())
vi.mock('@/api/schedules', () => ({ schedulesApi: { getToday } }))
vi.mock('@/api/exercises', () => ({
  exercisesApi: { getAllWithArchived: () => Promise.resolve([{ id: 'e1', name: 'Bench' }]) },
}))
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
    navigate.mockClear()
    getActiveSession.mockImplementation(() => Promise.resolve(null))
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

  it('hides Finish Workout and disables the hub rows while acting on an active Session', async () => {
    getActiveSession.mockImplementation(() => Promise.resolve({ id: 's1' }))
    useActingStore.setState({ athlete })
    renderDashboard()
    const row = (await screen.findByText(/bench/i)).closest('button') as HTMLButtonElement
    expect(row.disabled).toBe(true)
    fireEvent.click(row)
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.queryByText(/finish workout/i)).toBeNull()
  })
})
