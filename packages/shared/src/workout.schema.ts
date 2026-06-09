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
      // Round-tripped on edit so a coach-prescribed Equipment reference survives a full-replace save.
      equipmentId: z.string().uuid().optional(),
    }),
  ),
})

// Editing a Workout Template reuses the create shape; the service mutates in place (same id).
// See docs/adr/0007-templates-referenced-not-snapshotted.md.
export const UpdateTemplateSchema = CreateTemplateSchema

export const StartSessionSchema = z.object({
  templateId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
})

export const FinishSessionSchema = z.object({
  notes: z.string().max(500).optional(),
})

export type CreateTemplateDto = z.infer<typeof CreateTemplateSchema>
export type UpdateTemplateDto = z.infer<typeof UpdateTemplateSchema>
export type StartSessionDto = z.infer<typeof StartSessionSchema>
export type FinishSessionDto = z.infer<typeof FinishSessionSchema>
