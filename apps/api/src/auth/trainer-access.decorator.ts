import { SetMetadata } from '@nestjs/common'

export const TRAINER_ACCESS = 'auth:trainerAccess'

export type TrainerAccessLevel = 'read' | 'write'

/**
 * Lets a Trainer call this route (or every route of the controller) while acting as an athlete
 * (CONTEXT.md, "Acting as"). Deny by default: an unmarked route refuses `X-Act-As`. A method's
 * mark wins over its controller's. Use `'read'` on GET routes only.
 */
export const TrainerAccess = (level: TrainerAccessLevel) => SetMetadata(TRAINER_ACCESS, level)
