import { render, screen, within, fireEvent } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkoutSet } from '@gymtracker/shared'

import { WorkoutLogger } from '@/components/workout/WorkoutLogger'
import { useWorkoutLogger } from '@/components/workout/useWorkoutLogger'
import i18n from '@/lib/i18n'

// Assertions below target the English copy, so pin the language to `en`.
beforeAll(async () => {
  await i18n.changeLanguage('en')
})

// ── Mock the controller hook so the component renders without React Query / Router.
vi.mock('@/components/workout/useWorkoutLogger', () => ({
  useWorkoutLogger: vi.fn(),
}))

// ── Mock haptics to a no-op.
vi.mock('@/lib/haptics', () => ({
  haptic: vi.fn(),
}))

// ── Stub heavy children that pull native/portal behaviour under jsdom.
vi.mock('@/components/workout/ExerciseMediaDrawer', () => ({
  ExerciseMediaDrawer: () => null,
}))
vi.mock('@/components/workout/ExercisePicker', () => ({
  ExercisePicker: () => null,
}))
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

const mockedHook = vi.mocked(useWorkoutLogger)

function makeSet(id: string, done = false): WorkoutSet {
  return {
    id,
    sessionId: 's1',
    exerciseId: 'ex1',
    setNumber: 1,
    reps: 8,
    weightKg: 50,
    done,
    removedAt: null,
  } as unknown as WorkoutSet
}

const addSetMutate = vi.fn()

function baseHookReturn(overrides: Record<string, unknown> = {}) {
  const currentExercise = {
    id: 'ex1',
    name: 'Leg V Squad',
    equipmentType: 'barbell',
    defaultSets: 3,
    defaultReps: 8,
    defaultWeightKg: 50,
    loggedSets: [makeSet('set1')],
    supersetGroup: null,
  }
  return {
    session: { id: 's1', name: 'Leg Day', startedAt: new Date().toISOString() },
    exercises: [currentExercise],
    currentExercise,
    activeExerciseIndex: 0,
    nextExerciseData: null,
    isTemplateBased: true,
    structureLoaded: true,
    shouldRedirectToOverview: false,
    resolving: false,
    loggedCount: 1,
    doneCount: 0,
    canAddSet: true,
    workoutSeconds: 0,
    prevSets: [],
    exerciseMediaMap: {},
    pendingSelection: null,
    permanentAdd: false,
    setPermanentAdd: vi.fn(),
    permanentAddTarget: null,
    showPicker: false,
    setShowPicker: vi.fn(),
    mediaOpen: false,
    setMediaOpen: vi.fn(),
    allDoneOpen: false,
    setAllDoneOpen: vi.fn(),
    navigate: vi.fn(),
    prevExercise: vi.fn(),
    nextExercise: vi.fn(),
    handlePickerSelect: vi.fn(),
    toggleDone: { mutate: vi.fn(), isPending: false, variables: undefined },
    deleteSet: { mutate: vi.fn(), isPending: false, variables: undefined },
    addSet: { mutate: addSetMutate, isPending: false },
    updateSet: { mutate: vi.fn() },
    finishWorkout: { mutate: vi.fn(), isPending: false },
    ...overrides,
  } as unknown as ReturnType<typeof useWorkoutLogger>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WorkoutLogger — Add set lives in the exercise header', () => {
  it('template-based: Add set is in the header (sibling of the name) and NOT in the set list', () => {
    mockedHook.mockReturnValue(baseHookReturn())
    const { container } = render(<WorkoutLogger sessionId="s1" />)

    const addSetBtn = screen.getByRole('button', { name: /add set/i })

    // It lives in the exercise header — the same bordered block as the name.
    const name = screen.getByText('LEG V SQUAD')
    const header = name.closest('div.border-b')
    expect(header).not.toBeNull()
    expect(header).toContainElement(addSetBtn)

    // It is NOT inside the scrollable set list.
    const list = container.querySelector('.overflow-y-auto')
    expect(list).not.toBeNull()
    expect(within(list as HTMLElement).queryByRole('button', { name: /add set/i })).toBeNull()
  })

  it('freeform: Add set renders in the header and is NOT nested in the picker button', () => {
    mockedHook.mockReturnValue(
      baseHookReturn({
        isTemplateBased: false,
        currentExercise: undefined,
        exercises: [],
        loggedCount: 0,
        doneCount: 0,
        pendingSelection: { id: 'ex9', name: 'Pool Press' },
        canAddSet: true,
      }),
    )
    const { container } = render(<WorkoutLogger sessionId="s1" />)

    const addSetBtn = screen.getByRole('button', { name: /add set/i })

    // The picker button carries the exercise name; Add set must be a sibling, not nested.
    const pickerButton = screen.getByText('POOL PRESS').closest('button')
    expect(pickerButton).not.toBeNull()
    expect(pickerButton).not.toContainElement(addSetBtn)

    // Still not inside the scrollable list region.
    const list = container.querySelector('.overflow-y-auto')
    expect(within(list as HTMLElement).queryByRole('button', { name: /add set/i })).toBeNull()
  })

  it('empty data state (no logged sets) still shows the header Add set button', () => {
    const currentExercise = {
      id: 'ex1',
      name: 'Leg V Squad',
      equipmentType: 'barbell',
      defaultSets: 3,
      defaultReps: 8,
      defaultWeightKg: 50,
      loggedSets: [],
      supersetGroup: null,
    }
    mockedHook.mockReturnValue(
      baseHookReturn({ currentExercise, exercises: [currentExercise], loggedCount: 0, canAddSet: true }),
    )
    render(<WorkoutLogger sessionId="s1" />)

    expect(screen.getByText('Log your first set')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add set/i })).toBeInTheDocument()
  })

  it('canAddSet false: no Add set button renders anywhere', () => {
    mockedHook.mockReturnValue(baseHookReturn({ canAddSet: false }))
    render(<WorkoutLogger sessionId="s1" />)

    expect(screen.queryByRole('button', { name: /add set/i })).toBeNull()
  })

  it('clicking the header Add set button calls addSet.mutate', () => {
    mockedHook.mockReturnValue(baseHookReturn())
    render(<WorkoutLogger sessionId="s1" />)

    fireEvent.click(screen.getByRole('button', { name: /add set/i }))
    expect(addSetMutate).toHaveBeenCalledTimes(1)
  })
})
