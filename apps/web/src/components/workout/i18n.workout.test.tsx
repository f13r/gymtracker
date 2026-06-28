import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { TemplateForm } from '@/components/workout/TemplateForm'
import { WorkoutLogger } from '@/components/workout/WorkoutLogger'
import { useWorkoutLogger } from '@/components/workout/useWorkoutLogger'
import i18n from '@/lib/i18n'
import enWorkout from '@/locales/en/workout.json'
import ukWorkout from '@/locales/uk/workout.json'
import type { ReactNode } from 'react'

// ── Mock the controller hook so WorkoutLogger renders without React Query / Router.
vi.mock('@/components/workout/useWorkoutLogger', () => ({
  useWorkoutLogger: vi.fn(),
}))
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }))
// Stub heavy children that pull native/portal behaviour under jsdom.
vi.mock('@/components/workout/ExerciseMediaDrawer', () => ({ ExerciseMediaDrawer: () => null }))
vi.mock('@/components/workout/ExercisePicker', () => ({ ExercisePicker: () => null }))
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DrawerFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

const mockedHook = vi.mocked(useWorkoutLogger)

// ── Real missing-key detection: enable saveMissing and collect emitted events.
const missingKeys: string[] = []
const collectMissing = (_lngs: readonly string[], ns: string, key: string) => {
  missingKeys.push(`${ns}:${key}`)
}

beforeAll(async () => {
  i18n.options.saveMissing = true
  i18n.on('missingKey', collectMissing)
  await i18n.changeLanguage('uk')
})

afterAll(() => {
  i18n.off('missingKey', collectMissing)
  i18n.options.saveMissing = false
})

beforeEach(() => {
  vi.clearAllMocks()
  missingKeys.length = 0
})

// ── Recursive key-set extraction for parity comparison.
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return v && typeof v === 'object' && !Array.isArray(v) ? collectKeys(v as Record<string, unknown>, path) : [path]
  })
}

describe('workout namespace parity', () => {
  it('uk and en workout.json have identical key sets (both directions)', () => {
    const ukKeys = collectKeys(ukWorkout as Record<string, unknown>).sort()
    const enKeys = collectKeys(enWorkout as Record<string, unknown>).sort()
    expect(ukKeys).toEqual(enKeys)
  })
})

function makeHookReturn(overrides: Record<string, unknown> = {}) {
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
    loggedCount: 0,
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
    addSet: { mutate: vi.fn(), isPending: false },
    updateSet: { mutate: vi.fn() },
    finishWorkout: { mutate: vi.fn(), isPending: false },
    ...overrides,
  } as unknown as ReturnType<typeof useWorkoutLogger>
}

describe('WorkoutLogger renders in Ukrainian without missing keys', () => {
  it('template-based empty state shows Ukrainian copy', () => {
    mockedHook.mockReturnValue(makeHookReturn())
    render(<WorkoutLogger sessionId="s1" />)

    // Known Ukrainian strings on the template-based surface.
    expect(screen.getByText('Додати підхід')).toBeInTheDocument()
    expect(screen.getByText('Запишіть свій перший підхід')).toBeInTheDocument()
    expect(missingKeys).toEqual([])
  })

  it('freeform empty state shows Ukrainian "no exercise selected" copy', () => {
    mockedHook.mockReturnValue(
      makeHookReturn({
        isTemplateBased: false,
        currentExercise: undefined,
        exercises: [],
        pendingSelection: null,
        canAddSet: false,
      }),
    )
    render(<WorkoutLogger sessionId="s1" />)

    expect(screen.getByText('Вправу не обрано')).toBeInTheDocument()
    expect(missingKeys).toEqual([])
  })

  it('all-done sheet shows Ukrainian completion copy', () => {
    mockedHook.mockReturnValue(makeHookReturn({ allDoneOpen: true }))
    render(<WorkoutLogger sessionId="s1" />)

    expect(screen.getByText('ДО ОГЛЯДУ')).toBeInTheDocument()
    expect(missingKeys).toEqual([])
  })
})

describe('TemplateForm renders in Ukrainian without missing keys', () => {
  function renderWithClient(ui: ReactNode) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
  }

  it('create mode shows Ukrainian template form copy', () => {
    renderWithClient(<TemplateForm isSaving={false} mode="create" onBack={vi.fn()} onSave={vi.fn()} />)

    expect(screen.getByText('ШАБЛОН ТРЕНУВАННЯ')).toBeInTheDocument()
    expect(screen.getByText('Додати вправу')).toBeInTheDocument()
    expect(screen.getByText('ЗБЕРЕГТИ ШАБЛОН')).toBeInTheDocument()
    expect(missingKeys).toEqual([])
  })
})
