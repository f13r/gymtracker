import { Pool } from 'pg'

import { randomUUID } from 'crypto'

const USER_ID = 'default-user'

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

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/gymtracker',
  })

  try {
    console.log('Clearing workout data (keeping profile, gym, body data)...')
    // FK-safe deletion order: most-dependent tables first
    await pool.query(`
      DELETE FROM sets;
      DELETE FROM template_exercises;
      DELETE FROM program_phase_templates;
      DELETE FROM program_updates;
      DELETE FROM workout_sessions;
      DELETE FROM workout_schedules;
      DELETE FROM program_phases;
      DELETE FROM programs;
      DELETE FROM workout_templates;
      DELETE FROM equipment_exercises;
      DELETE FROM equipment;
      DELETE FROM progression_suggestions;
      DELETE FROM exercises WHERE is_default = 0;
    `)
    console.log('Workout data cleared.')

    const now = Math.floor(Date.now() / 1000)

    console.log(`Adding ${USER_EXERCISES.length} user exercises...`)
    const exerciseIds: Record<string, string> = {}
    for (const ex of USER_EXERCISES) {
      const id = randomUUID()
      exerciseIds[ex.name] = id
      await pool.query(
        `INSERT INTO exercises (id, user_id, name, category, equipment_type, notes, is_default, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
        [id, USER_ID, ex.name, ex.category, ex.equipmentType, ex.notes ?? null, now],
      )
    }

    console.log('Creating 3 workout templates...')
    const templateIds: Record<string, string> = {}
    for (const tmpl of TEMPLATES) {
      const templateId = randomUUID()
      templateIds[tmpl.name] = templateId
      await pool.query(
        `INSERT INTO workout_templates (id, user_id, name, created_at) VALUES ($1, $2, $3, $4)`,
        [templateId, USER_ID, tmpl.name, now],
      )
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
        [randomUUID(), USER_ID, templateIds[s.template], s.date, now],
      )
      console.log(`  ✓ ${s.date} — ${s.template}`)
    }

    console.log('\nDone! DB is ready for Viktor\'s first session.')
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
