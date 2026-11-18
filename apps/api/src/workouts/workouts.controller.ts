import { Controller, Get, Post, Patch, Delete, Param, Body, Req, Inject } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'

import { CreateTemplateSchema, UpdateTemplateSchema, StartSessionSchema, FinishSessionSchema } from '@gymtracker/shared'

import { WorkoutsService } from './workouts.service'
import { AuthenticatedRequest } from '../auth/request.types'
import { TrainerAccess } from '../auth/trainer-access.decorator'

class CreateTemplateDto extends createZodDto(CreateTemplateSchema) {}
class UpdateTemplateDto extends createZodDto(UpdateTemplateSchema) {}
class StartSessionDto extends createZodDto(StartSessionSchema) {}
class FinishSessionDto extends createZodDto(FinishSessionSchema) {}

@Controller()
export class WorkoutsController {
  constructor(@Inject(WorkoutsService) private readonly svc: WorkoutsService) {}

  @TrainerAccess('read')
  @Get('templates') getTemplates(@Req() req: AuthenticatedRequest) {
    return this.svc.getTemplates(req.user.id)
  }
  @TrainerAccess('read')
  @Get('templates/:id') getTemplate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.getTemplate(id, req.user.id)
  }
  @TrainerAccess('write')
  @Post('templates') createTemplate(@Body() dto: CreateTemplateDto, @Req() req: AuthenticatedRequest) {
    return this.svc.createTemplate(req.user.id, dto)
  }
  @TrainerAccess('write')
  @Patch('templates/:id') updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.updateTemplate(id, req.user.id, dto)
  }
  @TrainerAccess('write')
  @Delete('templates/:id') deleteTemplate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.deleteTemplate(id, req.user.id)
  }
  @TrainerAccess('write')
  @Post('templates/:id/exercises') addTemplateExercise(
    @Param('id') id: string,
    @Body() body: { exerciseId: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.addTemplateExercise(id, req.user.id, body.exerciseId)
  }

  @TrainerAccess('read')
  @Get('sessions') getSessions(@Req() req: AuthenticatedRequest) {
    return this.svc.getSessions(req.user.id)
  }
  @TrainerAccess('read')
  @Get('sessions/active') getActive(@Req() req: AuthenticatedRequest) {
    return this.svc.getActiveSession(req.user.id)
  }
  @TrainerAccess('read')
  @Get('sessions/:id') getSession(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.getSession(id, req.user.id)
  }
  @TrainerAccess('read')
  @Get('sessions/:id/comparison') getSessionComparison(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.getSessionComparison(id, req.user.id)
  }
  @Post('sessions') startSession(@Body() dto: StartSessionDto, @Req() req: AuthenticatedRequest) {
    return this.svc.startSession(req.user.id, dto)
  }
  @Delete('sessions/:id') deleteSession(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.deleteSession(id, req.user.id)
  }
  @Post('sessions/:id/finish') finishSession(
    @Param('id') id: string,
    @Body() dto: FinishSessionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.finishSession(id, req.user.id, dto)
  }
}
