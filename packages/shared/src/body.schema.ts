import { z } from 'zod'

export const CreateBodyWeightSchema = z.object({
  weightKg: z.number().min(20).max(500),
  recordedAt: z.number().int().optional(),
  notes: z.string().max(200).optional(),
})

export const CreateMeasurementSchema = z.object({
  recordedAt: z.number().int().optional(),
  chest: z.number().min(0).optional(),
  waist: z.number().min(0).optional(),
  hips: z.number().min(0).optional(),
  leftBicep: z.number().min(0).optional(),
  rightBicep: z.number().min(0).optional(),
  leftThigh: z.number().min(0).optional(),
  rightThigh: z.number().min(0).optional(),
  shoulders: z.number().min(0).optional(),
  neck: z.number().min(0).optional(),
  notes: z.string().max(200).optional(),
})

export type CreateBodyWeightDto = z.infer<typeof CreateBodyWeightSchema>
export type CreateMeasurementDto = z.infer<typeof CreateMeasurementSchema>
