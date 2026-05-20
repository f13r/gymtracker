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

export const CreateProgramSchema = z.object({}) // all inputs come from User Profile

export const AcknowledgeProgramUpdateSchema = z.object({
  action: z.enum(['accept', 'dismiss']),
})
