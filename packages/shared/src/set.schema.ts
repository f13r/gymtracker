import { z } from 'zod'

export const CreateSetSchema = z.object({
  exerciseId: z.string().uuid(),
  setNumber: z.number().int().min(1),
  reps: z.number().int().min(0).optional(),
  weightKg: z.number().min(0).optional(),
  durationSec: z.number().int().min(0).optional(),
  rpe: z.number().min(1).max(10).optional(),
  done: z.boolean().optional(),
})

export const UpdateSetSchema = CreateSetSchema.omit({ exerciseId: true, setNumber: true })
  .extend({ done: z.boolean().optional() })
  .partial()

export type CreateSetDto = z.infer<typeof CreateSetSchema>
export type UpdateSetDto = z.infer<typeof UpdateSetSchema>
