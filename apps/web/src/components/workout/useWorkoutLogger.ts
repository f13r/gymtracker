import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import type { Exercise, SessionWithSets, WorkoutSet } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { queryKeys } from '@/api/queryKeys'
import { setsApi } from '@/api/sets'
import { workoutsApi } from '@/api/workouts'
import { useElapsedSeconds } from '@/components/workout/useElapsedSeconds'
import { usePrepopulatedSet } from '@/components/workout/usePrepopulatedSet'

/** A pending freeform Exercise selection (no logged Set yet, so not in the list). */
interface PendingSelection {
  id: string
  name: string
}

/**
 * Controller hook for the workout logger — owns the Session/Template/Exercise
 * queries, the derived Exercise list (snapshot → template → freeform, per
 * ADR-0008), every Set mutation, the URL-driven navigation helpers, and the
 * handful of UI toggles. The `WorkoutLogger` component consumes this and stays
 * a thin view (see ADR-0009 for the URL-as-active-exercise contract).
 */
export function useWorkoutLogger(sessionId: string, activeExerciseId?: string) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Navigate the logger to a given Exercise by writing it to the URL. `replace`
  // for in-logger moves (prev/next, auto-resolve) so Back exits the logger
  // rather than walking exercises; push only when entering from the overview.
  const goToExercise = (exerciseId: string, opts?: { replace?: boolean }) =>
    navigate({ to: '/workout/$sessionId', params: { sessionId }, search: { exercise: exerciseId }, replace: opts?.replace })

  const [showPicker, setShowPicker] = useState(false)
  // selectedExerciseId + selectedExerciseName always move together (a pending
  // freeform pick), so they live as one slice rather than two useState calls.
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null)
  const [allDoneOpen, setAllDoneOpen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)

  const { data: session } = useQuery({
    queryKey: queryKeys.session(sessionId),
    queryFn: () => workoutsApi.getSession(sessionId),
  })

  // The Template is fetched for its per-Exercise defaults and, for legacy
  // Sessions with no Snapshot, for the exercise list itself (see `exercises`).
  const { data: template, isError: templateError } = useQuery({
    queryKey: queryKeys.template(session?.templateId),
    queryFn: () => workoutsApi.getTemplate(session!.templateId!),
    enabled: !!session?.templateId,
  })

  const { data: allExercises = [] } = useQuery({
    queryKey: queryKeys.exercises(),
    queryFn: exercisesApi.getAll,
  })

  const exerciseNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    allExercises.forEach((e: Exercise) => { map[e.id] = e.name })
    return map
  }, [allExercises])

  const wgerIdMap = useMemo(() => {
    const map: Record<string, number | null> = {}
    allExercises.forEach((e: Exercise) => { map[e.id] = e.wgerId })
    return map
  }, [allExercises])

  const templateDefaults = useMemo(() => {
    const map: Record<string, { defaultSets: number; defaultReps: number; defaultWeightKg: number }> = {}
    template?.exercises.forEach(te => {
      if (te.exerciseId) {
        map[te.exerciseId] = {
          defaultSets: te.defaultSets ?? 0,
          defaultReps: te.defaultReps ?? 8,
          defaultWeightKg: te.defaultWeightKg ?? 0,
        }
      }
    })
    return map
  }, [template])

  // Exercise list, in priority order:
  //  1. the Session Snapshot (session.exercises) — the post-ADR-0008 source of truth;
  //  2. for legacy template Sessions with no snapshot, the Template's exercise list
  //     (matches the overview, so structure stays consistent — ADR-0008: structure
  //     comes from the Template);
  //  3. freeform Sessions: derive from their logged Sets.
  // Removed Sets (removedAt != null) are hidden throughout.
  const exercises = useMemo(() => {
    const liveSets = (exId: string) =>
      (session?.sets ?? [])
        .filter((s: WorkoutSet) => s.exerciseId === exId && s.removedAt == null)
        .sort((a, b) => a.setNumber - b.setNumber || a.id.localeCompare(b.id))

    const fromTemplateDefaults = (exId: string) => ({
      id: exId,
      name: exerciseNameMap[exId] ?? 'Exercise',
      defaultSets: templateDefaults[exId]?.defaultSets ?? 0,
      defaultReps: templateDefaults[exId]?.defaultReps ?? 8,
      defaultWeightKg: templateDefaults[exId]?.defaultWeightKg ?? 0,
      loggedSets: liveSets(exId),
    })

    const snapshot = session?.exercises ?? []
    if (snapshot.length > 0) {
      return snapshot
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(se => fromTemplateDefaults(se.exerciseId))
    }
    // Legacy template Session with no snapshot: use the Template's exercise list so
    // the logger shows every exercise the overview does (incl. ones not yet logged).
    if (template) {
      return template.exercises
        .filter(te => te.exerciseId)
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(te => fromTemplateDefaults(te.exerciseId!))
    }
    if (!session?.sets) { return [] }
    const ids = [...new Set(session.sets.filter((s: WorkoutSet) => s.removedAt == null).map((s: WorkoutSet) => s.exerciseId))]
    return ids.map(id => fromTemplateDefaults(id))
  }, [session, template, templateDefaults, exerciseNameMap])

  // The Active Exercise is whatever the URL points at — honored literally, never
  // auto-picked (ADR-0009). currentExercise is the Exercise whose id matches
  // ?exercise, or undefined. No positional fallback (that flickered on refresh).
  const currentExercise = activeExerciseId ? exercises.find(e => e.id === activeExerciseId) : undefined
  const activeExerciseIndex = currentExercise ? exercises.findIndex(e => e.id === activeExerciseId) : -1
  const nextExerciseData = activeExerciseIndex >= 0 && activeExerciseIndex < exercises.length - 1 ? exercises[activeExerciseIndex + 1] : null

  // The exercise list is final once the Session and (for template Sessions without
  // a Snapshot) its Template have settled. Judging a present param "invalid" before
  // then would misfire on a slow load.
  const hasSnapshot = (session?.exercises?.length ?? 0) > 0
  const structureLoaded = !!session && (hasSnapshot || !session.templateId || !!template || templateError)

  // No Active Exercise to show and exercises exist to choose from → go to the
  // overview. Suppressed while the picker is open or a freeform pick is pending
  // (those are "choosing"), and while a fresh freeform Session has no exercises yet.
  const shouldRedirectToOverview =
    structureLoaded && exercises.length > 0 && !currentExercise && !pendingSelection && !showPicker

  // Freeform exercise navigation, URL-driven. Past the last Exercise, "Next"
  // opens the picker to add a new one.
  const prevExercise = () => {
    if (activeExerciseIndex > 0) { goToExercise(exercises[activeExerciseIndex - 1].id, { replace: true }) }
  }
  const nextExercise = () => {
    if (activeExerciseIndex < exercises.length - 1) { goToExercise(exercises[activeExerciseIndex + 1].id, { replace: true }) }
    else { setShowPicker(true) }
  }
  const loggedCount = currentExercise?.loggedSets.length ?? 0
  const doneCount = currentExercise?.loggedSets.filter((s: WorkoutSet) => s.done).length ?? 0

  // Last finished Session's Sets for this Exercise — drives the "vs last time" summary.
  const { prevSets, prepopulated } = usePrepopulatedSet(currentExercise)

  const workoutSeconds = useElapsedSeconds(session?.startedAt)

  const isTemplateBased = !!session?.templateId

  // Optimistic: a tap must recolor the row instantly, even on a slow connection —
  // the cache is flipped in onMutate and rolled back if the server rejects it.
  const toggleDone = useMutation({
    mutationFn: ({ setId, done }: { setId: string; done: boolean }) =>
      setsApi.updateSet(sessionId, setId, { done }),
    onMutate: async ({ setId, done }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.session(sessionId) })
      const previous = queryClient.getQueryData<SessionWithSets>(queryKeys.session(sessionId))
      queryClient.setQueryData<SessionWithSets>(queryKeys.session(sessionId), old =>
        old ? { ...old, sets: old.sets.map(s => (s.id === setId ? { ...s, done } : s)) } : old,
      )
      if (done && isTemplateBased && currentExercise) {
        const allDone =
          currentExercise.loggedSets.length > 0 &&
          currentExercise.loggedSets.every(s => s.id === setId || s.done)
        if (allDone) { setAllDoneOpen(true) }
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) { queryClient.setQueryData(queryKeys.session(sessionId), context.previous) }
      setAllDoneOpen(false)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
    },
  })

  const deleteSet = useMutation({
    mutationFn: (setId: string) => setsApi.deleteSet(sessionId, setId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
    },
  })

  // Add a Set to the current Exercise, carrying the last Set's numbers forward.
  const addSet = useMutation({
    mutationFn: async () => {
      const exId = currentExercise?.id ?? pendingSelection?.id
      if (!exId) { throw new Error('No exercise selected') }
      const last = currentExercise?.loggedSets.at(-1)
      await setsApi.logSet(sessionId, {
        exerciseId: exId,
        setNumber: (currentExercise?.loggedSets.length ?? 0) + 1,
        reps: last?.reps ?? prepopulated.reps,
        weightKg: last?.weightKg ?? prepopulated.weightKg,
        done: false,
      })
      return exId
    },
    onSuccess: exId => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
      if ('vibrate' in navigator) { navigator.vibrate(50) }
      setPendingSelection(null)
      // A brand-new freeform Exercise now has an id — pin it to the URL.
      if (exId && exId !== activeExerciseId) { goToExercise(exId, { replace: true }) }
    },
  })

  const updateSet = useMutation({
    mutationFn: ({ setId, data }: { setId: string; data: { weightKg: number; reps: number } }) =>
      setsApi.updateSet(sessionId, setId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
    },
  })

  const finishWorkout = useMutation({
    mutationFn: () => workoutsApi.finishSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeSession() })
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      navigate({ to: '/dashboard' })
    },
  })

  const canAddSet = isTemplateBased ? !!currentExercise : !!(pendingSelection?.id ?? currentExercise?.id)

  // Pick from the ExercisePicker: an Exercise already in this Session → pin it;
  // otherwise hold the ephemeral selection until its first Set is logged (it has
  // no id in the list yet).
  const handlePickerSelect = (id: string, name: string) => {
    setShowPicker(false)
    if (exercises.some(e => e.id === id)) {
      goToExercise(id, { replace: true })
    } else {
      setPendingSelection({ id, name })
    }
  }

  // Show a loader (never a positional fallback) until we can render the exact
  // Exercise the URL names, or until the redirect-to-overview takes effect.
  const resolving = !!activeExerciseId && !currentExercise && !structureLoaded && !pendingSelection

  return {
    session,
    exercises,
    currentExercise,
    activeExerciseIndex,
    nextExerciseData,
    isTemplateBased,
    structureLoaded,
    shouldRedirectToOverview,
    resolving,
    loggedCount,
    doneCount,
    canAddSet,
    workoutSeconds,
    prevSets,
    wgerIdMap,
    pendingSelection,
    // UI toggles
    showPicker,
    setShowPicker,
    mediaOpen,
    setMediaOpen,
    allDoneOpen,
    setAllDoneOpen,
    // actions
    navigate,
    prevExercise,
    nextExercise,
    handlePickerSelect,
    toggleDone,
    deleteSet,
    addSet,
    updateSet,
    finishWorkout,
  }
}
