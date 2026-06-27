import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enCommon from '@/locales/en/common.json'
import enNav from '@/locales/en/nav.json'
import enSettings from '@/locales/en/settings.json'
import ukCommon from '@/locales/uk/common.json'
import ukNav from '@/locales/uk/nav.json'
import ukSettings from '@/locales/uk/settings.json'
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
export const I18N_NAMESPACES = ['common', 'nav', 'settings'] as const
export const DEFAULT_NS = 'common'

export const resources = {
  uk: { common: ukCommon, nav: ukNav, settings: ukSettings },
  en: { common: enCommon, nav: enNav, settings: enSettings },
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
  const next = (SUPPORTED_LANGUAGES as readonly string[]).includes(lng)
    ? (lng as Language)
    : FALLBACK_LANGUAGE
  if (usePreferencesStore.getState().language !== next) {
    usePreferencesStore.getState().setLanguage(next)
  }
})

export default i18n
