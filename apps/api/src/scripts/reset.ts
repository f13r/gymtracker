import { Pool } from 'pg'

import { randomUUID } from 'crypto'

const DEFAULT_EXERCISES = [
  { name: 'Bench Press', category: 'push', equipmentType: 'barbell' },
  { name: 'Squat', category: 'legs', equipmentType: 'barbell' },
  { name: 'Deadlift', category: 'pull', equipmentType: 'barbell' },
  { name: 'Overhead Press', category: 'push', equipmentType: 'barbell' },
  { name: 'Barbell Row', category: 'pull', equipmentType: 'barbell' },
  { name: 'Romanian Deadlift', category: 'legs', equipmentType: 'barbell' },
  { name: 'Front Squat', category: 'legs', equipmentType: 'barbell' },
  { name: 'Incline Bench Press', category: 'push', equipmentType: 'barbell' },
  { name: 'Dumbbell Press', category: 'push', equipmentType: 'dumbbell' },
  { name: 'Dumbbell Row', category: 'pull', equipmentType: 'dumbbell' },
  { name: 'Lateral Raise', category: 'push', equipmentType: 'dumbbell' },
  { name: 'Bicep Curl', category: 'pull', equipmentType: 'dumbbell' },
  { name: 'Tricep Extension', category: 'push', equipmentType: 'dumbbell' },
  { name: 'Dumbbell Lunge', category: 'legs', equipmentType: 'dumbbell' },
  { name: 'Bulgarian Split Squat', category: 'legs', equipmentType: 'dumbbell' },
  { name: 'Leg Press', category: 'legs', equipmentType: 'machine' },
  { name: 'Leg Curl', category: 'legs', equipmentType: 'machine' },
  { name: 'Leg Extension', category: 'legs', equipmentType: 'machine' },
  { name: 'Cable Row', category: 'pull', equipmentType: 'cable' },
  { name: 'Lat Pulldown', category: 'pull', equipmentType: 'cable' },
  { name: 'Chest Fly', category: 'push', equipmentType: 'machine' },
  { name: 'Cable Lateral Raise', category: 'push', equipmentType: 'cable' },
  { name: 'Pull-up', category: 'pull', equipmentType: 'bodyweight' },
  { name: 'Chin-up', category: 'pull', equipmentType: 'bodyweight' },
  { name: 'Push-up', category: 'push', equipmentType: 'bodyweight' },
  { name: 'Dip', category: 'push', equipmentType: 'bodyweight' },
  { name: 'Plank', category: 'core', equipmentType: 'bodyweight' },
  { name: 'Hollow Hold', category: 'core', equipmentType: 'bodyweight' },
  { name: 'Running', category: 'cardio', equipmentType: 'other' },
  { name: 'Cycling', category: 'cardio', equipmentType: 'other' },
  { name: 'Rowing (erg)', category: 'cardio', equipmentType: 'other' },
  { name: 'Jump Rope', category: 'cardio', equipmentType: 'other' },
]

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/gymtracker',
  })

  try {
    // Erases the WHOLE household: every User's data, the shared Gym, Equipment and Exercise library.
    // Only the users rows (the sign-in allowlist, provisioned by migration) are kept.
    console.log('Erasing all household data (every User; keeping the users allowlist)...')
    // Delete in FK-safe order (most dependent first)
    await pool.query(`
      DELETE FROM sets;
      DELETE FROM session_exercises;
      DELETE FROM template_exercises;
      DELETE FROM program_phase_templates;
      DELETE FROM program_updates;
      DELETE FROM workout_sessions;
      DELETE FROM program_phases;
      DELETE FROM programs;
      DELETE FROM workout_schedules;
      DELETE FROM workout_templates;
      DELETE FROM equipment_exercises;
      DELETE FROM equipment;
      DELETE FROM gyms;
      DELETE FROM progression_suggestions;
      DELETE FROM user_exercise_notes;
      DELETE FROM exercises;
      DELETE FROM body_weights;
      DELETE FROM body_measurements;
      DELETE FROM progress_photos;
      DELETE FROM user_profiles;
    `)
    console.log('Household data erased.')

    console.log(`Seeding ${DEFAULT_EXERCISES.length} default exercises...`)
    const now = Math.floor(Date.now() / 1000)
    for (const ex of DEFAULT_EXERCISES) {
      await pool.query(
        `INSERT INTO exercises (id, name, category, equipment_type, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), ex.name, ex.category, ex.equipmentType, now],
      )
    }

    console.log('Done.')
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
