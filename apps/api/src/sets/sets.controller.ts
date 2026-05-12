import { Controller, Get, Post, Patch, Delete, Param, Body, Req } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'

import { CreateSetSchema, UpdateSetSchema } from '@gymtracker/shared'

import { SetsService } from './sets.service'
import { AuthenticatedRequest } from '../auth/request.types'

class CreateSetDto extends createZodDto(CreateSetSchema) {}
class UpdateSetDto extends createZodDto(UpdateSetSchema) {}

@Controller('sessions/:sessionId/sets')
export class SetsController {
  constructor(private readonly svc: SetsService) {}

  @Get() getSets(@Param('sessionId') sessionId: string, @Req() req: AuthenticatedRequest) {
    return this.svc.getSessionSets(sessionId, req.user.id)
  }

  @Post() logSet(@Param('sessionId') sessionId: string, @Body() dto: CreateSetDto, @Req() req: AuthenticatedRequest) {
    return this.svc.logSet(sessionId, req.user.id, dto)
  }

  @Patch(':setId') updateSet(
    @Param('sessionId') sessionId: string,
    @Param('setId') setId: string,
    @Body() dto: UpdateSetDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.updateSet(sessionId, setId, req.user.id, dto)
  }

  @Delete(':setId') deleteSet(
    @Param('sessionId') sessionId: string,
    @Param('setId') setId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.deleteSet(sessionId, setId, req.user.id)
  }
}
