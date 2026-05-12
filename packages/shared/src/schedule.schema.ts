import { z } from 'zod'

export const CreateScheduleSchema = z.object({
  templateId: z.string().uuid(),
  type: z.enum(['once', 'weekly']),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
})

export type CreateScheduleDto = z.infer<typeof CreateScheduleSchema>

export type WorkoutSchedule = {
  id: string
  userId: string | null
  templateId: string | null
  type: 'once' | 'weekly'
  scheduledDate: string | null
  dayOfWeek: number | null
  createdAt: number
}

export type TodaySchedule = {
  schedule: WorkoutSchedule
  templateName: string
  exerciseCount: number
}
