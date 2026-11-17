import { Controller, Get, Req } from '@nestjs/common'

import type { AuthUser } from '@gymtracker/shared'

import { AuthenticatedRequest } from './request.types'

/** Who the request is acting as. The SPA uses it to drop cached data when the User changes. */
@Controller('me')
export class MeController {
  @Get()
  me(@Req() req: AuthenticatedRequest): AuthUser {
    return { id: req.user.id, displayName: req.user.displayName }
  }
}
