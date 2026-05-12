import type { AuthUser } from '@gymtracker/shared'

import type { FastifyRequest } from 'fastify'

export type AuthenticatedRequest = FastifyRequest & { user: AuthUser }
