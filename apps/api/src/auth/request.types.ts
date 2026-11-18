import type { AuthUser } from '@gymtracker/shared'

import type { FastifyRequest } from 'fastify'

/** `actor` is the Trainer, set only while acting as an athlete (`user` is then the athlete). */
export type AuthenticatedRequest = FastifyRequest & { user: AuthUser; actor?: AuthUser }
