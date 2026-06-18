import { z } from 'zod'

export const ExerciseCategorySchema = z.enum(['push', 'pull', 'legs', 'core', 'cardio', 'other'])
export const ExerciseEquipmentSchema = z.enum(['barbell', 'dumbbell', 'machine', 'bodyweight', 'cable', 'other'])

export type ExerciseCategory = z.infer<typeof ExerciseCategorySchema>
export type ExerciseEquipment = z.infer<typeof ExerciseEquipmentSchema>

const ExerciseFieldsSchema = z.object({
  name: z.string().min(1).max(100),
  category: ExerciseCategorySchema.optional(),
  equipmentType: ExerciseEquipmentSchema.optional(),
  notes: z.string().max(500).optional(),
  // Reference/how-to text, distinct from user `notes`.
  description: z.string().max(4000).optional(),
})

export const CreateExerciseSchema = ExerciseFieldsSchema

export const UpdateExerciseSchema = ExerciseFieldsSchema.partial()

export type CreateExerciseDto = z.infer<typeof CreateExerciseSchema>
export type UpdateExerciseDto = z.infer<typeof UpdateExerciseSchema>
