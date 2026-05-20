import { pgTable, text, integer, real, primaryKey, uniqueIndex, customType } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const exercises = pgTable('exercises', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  category: text('category'),
  equipmentType: text('equipment_type'),
  notes: text('notes'),
  isDefault: integer('is_default').default(0),
  createdAt: integer('created_at').notNull(),
})

export const workoutTemplates = pgTable('workout_templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
})

export const templateExercises = pgTable('template_exercises', {
  id: text('id').primaryKey(),
  templateId: text('template_id').references(() => workoutTemplates.id),
  exerciseId: text('exercise_id').references(() => exercises.id),
  orderIndex: integer('order_index').notNull(),
  defaultSets: integer('default_sets'),
  defaultReps: integer('default_reps'),
  defaultWeightKg: real('default_weight_kg'),
  equipmentId: text('equipment_id').references(() => equipment.id, { onDelete: 'set null' }),
})

export const workoutSessions = pgTable('workout_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  templateId: text('template_id').references(() => workoutTemplates.id),
  programPhaseId: text('program_phase_id').references(() => programPhases.id), // nullable FK
  name: text('name').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  notes: text('notes'),
})

export const sets = pgTable('sets', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => workoutSessions.id),
  exerciseId: text('exercise_id').references(() => exercises.id),
  setNumber: integer('set_number').notNull(),
  reps: integer('reps'),
  weightKg: real('weight_kg'),
  durationSec: integer('duration_sec'),
  rpe: real('rpe'),
  completedAt: integer('completed_at'),
  done: integer('done').default(0),
  equipmentId: text('equipment_id').references(() => equipment.id, { onDelete: 'set null' }),
})

export const bodyWeights = pgTable('body_weights', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  weightKg: real('weight_kg').notNull(),
  recordedAt: integer('recorded_at').notNull(),
  notes: text('notes'),
})

export const bodyMeasurements = pgTable('body_measurements', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  recordedAt: integer('recorded_at').notNull(),
  chest: real('chest'),
  waist: real('waist'),
  hips: real('hips'),
  leftBicep: real('left_bicep'),
  rightBicep: real('right_bicep'),
  leftThigh: real('left_thigh'),
  rightThigh: real('right_thigh'),
  shoulders: real('shoulders'),
  neck: real('neck'),
  notes: text('notes'),
})

export const workoutSchedules = pgTable('workout_schedules', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  templateId: text('template_id').references(() => workoutTemplates.id),
  type: text('type', { enum: ['once', 'weekly'] }).notNull(),
  scheduledDate: text('scheduled_date'),
  dayOfWeek: integer('day_of_week'),
  createdAt: integer('created_at').notNull(),
})

export const progressPhotos = pgTable('progress_photos', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  recordedAt: integer('recorded_at').notNull(),
  filePath: text('file_path').notNull(),
  thumbPath: text('thumb_path').notNull(),
  bodyWeight: real('body_weight'),
  tags: text('tags'),
  notes: text('notes'),
})

export const gyms = pgTable('gyms', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  userUnique: uniqueIndex('gyms_user_id_unique').on(t.userId),
}))

export const equipment = pgTable('equipment', {
  id: text('id').primaryKey(),
  gymId: text('gym_id').references(() => gyms.id),
  name: text('name').notNull(),
  equipmentType: text('equipment_type'),
  description: text('description'),
  tags: text('tags'),
  photoPath: text('photo_path').notNull(),
  thumbPath: text('thumb_path').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const equipmentExercises = pgTable('equipment_exercises', {
  equipmentId: text('equipment_id').notNull().references(() => equipment.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id').notNull().references(() => exercises.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.equipmentId, t.exerciseId] }),
}))

export const userProfiles = pgTable('user_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id),
  age: integer('age'),
  heightCm: integer('height_cm'),
  experienceLevel: text('experience_level'), // 'beginner' | 'intermediate' | 'advanced'
  goal: text('goal'),                         // 'hypertrophy' | 'strength' | 'powerlifting' | 'general'
  trainingPhase: text('training_phase'),       // 'accumulation' | 'strength' | 'peaking' | 'maintenance'
  trainingDays: text('training_days'),         // JSON: string[] e.g. ["monday","wednesday","friday"]
  sessionDurationMinutes: integer('session_duration_minutes'),
  updatedAt: integer('updated_at').notNull(),
})

const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() { return `vector(${dimensions})` },
    toDriver(value: number[]): string { return `[${value.join(',')}]` },
    fromDriver(value: string): number[] { return value.slice(1, -1).split(',').map(Number) },
  })(name)

export const coachingKnowledge = pgTable('coaching_knowledge', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', 768).notNull(),
})

export const progressionSuggestions = pgTable('progression_suggestions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  exerciseId: text('exercise_id').notNull().references(() => exercises.id),
  suggestedSets: integer('suggested_sets').notNull(),
  suggestedReps: integer('suggested_reps').notNull(),
  suggestedWeightKg: real('suggested_weight_kg').notNull(),
  reason: text('reason').notNull(),
  evidence: text('evidence').notNull(), // JSON.stringify(string[])
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  userExercise: uniqueIndex('progression_suggestions_user_exercise').on(t.userId, t.exerciseId),
}))

export const programs = pgTable('programs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  goal: text('goal').notNull(),
  experienceLevel: text('experience_level').notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'completed' | 'abandoned'
  createdAt: integer('created_at').notNull(),
})

export const programPhases = pgTable('program_phases', {
  id: text('id').primaryKey(),
  programId: text('program_id').notNull().references(() => programs.id),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'accumulation' | 'strength' | 'peaking' | 'maintenance'
  orderIndex: integer('order_index').notNull(),
  targetSessionCount: integer('target_session_count').notNull(),
  completedSessionCount: integer('completed_session_count').notNull().default(0),
  splitType: text('split_type').notNull(), // 'full_body' | 'upper_lower' | 'push_pull_legs'
  rationale: text('rationale').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'completed'
})

export const programPhaseTemplates = pgTable('program_phase_templates', {
  id: text('id').primaryKey(),
  phaseId: text('phase_id').notNull().references(() => programPhases.id),
  templateId: text('template_id').notNull().references(() => workoutTemplates.id),
  dayLabel: text('day_label').notNull(), // 'A', 'B', 'C'
})

export const programUpdates = pgTable('program_updates', {
  id: text('id').primaryKey(),
  programId: text('program_id').notNull().references(() => programs.id),
  type: text('type').notNull(), // 'phase_transition' | 'exercise_swap' | 'deload' | 'phase_extension'
  description: text('description').notNull(),
  reason: text('reason').notNull(),
  evidence: text('evidence').notNull(), // JSON: string[]
  proposedChanges: text('proposed_changes').notNull(), // JSON: structured payload
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'dismissed'
  createdAt: integer('created_at').notNull(),
})
