import { z } from 'zod'

export const ProgramStatusSchema = z.enum(['active', 'completed', 'abandoned'])
export const PhaseTypeSchema = z.enum(['accumulation', 'strength', 'peaking', 'maintenance'])
export const PhaseStatusSchema = z.enum(['pending', 'active', 'completed'])
export const SplitTypeSchema = z.enum(['full_body', 'upper_lower', 'push_pull_legs'])
export const ProgramUpdateTypeSchema = z.enum(['phase_transition', 'exercise_swap', 'deload', 'phase_extension'])
export const ProgramUpdateStatusSchema = z.enum(['pending', 'accepted', 'dismissed'])

export type ProgramStatus = z.infer<typeof ProgramStatusSchema>
export type PhaseType = z.infer<typeof PhaseTypeSchema>
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>
export type SplitType = z.infer<typeof SplitTypeSchema>
export type ProgramUpdateType = z.infer<typeof ProgramUpdateTypeSchema>
export type ProgramUpdateStatus = z.infer<typeof ProgramUpdateStatusSchema>

export type ProgramPhaseTemplate = {
  id: string
  phaseId: string
  templateId: string
  dayLabel: string
}

export type ProgramPhase = {
  id: string
  programId: string
  name: string
  type: PhaseType
  orderIndex: number
  targetSessionCount: number
  completedSessionCount: number
  splitType: SplitType
  rationale: string
  status: PhaseStatus
  templates: ProgramPhaseTemplate[]
}

export type Program = {
  id: string
  userId: string
  name: string
  goal: string
  experienceLevel: string
  status: ProgramStatus
  createdAt: number
  phases: ProgramPhase[]
  pendingUpdate: ProgramUpdate | null
}

export type ProgramUpdate = {
  id: string
  programId: string
  type: ProgramUpdateType
  description: string
  reason: string
  evidence: string[]
  proposedChanges: unknown
  status: ProgramUpdateStatus
  createdAt: number
}

/**
 * Shape the AI generation endpoint must return. Validated before any DB write so
 * a malformed or off-vocabulary response is rejected wholesale (never persisted
 * half-written). Numbers are coerced because models occasionally emit them as
 * strings; exerciseId existence is checked separately against the user's library.
 */
export const GeneratedTemplateExerciseSchema = z.object({
  exerciseId: z.string().min(1),
  orderIndex: z.coerce.number().int().min(0),
  defaultSets: z.coerce.number().int().positive(),
  defaultReps: z.coerce.number().int().positive(),
  defaultWeightKg: z.coerce.number().min(0),
})

export const GeneratedTemplateSchema = z.object({
  name: z.string().min(1),
  dayLabel: z.string().min(1),
  exercises: z.array(GeneratedTemplateExerciseSchema).min(1),
})

export const GeneratedPhaseSchema = z.object({
  name: z.string().min(1),
  type: PhaseTypeSchema,
  durationWeeks: z.coerce.number().int().positive(),
  splitType: SplitTypeSchema,
  rationale: z.string().default(''),
  templates: z.array(GeneratedTemplateSchema).min(1),
})

export const GeneratedProgramSchema = z.object({
  name: z.string().min(1),
  phases: z.array(GeneratedPhaseSchema).min(1),
})

export type GeneratedProgram = z.infer<typeof GeneratedProgramSchema>

export const CreateProgramSchema = z.object({}) // all inputs come from User Profile

export const AcknowledgeProgramUpdateSchema = z.object({
  action: z.enum(['accept', 'dismiss']),
})
