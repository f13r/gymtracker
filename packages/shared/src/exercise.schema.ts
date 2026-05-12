import { z } from 'zod'

export const ExerciseCategorySchema = z.enum(['push', 'pull', 'legs', 'core', 'cardio', 'other'])
export const ExerciseEquipmentSchema = z.enum(['barbell', 'dumbbell', 'machine', 'bodyweight', 'cable', 'other'])

export const CreateExerciseSchema = z.object({
  name: z.string().min(1).max(100),
  category: ExerciseCategorySchema.optional(),
  equipment: ExerciseEquipmentSchema.optional(),
  notes: z.string().max(500).optional(),
})

export const UpdateExerciseSchema = CreateExerciseSchema.partial()

export type CreateExerciseDto = z.infer<typeof CreateExerciseSchema>
export type UpdateExerciseDto = z.infer<typeof UpdateExerciseSchema>
