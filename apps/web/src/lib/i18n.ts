import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enAilog from '@/locales/en/ailog.json'
import enAuth from '@/locales/en/auth.json'
import enBody from '@/locales/en/body.json'
import enCommon from '@/locales/en/common.json'
import enDashboard from '@/locales/en/dashboard.json'
import enEquipment from '@/locales/en/equipment.json'
import enExercises from '@/locales/en/exercises.json'
import enGym from '@/locales/en/gym.json'
import enHistory from '@/locales/en/history.json'
import enNav from '@/locales/en/nav.json'
import enOnboarding from '@/locales/en/onboarding.json'
import enProgram from '@/locales/en/program.json'
import enSettings from '@/locales/en/settings.json'
import enStats from '@/locales/en/stats.json'
import enTrainer from '@/locales/en/trainer.json'
import enWorkout from '@/locales/en/workout.json'
import ukAilog from '@/locales/uk/ailog.json'
import ukAuth from '@/locales/uk/auth.json'
import ukBody from '@/locales/uk/body.json'
import ukCommon from '@/locales/uk/common.json'
import ukDashboard from '@/locales/uk/dashboard.json'
import ukEquipment from '@/locales/uk/equipment.json'
import ukExercises from '@/locales/uk/exercises.json'
import ukGym from '@/locales/uk/gym.json'
import ukHistory from '@/locales/uk/history.json'
import ukNav from '@/locales/uk/nav.json'
import ukOnboarding from '@/locales/uk/onboarding.json'
import ukProgram from '@/locales/uk/program.json'
import ukSettings from '@/locales/uk/settings.json'
import ukStats from '@/locales/uk/stats.json'
import ukTrainer from '@/locales/uk/trainer.json'
import ukWorkout from '@/locales/uk/workout.json'
import { type Language, usePreferencesStore } from '@/stores/preferences.store'

/**
 * i18n foundation for the web app.
 *
 * Persistence approach (single mechanism): the chosen language lives in the
 * existing zustand `preferences.store` (localStorage key `gymtracker-preferences`).
 * On init we read `usePreferencesStore.getState().language` (which defaults to
 * 'uk' when nothing is stored), and we mirror every `changeLanguage` back into
 * the store via the `languageChanged` listener. There is NO separate i18next
 * language-detector cache — the store is the only source of truth so the
 * default is always Ukrainian, never the browser language.
 *
 * Locale convention: namespace-per-feature. Each JSON file under
 * `src/locales/{uk,en}/<namespace>.json` is one namespace (`common`, `nav`,
 * `settings`, ...). Reference strings with `useTranslation('<ns>')` + `t('key')`
 * or the explicit `t('<ns>:key')` form. New feature namespaces can be added as
 * new files + a `resources` entry without touching other namespaces.
 */

export const SUPPORTED_LANGUAGES = ['uk', 'en'] as const
export const FALLBACK_LANGUAGE: Language = 'uk'
export const I18N_NAMESPACES = [
  'common',
  'nav',
  'settings',
  'workout',
  'equipment',
  'auth',
  'exercises',
  'trainer',
  'dashboard',
  'onboarding',
  'program',
  'history',
  'body',
  'stats',
  'gym',
  'ailog',
] as const
export const DEFAULT_NS = 'common'

export const resources = {
  uk: {
    common: ukCommon,
    nav: ukNav,
    settings: ukSettings,
    workout: ukWorkout,
    equipment: ukEquipment,
    auth: ukAuth,
    exercises: ukExercises,
    trainer: ukTrainer,
    dashboard: ukDashboard,
    onboarding: ukOnboarding,
    program: ukProgram,
    history: ukHistory,
    body: ukBody,
    stats: ukStats,
    gym: ukGym,
    ailog: ukAilog,
  },
  en: {
    common: enCommon,
    nav: enNav,
    settings: enSettings,
    workout: enWorkout,
    equipment: enEquipment,
    auth: enAuth,
    exercises: enExercises,
    trainer: enTrainer,
    dashboard: enDashboard,
    onboarding: enOnboarding,
    program: enProgram,
    history: enHistory,
    body: enBody,
    stats: enStats,
    gym: enGym,
    ailog: enAilog,
  },
} as const

const storedLanguage = usePreferencesStore.getState().language

void i18n.use(initReactI18next).init({
  defaultNS: DEFAULT_NS,
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false },
  lng: storedLanguage,
  load: 'currentOnly',
  ns: [...I18N_NAMESPACES],
  resources,
  returnNull: false,
  supportedLngs: [...SUPPORTED_LANGUAGES],
})

// Mirror language changes back into the single persistence mechanism (store).
i18n.on('languageChanged', lng => {
  const next = (SUPPORTED_LANGUAGES as readonly string[]).includes(lng) ? (lng as Language) : FALLBACK_LANGUAGE
  if (usePreferencesStore.getState().language !== next) {
    usePreferencesStore.getState().setLanguage(next)
  }
})

export default i18n
