import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { NumericInput } from '@/components/inputs/NumericInput';
import { Button } from '@/components/ui/button';
import { setsApi } from '@/api/sets';
import { workoutsApi } from '@/api/workouts';
import { useWorkoutStore } from '@/stores/workout.store';
import { usePreferencesStore } from '@/stores/preferences.store';

interface WorkoutLoggerProps { sessionId: string; }

export function WorkoutLogger({ sessionId }: WorkoutLoggerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeExerciseIndex, nextExercise, prevExercise } = useWorkoutStore();
  const { restTimerSeconds } = usePreferencesStore();

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(8);
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => workoutsApi.getSession(sessionId),
  });

  const exercises = session?.sets
    ? [...new Set((session.sets as any[]).map((s: any) => s.exerciseId))].map((id) => ({
        id,
        sets: (session.sets as any[]).filter((s: any) => s.exerciseId === id),
      }))
    : [];

  const currentExercise = exercises[activeExerciseIndex];

  useEffect(() => {
    if (!currentExercise?.sets?.length) return;
    const last = currentExercise.sets.at(-1);
    if (last?.weightKg) setWeight(last.weightKg);
    if (last?.reps) setReps(last.reps);
  }, [activeExerciseIndex, currentExercise]);

  useEffect(() => {
    if (restTimer === null) return;
    const id = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, [restTimer]);

  const logSet = useMutation({
    mutationFn: () => setsApi.logSet(sessionId, {
      exerciseId: currentExercise?.id ?? exercises[0]?.id,
      setNumber: (currentExercise?.sets?.length ?? 0) + 1,
      reps,
      weightKg: weight,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      if ('vibrate' in navigator) navigator.vibrate(50);
      setRestTimer(Date.now());
      setElapsed(0);
    },
  });

  const sessionDuration = session
    ? Math.floor((Date.now() / 1000) - session.startedAt)
    : 0;
  const mm = String(Math.floor(sessionDuration / 60)).padStart(2, '0');
  const ss = String(sessionDuration % 60).padStart(2, '0');

  const restProgress = restTimer !== null ? Math.min(elapsed / restTimerSeconds, 1) : 0;

  return (
    <div className="flex flex-col h-svh bg-background">
      {restTimer !== null && (
        <div className="h-1 bg-muted">
          <div className="h-1 bg-green-500 transition-all" style={{ width: `${restProgress * 100}%` }} />
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/dashboard' })}>← Back</Button>
        <span className="font-semibold truncate max-w-[200px]">{session?.name ?? 'Workout'}</span>
        <span className="text-muted-foreground tabular-nums">{mm}:{ss}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {currentExercise?.sets?.map((s: any, i: number) => (
          <div key={s.id} className="flex items-center justify-between py-2 border-b text-sm">
            <span className="text-muted-foreground">Set {i + 1}</span>
            <span>{s.weightKg} kg × {s.reps} ✓</span>
          </div>
        ))}
        {!currentExercise && (
          <p className="text-center text-muted-foreground py-8">Start logging sets!</p>
        )}
      </div>

      <div className="px-4 pb-2 grid grid-cols-2 gap-3">
        <NumericInput value={weight} onChange={setWeight} min={0} max={300} step={2.5} bigStep={10} unit="kg" fieldKey="weight" label="Weight" />
        <NumericInput value={reps} onChange={setReps} min={1} max={50} step={1} fieldKey="reps" label="Reps" />
      </div>

      <div className="px-4 pb-3">
        <Button
          className="w-full h-[72px] text-xl bg-green-600 hover:bg-green-700 text-white"
          onClick={() => logSet.mutate()}
          disabled={logSet.isPending}
        >
          LOG SET
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 px-4 pb-4">
        <Button variant="outline" onClick={prevExercise} disabled={activeExerciseIndex === 0}>
          ← Prev Exercise
        </Button>
        <Button variant="outline" onClick={nextExercise} disabled={activeExerciseIndex >= exercises.length - 1}>
          Next Exercise →
        </Button>
      </div>
    </div>
  );
}
