import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PREFERENCES_KEY = 'gymtracker-preferences'

/**
 * Load a fresh i18n instance. We reset the module registry first so both the
 * zustand preferences store and the i18next singleton are re-created and
 * re-hydrated from the current localStorage contents.
 */
async function loadFreshI18n() {
  vi.resetModules()
  const mod = await import('./i18n')
  return mod.default
}

describe('i18n foundation', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('resolves to Ukrainian by default when no language is stored', async () => {
    const i18n = await loadFreshI18n()
    expect(i18n.language).toBe('uk')
    expect(i18n.t('home', { ns: 'nav' })).toBe('Головна')
  })

  it('switches resource resolution when the language changes to English', async () => {
    const i18n = await loadFreshI18n()
    await i18n.changeLanguage('en')
    expect(i18n.language).toBe('en')
    expect(i18n.t('home', { ns: 'nav' })).toBe('Home')
    expect(i18n.t('weightUnits', { ns: 'settings' })).toBe('Weight Units')
  })

  it('restores a previously persisted language on a fresh init', async () => {
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ state: { language: 'en' }, version: 0 }),
    )
    const i18n = await loadFreshI18n()
    expect(i18n.language).not.toBe('uk')
    expect(i18n.language).toBe('en')
    expect(i18n.t('home', { ns: 'nav' })).toBe('Home')
  })
})
