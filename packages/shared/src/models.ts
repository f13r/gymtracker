// Entity types matching the DB schema — used on both BE (return types) and FE (API response types)

export type Exercise = {
  id: string
  userId: string | null
  name: string
  category: string | null
  equipmentType: string | null
  notes: string | null
  isDefault: number | null
  description: string | null
  // True when the Exercise has a stored image; the bytes are fetched from
  // GET /exercises/:id/image (and /thumb). File paths are never exposed.
  hasImage: boolean
  createdAt: number
}

export type WorkoutTemplate = {
  id: string
  userId: string | null
  name: string
  notes: string | null
  createdAt: number
}

export type TemplateExercise = {
  id: string
  templateId: string | null
  exerciseId: string | null
  orderIndex: number
  defaultSets: number | null
  defaultReps: number | null
  defaultWeightKg: number | null
  equipmentId: string | null
}

export type WorkoutTemplateWithExercises = WorkoutTemplate & { exercises: TemplateExercise[] }

export type WorkoutSession = {
  id: string
  userId: string
  templateId: string | null
  name: string
  startedAt: number
  finishedAt: number | null
  notes: string | null
}

export type WorkoutSet = {
  id: string
  sessionId: string
  exerciseId: string
  setNumber: number
  reps: number | null
  weightKg: number | null
  durationSec: number | null
  rpe: number | null
  completedAt: number | null
  done: boolean
  // Soft-removal timestamp; non-null = Removed (dropped from the Session, kept for stats).
  removedAt: number | null
  notes: string | null
}

// The Session Snapshot's ordered exercise list (structure copied from the Template at Start).
export type SessionExercise = {
  id: string
  sessionId: string
  exerciseId: string
  orderIndex: number
  equipmentId: string | null
}

export type SessionWithSets = WorkoutSession & {
  sets: WorkoutSet[]
  exercises: SessionExercise[]
}

export type BodyWeight = {
  id: string
  userId: string | null
  weightKg: number
  recordedAt: number
  notes: string | null
}

export type BodyMeasurement = {
  id: string
  userId: string | null
  recordedAt: number
  chest: number | null
  waist: number | null
  hips: number | null
  leftBicep: number | null
  rightBicep: number | null
  leftThigh: number | null
  rightThigh: number | null
  shoulders: number | null
  neck: number | null
  notes: string | null
}

export type ProgressPhoto = {
  id: string
  userId: string | null
  recordedAt: number
  filePath: string
  thumbPath: string
  bodyWeight: number | null
  tags: string | null
  notes: string | null
}

export type PersonalRecord = {
  exercise_id: string
  name: string
  maxWeightKg: number
  repsAtMax: number
  achievedAt: number
}

export type VolumePoint = {
  date: string
  volume: number
}

export type FrequencyPoint = {
  week: string
  count: number
}

export type WorkoutStreak = {
  current: number
  longest: number
}

export type AuthUser = {
  id: string
  displayName: string
}

export type Gym = {
  id: string
  userId: string | null
  name: string
  createdAt: number
}

export type Equipment = {
  id: string
  gymId: string | null
  name: string
  equipmentType: string | null
  description: string | null
  tags: string[] | null
  photoPath: string
  thumbPath: string
  createdAt: number
}

export type EquipmentWithExercises = Equipment & { exercises: Exercise[] }
