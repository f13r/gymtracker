import { Pool } from 'pg'

import { assertUserExists, requireUserArg } from './script-args'
import { randomUUID } from 'crypto'

// Exercises with notes only on those that get warmup sets (defaultSets = 4)
const USER_EXERCISES: Array<{
  name: string
  category: string
  equipmentType: string
  notes?: string
}> = [
  // Push Day — Chest
  { name: 'Incline Dumbbell Bench Press', category: 'push', equipmentType: 'dumbbell', notes: 'First set is warmup' },
  { name: 'Flat Dumbbell Bench Press', category: 'push', equipmentType: 'dumbbell' },
  { name: 'Incline Chest Press (Machine)', category: 'push', equipmentType: 'machine' },
  { name: 'Cable Crossover', category: 'push', equipmentType: 'cable' },
  // Push Day — Triceps
  { name: 'Cable Tricep Pushdown (Rope)', category: 'push', equipmentType: 'cable' },
  { name: 'Seated Tricep Machine', category: 'push', equipmentType: 'machine' },
  // Shared core
  { name: 'Decline Bench Crunch', category: 'core', equipmentType: 'bodyweight' },
  // Pull Day — Back
  { name: 'Pull-Ups', category: 'pull', equipmentType: 'bodyweight', notes: 'First set is warmup' },
  { name: 'Lat Pulldown (Wide Grip)', category: 'pull', equipmentType: 'cable' },
  { name: 'Seated Cable Row (Close Grip)', category: 'pull', equipmentType: 'cable' },
  { name: 'Machine Row', category: 'pull', equipmentType: 'machine' },
  // Pull Day — Biceps
  { name: 'EZ-Bar Curl', category: 'pull', equipmentType: 'barbell' },
  { name: 'Incline Dumbbell Curl', category: 'pull', equipmentType: 'dumbbell' },
  { name: 'Cable Curl', category: 'pull', equipmentType: 'cable' },
  // Legs+Shoulders Day — Legs
  { name: 'Leg Press', category: 'legs', equipmentType: 'machine', notes: 'First set is warmup' },
  { name: 'Hack Squat', category: 'legs', equipmentType: 'machine' },
  { name: 'Lying Leg Curl', category: 'legs', equipmentType: 'machine' },
  { name: 'Smith Machine Romanian Deadlift', category: 'legs', equipmentType: 'barbell' },
  // Legs+Shoulders Day — Shoulders
  { name: 'Overhead Press (Machine)', category: 'push', equipmentType: 'machine', notes: 'First set is warmup' },
  { name: 'Dumbbell Lateral Raise', category: 'push', equipmentType: 'dumbbell' },
  // Legs+Shoulders Day — Calves
  { name: 'Calf Raise', category: 'legs', equipmentType: 'machine' },
]

const TEMPLATES: Array<{
  name: string
  exercises: Array<{ name: string; orderIndex: number; defaultSets: number; defaultReps: number }>
}> = [
  {
    name: 'Push Day',
    exercises: [
      { name: 'Incline Dumbbell Bench Press', orderIndex: 0, defaultSets: 4, defaultReps: 12 },
      { name: 'Flat Dumbbell Bench Press', orderIndex: 1, defaultSets: 3, defaultReps: 12 },
      { name: 'Incline Chest Press (Machine)', orderIndex: 2, defaultSets: 3, defaultReps: 12 },
      { name: 'Cable Crossover', orderIndex: 3, defaultSets: 3, defaultReps: 12 },
      { name: 'Cable Tricep Pushdown (Rope)', orderIndex: 4, defaultSets: 3, defaultReps: 12 },
      { name: 'Seated Tricep Machine', orderIndex: 5, defaultSets: 3, defaultReps: 12 },
      { name: 'Decline Bench Crunch', orderIndex: 6, defaultSets: 3, defaultReps: 12 },
    ],
  },
  {
    name: 'Pull Day',
    exercises: [
      { name: 'Pull-Ups', orderIndex: 0, defaultSets: 4, defaultReps: 12 },
      { name: 'Lat Pulldown (Wide Grip)', orderIndex: 1, defaultSets: 3, defaultReps: 12 },
      { name: 'Seated Cable Row (Close Grip)', orderIndex: 2, defaultSets: 3, defaultReps: 12 },
      { name: 'Machine Row', orderIndex: 3, defaultSets: 3, defaultReps: 12 },
      { name: 'EZ-Bar Curl', orderIndex: 4, defaultSets: 3, defaultReps: 12 },
      { name: 'Incline Dumbbell Curl', orderIndex: 5, defaultSets: 3, defaultReps: 12 },
      { name: 'Cable Curl', orderIndex: 6, defaultSets: 3, defaultReps: 12 },
      { name: 'Decline Bench Crunch', orderIndex: 7, defaultSets: 3, defaultReps: 12 },
    ],
  },
  {
    name: 'Legs + Shoulders',
    exercises: [
      { name: 'Leg Press', orderIndex: 0, defaultSets: 4, defaultReps: 12 },
      { name: 'Hack Squat', orderIndex: 1, defaultSets: 3, defaultReps: 12 },
      { name: 'Lying Leg Curl', orderIndex: 2, defaultSets: 3, defaultReps: 12 },
      { name: 'Smith Machine Romanian Deadlift', orderIndex: 3, defaultSets: 3, defaultReps: 12 },
      { name: 'Overhead Press (Machine)', orderIndex: 4, defaultSets: 4, defaultReps: 12 },
      { name: 'Dumbbell Lateral Raise', orderIndex: 5, defaultSets: 3, defaultReps: 12 },
      { name: 'Calf Raise', orderIndex: 6, defaultSets: 3, defaultReps: 12 },
      { name: 'Decline Bench Crunch', orderIndex: 7, defaultSets: 3, defaultReps: 12 },
    ],
  },
]

// Mon=Push, Wed=Pull, Fri=Legs+Shoulders — remaining June gym days from June 9 2026
const SCHEDULES: Array<{ date: string; template: string }> = [
  { date: '2026-06-10', template: 'Pull Day' },
  { date: '2026-06-12', template: 'Legs + Shoulders' },
  { date: '2026-06-15', template: 'Push Day' },
  { date: '2026-06-17', template: 'Pull Day' },
  { date: '2026-06-19', template: 'Legs + Shoulders' },
  { date: '2026-06-22', template: 'Push Day' },
  { date: '2026-06-24', template: 'Pull Day' },
  { date: '2026-06-26', template: 'Legs + Shoulders' },
  { date: '2026-06-29', template: 'Push Day' },
]

// One User's workout data, most dependent first. Profile, body data and the household's Gym,
// Equipment and Exercises are shared or kept, so they are never deleted here.
const USER_WORKOUT_DELETES = [
  `DELETE FROM sets WHERE session_id IN (SELECT id FROM workout_sessions WHERE user_id = $1)`,
  `DELETE FROM session_exercises WHERE session_id IN (SELECT id FROM workout_sessions WHERE user_id = $1)`,
  `DELETE FROM workout_sessions WHERE user_id = $1`,
  `DELETE FROM workout_schedules WHERE user_id = $1`,
  `DELETE FROM program_phase_templates
   WHERE phase_id IN (SELECT pp.id FROM program_phases pp JOIN programs p ON p.id = pp.program_id WHERE p.user_id = $1)
      OR template_id IN (SELECT id FROM workout_templates WHERE user_id = $1)`,
  `DELETE FROM program_updates WHERE program_id IN (SELECT id FROM programs WHERE user_id = $1)`,
  `DELETE FROM program_phases WHERE program_id IN (SELECT id FROM programs WHERE user_id = $1)`,
  `DELETE FROM programs WHERE user_id = $1`,
  `DELETE FROM template_exercises WHERE template_id IN (SELECT id FROM workout_templates WHERE user_id = $1)`,
  `DELETE FROM workout_templates WHERE user_id = $1`,
  `DELETE FROM progression_suggestions WHERE user_id = $1`,
]

/** Usage: setup-workout --user <id>. Replaces that User's workout data; other Users are untouched. */
async function main() {
  const userId = requireUserArg(process.argv.slice(2))
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/gymtracker',
  })

  try {
    await assertUserExists(pool, userId)
    console.log(`Clearing workout data of User '${userId}' (keeping profile, body data, Gym and Exercises)...`)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const statement of USER_WORKOUT_DELETES) {
        await client.query(statement, [userId])
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    console.log('Workout data cleared.')

    const now = Math.floor(Date.now() / 1000)

    // Exercises are a shared library: never delete them, reuse one with the same name.
    console.log(`Ensuring ${USER_EXERCISES.length} exercises...`)
    const exerciseIds: Record<string, string> = {}
    for (const ex of USER_EXERCISES) {
      await pool.query(
        `INSERT INTO exercises (id, name, category, equipment_type, created_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT ((lower(name))) DO NOTHING`,
        [randomUUID(), ex.name, ex.category, ex.equipmentType, now],
      )
      const { rows } = await pool.query<{ id: string }>(`SELECT id FROM exercises WHERE lower(name) = lower($1)`, [
        ex.name,
      ])
      const id = rows[0]!.id
      exerciseIds[ex.name] = id
      if (ex.notes) {
        await pool.query(
          `INSERT INTO user_exercise_notes (user_id, exercise_id, notes, updated_at) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, exercise_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at`,
          [userId, id, ex.notes, now],
        )
      }
    }

    console.log('Creating 3 workout templates...')
    const templateIds: Record<string, string> = {}
    for (const tmpl of TEMPLATES) {
      const templateId = randomUUID()
      templateIds[tmpl.name] = templateId
      await pool.query(`INSERT INTO workout_templates (id, user_id, name, created_at) VALUES ($1, $2, $3, $4)`, [
        templateId,
        userId,
        tmpl.name,
        now,
      ])
      for (const ex of tmpl.exercises) {
        await pool.query(
          `INSERT INTO template_exercises (id, template_id, exercise_id, order_index, default_sets, default_reps)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), templateId, exerciseIds[ex.name], ex.orderIndex, ex.defaultSets, ex.defaultReps],
        )
      }
      console.log(`  ✓ ${tmpl.name} (${tmpl.exercises.length} exercises)`)
    }

    console.log(`Creating ${SCHEDULES.length} schedules for June 2026...`)
    for (const s of SCHEDULES) {
      await pool.query(
        `INSERT INTO workout_schedules (id, user_id, template_id, type, scheduled_date, created_at)
         VALUES ($1, $2, $3, 'once', $4, $5)`,
        [randomUUID(), userId, templateIds[s.template], s.date, now],
      )
      console.log(`  ✓ ${s.date} — ${s.template}`)
    }

    console.log(`\nDone! DB is ready for User '${userId}'s first session.`)
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
