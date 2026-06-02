import { Controller, Get, Req } from '@nestjs/common'

import { AiLogService } from './ai-log.service'
import { AuthenticatedRequest } from '../auth/request.types'

@Controller('ai-log')
export class AiLogController {
  constructor(private readonly svc: AiLogService) {}

  @Get()
  getForUser(@Req() req: AuthenticatedRequest) {
    return this.svc.getForUser(req.user.id)
  }
}
