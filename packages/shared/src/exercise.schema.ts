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
  // wger.de exercise (base) id. When set, the server fetches the exercise's metadata
  // (name/category/equipment) from wger and fills it in; null unlinks it.
  wgerId: z.number().int().positive().nullable().optional(),
})

// `name` is optional on create only when a wgerId is supplied — the server then derives
// the name from wger. Either a name or a wgerId must be present.
export const CreateExerciseSchema = ExerciseFieldsSchema.partial({ name: true }).refine(
  d => (d.name?.trim().length ?? 0) > 0 || d.wgerId != null,
  { message: 'Provide an exercise name or a wger ID', path: ['name'] },
)

export const UpdateExerciseSchema = ExerciseFieldsSchema.partial()

export type CreateExerciseDto = z.infer<typeof CreateExerciseSchema>
export type UpdateExerciseDto = z.infer<typeof UpdateExerciseSchema>
