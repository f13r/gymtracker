/**
 * Import a FitNotes CSV export into GymTracker.
 *
 *   node -r dotenv/config dist/scripts/import-fitnotes.js <file.csv>            # dry-run
 *   node -r dotenv/config dist/scripts/import-fitnotes.js <file.csv> --commit   # write
 *
 * Dry-run (default) prints a report and touches nothing. --commit writes exercises, one
 * session per date, and all sets. Re-runnable: dates already imported (sessions tagged
 * "Imported from FitNotes") are skipped, so a second run won't duplicate history.
 *
 * Parsing/transform logic lives in ./fitnotes-parser (pure, unit-tested).
 */

import { Pool } from 'pg'

import { buildImportPlan, parseFitnotesCsv, type ImportPlan } from './fitnotes-parser'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'

const USER_ID = 'default-user'
const IMPORT_TAG = 'Imported from FitNotes'

/** "YYYY-MM-DD" → Unix seconds at local noon (avoids timezone date-shift). */
function dateToNoonEpoch(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Math.floor(new Date(y, m - 1, d, 12, 0, 0).getTime() / 1000)
}

function printReport(plan: ImportPlan): void {
  const r = plan.report
  console.log('\n── FitNotes import report ──')
  console.log(
    `Rows:        ${r.totalRows} total → ${r.keptRows} kept, ${r.skippedRows} skipped (no reps/weight/duration)`,
  )
  console.log(`Exercises:   ${plan.exercises.length} to ensure`)
  console.log(`Sessions:    ${plan.sessions.length} (one per date)`)
  console.log(`Sets:        ${plan.sets.length}`)
  console.log(`Comments:    ${r.commentsKept} kept (per-set notes)`)
  if (r.dateRange) {
    console.log(`Date range:  ${r.dateRange.from} .. ${r.dateRange.to}`)
  }
  if (r.droppedExercises.length) {
    console.log(`Dropped (all rows empty): ${r.droppedExercises.join(', ')}`)
  }
  if (r.unknownCategories.length) {
    console.log(`⚠ Unknown categories → 'other': ${r.unknownCategories.join(', ')}`)
  }
  console.log('\nExercises (name → category):')
  for (const e of plan.exercises) {
    console.log(`  • ${e.name} → ${e.category}`)
  }
}

async function commit(plan: ImportPlan): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/gymtracker',
  })
  try {
    // Ensure the user exists (matches reset.ts seeding).
    await pool.query(
      `INSERT INTO users (id, display_name, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [USER_ID, 'Viktor', Math.floor(Date.now() / 1000)],
    )

    // Ensure exercises: reuse existing by case-insensitive name, else create.
    const existing = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM exercises WHERE user_id = $1`,
      [USER_ID],
    )
    const exerciseIdByName = new Map<string, string>()
    for (const row of existing.rows) {
      exerciseIdByName.set(row.name.trim().toLowerCase(), row.id)
    }

    const now = Math.floor(Date.now() / 1000)
    let createdExercises = 0
    for (const ex of plan.exercises) {
      const key = ex.name.trim().toLowerCase()
      if (exerciseIdByName.has(key)) {
        continue
      }
      const id = randomUUID()
      await pool.query(
        `INSERT INTO exercises (id, user_id, name, category, equipment_type, is_default, created_at)
         VALUES ($1, $2, $3, $4, NULL, 0, $5)`,
        [id, USER_ID, ex.name, ex.category, now],
      )
      exerciseIdByName.set(key, id)
      createdExercises++
    }

    // Idempotency: which dates already have an imported session?
    const imported = await pool.query<{ started_at: number }>(
      `SELECT started_at FROM workout_sessions WHERE user_id = $1 AND notes LIKE $2`,
      [USER_ID, `${IMPORT_TAG}%`],
    )
    const importedEpochs = new Set(imported.rows.map(row => Number(row.started_at)))

    // Group planned sets by date for per-session insertion.
    const setsByDate = new Map<string, typeof plan.sets>()
    for (const s of plan.sets) {
      const list = setsByDate.get(s.date) ?? []
      list.push(s)
      setsByDate.set(s.date, list)
    }

    let createdSessions = 0
    let createdSets = 0
    let skippedSessions = 0
    for (const session of plan.sessions) {
      const epoch = dateToNoonEpoch(session.date)
      if (importedEpochs.has(epoch)) {
        skippedSessions++
        continue
      }

      const sessionId = randomUUID()
      await pool.query(
        `INSERT INTO workout_sessions (id, user_id, name, started_at, finished_at, notes)
         VALUES ($1, $2, $3, $4, $4, $5)`,
        [sessionId, USER_ID, session.name, epoch, IMPORT_TAG],
      )
      createdSessions++

      for (const s of setsByDate.get(session.date) ?? []) {
        const exerciseId = exerciseIdByName.get(s.exerciseName.trim().toLowerCase())!
        await pool.query(
          `INSERT INTO sets (id, session_id, exercise_id, set_number, reps, weight_kg, duration_sec, completed_at, done, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9)`,
          [randomUUID(), sessionId, exerciseId, s.setNumber, s.reps, s.weightKg, s.durationSec, epoch, s.notes],
        )
        createdSets++
      }
    }

    console.log('\n── Committed ──')
    console.log(`Exercises created: ${createdExercises} (others already existed)`)
    console.log(
      `Sessions created:  ${createdSessions}${skippedSessions ? `, skipped ${skippedSessions} already-imported` : ''}`,
    )
    console.log(`Sets created:      ${createdSets}`)
  } finally {
    await pool.end()
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const isCommit = args.includes('--commit')
  const file = args.find(a => !a.startsWith('--'))
  if (!file) {
    console.error('Usage: import-fitnotes <file.csv> [--commit]')
    process.exit(1)
  }

  const text = readFileSync(file, 'utf8')
  const plan = buildImportPlan(parseFitnotesCsv(text))
  printReport(plan)

  if (!isCommit) {
    console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.\n')
    return
  }
  await commit(plan)
  console.log('Done.\n')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
