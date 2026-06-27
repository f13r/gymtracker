import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import enBody from './en/body.json'
import enDashboard from './en/dashboard.json'
import enExercises from './en/exercises.json'
import enPhotos from './en/photos.json'
import enStats from './en/stats.json'
import ukBody from './uk/body.json'
import ukDashboard from './uk/dashboard.json'
import ukExercises from './uk/exercises.json'
import ukPhotos from './uk/photos.json'
import ukStats from './uk/stats.json'

type Json = Record<string, unknown>

// i18next plural suffixes are language-specific (English: one/other;
// Ukrainian: one/few/many/other), so an exact key-set comparison would wrongly
// fail. We normalize every plural-suffixed key down to its base key before
// comparing, so `exercisesPlanned_one`/`_few`/`_many`/`_other` all collapse to
// `exercisesPlanned` and parity is asserted on the base keys.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

function flattenKeys(obj: Json, prefix = ''): Set<string> {
  const keys = new Set<string>()
  for (const [rawKey, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${rawKey}` : rawKey
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of flattenKeys(value as Json, path)) {
        keys.add(nested)
      }
    } else {
      keys.add(path.replace(PLURAL_SUFFIX, ''))
    }
  }
  return keys
}

const NAMESPACES = {
  dashboard: { uk: ukDashboard, en: enDashboard },
  exercises: { uk: ukExercises, en: enExercises },
  stats: { uk: ukStats, en: enStats },
  body: { uk: ukBody, en: enBody },
  photos: { uk: ukPhotos, en: enPhotos },
} as const

describe('overview namespace key parity (uk ↔ en)', () => {
  for (const [ns, pair] of Object.entries(NAMESPACES)) {
    it(`${ns}: uk and en have identical (plural-normalized) key sets`, () => {
      const ukKeys = flattenKeys(pair.uk as Json)
      const enKeys = flattenKeys(pair.en as Json)

      const missingInEn = [...ukKeys].filter(k => !enKeys.has(k)).sort()
      const missingInUk = [...enKeys].filter(k => !ukKeys.has(k)).sort()

      expect(missingInEn, `keys present in uk/${ns} but missing in en/${ns}`).toEqual([])
      expect(missingInUk, `keys present in en/${ns} but missing in uk/${ns}`).toEqual([])
    })
  }

  it('dashboard: pluralized key carries the required variants per language', () => {
    expect(Object.keys(enDashboard)).toEqual(
      expect.arrayContaining(['exercisesPlanned_one', 'exercisesPlanned_other']),
    )
    expect(Object.keys(ukDashboard)).toEqual(
      expect.arrayContaining([
        'exercisesPlanned_one',
        'exercisesPlanned_few',
        'exercisesPlanned_many',
        'exercisesPlanned_other',
      ]),
    )
  })
})

describe('overview routes have no hardcoded user-facing literals', () => {
  const routeDir = join(import.meta.dirname, '..', 'routes')

  // Literals that were moved into JSON in Steps 3–4 — they must no longer appear
  // as quoted string literals in the corresponding source file.
  const FORBIDDEN: Record<string, string[]> = {
    'dashboard.tsx': [
      'Good morning',
      'Active workout',
      'Finish Workout',
      'No exercises yet',
      'START WORKOUT',
      'No workouts yet. Start your first one!',
    ],
    'exercises.tsx': ['Library', 'Search exercises...', 'No exercises found', 'Add exercise', 'Barbell'],
    'stats.tsx': ['Personal Records', 'Volume Over Time', 'Body Weight', 'Weekly Frequency', 'day streak'],
    'body.tsx': ['Latest weight', 'My Profile', 'Save profile', 'Weight in kg', 'Training days'],
    'photos.tsx': ['Add Photo', 'No photos yet', 'Delete photo?', 'Upload Photo'],
  }

  for (const [file, literals] of Object.entries(FORBIDDEN)) {
    it(`${file}: removed English literals are gone and useTranslation is used`, () => {
      const source = readFileSync(join(routeDir, file), 'utf8')
      expect(source).toContain('useTranslation')
      for (const literal of literals) {
        expect(source, `"${literal}" should no longer be a hardcoded literal in ${file}`).not.toContain(
          `'${literal}'`,
        )
        expect(source, `"${literal}" should no longer be a hardcoded literal in ${file}`).not.toContain(
          `"${literal}"`,
        )
        expect(source, `"${literal}" should no longer be a hardcoded literal in ${file}`).not.toContain(
          `>${literal}<`,
        )
      }
    })
  }
})
