import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const exercises = sqliteTable('exercises', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  category: text('category'),
  equipment: text('equipment'),
  notes: text('notes'),
  isDefault: integer('is_default').default(0),
  createdAt: integer('created_at').notNull(),
})

export const workoutTemplates = sqliteTable('workout_templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
})

export const templateExercises = sqliteTable('template_exercises', {
  id: text('id').primaryKey(),
  templateId: text('template_id').references(() => workoutTemplates.id),
  exerciseId: text('exercise_id').references(() => exercises.id),
  orderIndex: integer('order_index').notNull(),
  defaultSets: integer('default_sets'),
  defaultReps: integer('default_reps'),
  defaultWeightKg: real('default_weight_kg'),
  isWarmup: integer('is_warmup').default(0),
})

export const workoutSessions = sqliteTable('workout_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  templateId: text('template_id').references(() => workoutTemplates.id),
  name: text('name').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  notes: text('notes'),
})

export const sets = sqliteTable('sets', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => workoutSessions.id),
  exerciseId: text('exercise_id').references(() => exercises.id),
  setNumber: integer('set_number').notNull(),
  reps: integer('reps'),
  weightKg: real('weight_kg'),
  durationSec: integer('duration_sec'),
  rpe: real('rpe'),
  isWarmup: integer('is_warmup').default(0),
  completedAt: integer('completed_at').notNull(),
  done: integer('done').default(0),
})

export const bodyWeights = sqliteTable('body_weights', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  weightKg: real('weight_kg').notNull(),
  recordedAt: integer('recorded_at').notNull(),
  notes: text('notes'),
})

export const bodyMeasurements = sqliteTable('body_measurements', {
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

export const workoutSchedules = sqliteTable('workout_schedules', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  templateId: text('template_id').references(() => workoutTemplates.id),
  type: text('type', { enum: ['once', 'weekly'] }).notNull(),
  scheduledDate: text('scheduled_date'),
  dayOfWeek: integer('day_of_week'),
  createdAt: integer('created_at').notNull(),
})

export const progressPhotos = sqliteTable('progress_photos', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  recordedAt: integer('recorded_at').notNull(),
  filePath: text('file_path').notNull(),
  thumbPath: text('thumb_path').notNull(),
  bodyWeight: real('body_weight'),
  tags: text('tags'),
  notes: text('notes'),
})
