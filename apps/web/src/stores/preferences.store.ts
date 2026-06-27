import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Supported UI languages. Kept as a local union (rather than imported from
// lib/i18n) to avoid a circular import — i18n.ts reads this store on init.
export type Language = 'uk' | 'en'

interface PreferencesStore {
  unit: 'kg' | 'lb'
  inputModes: Record<string, 'wheel' | 'buttons'>
  restTimerSeconds: number
  language: Language
  setUnit: (unit: 'kg' | 'lb') => void
  setInputMode: (fieldKey: string, mode: 'wheel' | 'buttons') => void
  setRestTimer: (seconds: number) => void
  setLanguage: (language: Language) => void
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    set => ({
      unit: 'kg',
      inputModes: {},
      restTimerSeconds: 90,
      // Default UI language is Ukrainian; first load with no stored value resolves to 'uk'.
      language: 'uk',
      setUnit: unit => set({ unit }),
      setInputMode: (fieldKey, mode) => set(s => ({ inputModes: { ...s.inputModes, [fieldKey]: mode } })),
      setRestTimer: restTimerSeconds => set({ restTimerSeconds }),
      setLanguage: language => set({ language }),
    }),
    { name: 'gymtracker-preferences' },
  ),
)
