import { z } from 'zod'

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  notes: z.string().max(500).optional(),
  exercises: z.array(
    z.object({
      exerciseId: z.string().uuid(),
      orderIndex: z.number().int().min(0),
      defaultSets: z.number().int().min(1).optional(),
      defaultReps: z.number().int().min(1).optional(),
      defaultWeightKg: z.number().min(0).optional(),
      isWarmup: z.boolean().default(false),
    }),
  ),
})

export const StartSessionSchema = z.object({
  templateId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
})

export const FinishSessionSchema = z.object({
  notes: z.string().max(500).optional(),
})

export type CreateTemplateDto = z.infer<typeof CreateTemplateSchema>
export type StartSessionDto = z.infer<typeof StartSessionSchema>
export type FinishSessionDto = z.infer<typeof FinishSessionSchema>
