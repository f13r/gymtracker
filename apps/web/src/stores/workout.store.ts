import { create } from 'zustand';

interface WorkoutStore {
  activeSessionId: string | null;
  activeExerciseIndex: number;
  setActiveSession: (id: string | null) => void;
  nextExercise: () => void;
  prevExercise: () => void;
  resetExerciseIndex: () => void;
}

export const useWorkoutStore = create<WorkoutStore>((set) => ({
  activeSessionId: null,
  activeExerciseIndex: 0,
  setActiveSession: (id) => set({ activeSessionId: id, activeExerciseIndex: 0 }),
  nextExercise: () => set((s) => ({ activeExerciseIndex: s.activeExerciseIndex + 1 })),
  prevExercise: () => set((s) => ({ activeExerciseIndex: Math.max(0, s.activeExerciseIndex - 1) })),
  resetExerciseIndex: () => set({ activeExerciseIndex: 0 }),
}));
