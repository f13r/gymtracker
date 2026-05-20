import { Controller, Get, Post, Param, Body, Req } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { AcknowledgeProgramUpdateSchema } from '@gymtracker/shared'
import { ProgramService } from './program.service'
import { AuthenticatedRequest } from '../auth/request.types'

class AcknowledgeDto extends createZodDto(AcknowledgeProgramUpdateSchema) {}

@Controller('program')
export class ProgramController {
  constructor(private readonly svc: ProgramService) {}

  @Get()
  getActiveProgram(@Req() req: AuthenticatedRequest) {
    return this.svc.getActiveProgram(req.user.id)
  }

  @Post('generate')
  generateProgram(@Req() req: AuthenticatedRequest) {
    return this.svc.generateProgram(req.user.id)
  }

  @Post('evaluate')
  evaluateNow(@Req() req: AuthenticatedRequest) {
    return this.svc.evaluateNow(req.user.id)
  }

  @Post('updates/:id/acknowledge')
  acknowledgeUpdate(
    @Param('id') id: string,
    @Body() dto: AcknowledgeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.acknowledgeProgramUpdate(id, req.user.id, dto.action)
  }
}
