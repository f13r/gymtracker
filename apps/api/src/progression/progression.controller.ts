import { Controller, Get, Param, Req, NotFoundException } from '@nestjs/common'

import { ProgressionService } from './progression.service'
import { AuthenticatedRequest } from '../auth/request.types'

@Controller()
export class ProgressionController {
  constructor(private readonly svc: ProgressionService) {}

  @Get('exercises/:id/progression-suggestion')
  async getForExercise(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const result = await this.svc.getForExercise(id, req.user.id)
    if (!result) {
      throw new NotFoundException('No progression suggestion found')
    }
    return result
  }
}
