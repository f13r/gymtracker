import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PreferencesStore {
  unit: 'kg' | 'lb'
  inputModes: Record<string, 'wheel' | 'buttons'>
  restTimerSeconds: number
  setUnit: (unit: 'kg' | 'lb') => void
  setInputMode: (fieldKey: string, mode: 'wheel' | 'buttons') => void
  setRestTimer: (seconds: number) => void
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    set => ({
      unit: 'kg',
      inputModes: {},
      restTimerSeconds: 90,
      setUnit: unit => set({ unit }),
      setInputMode: (fieldKey, mode) => set(s => ({ inputModes: { ...s.inputModes, [fieldKey]: mode } })),
      setRestTimer: restTimerSeconds => set({ restTimerSeconds }),
    }),
    { name: 'gymtracker-preferences' },
  ),
)
