import { Controller, Get, Post, Delete, Param, Body, Req } from '@nestjs/common';
import { WorkoutsService } from './workouts.service';
import { createZodDto } from 'nestjs-zod';
import { CreateTemplateSchema, StartSessionSchema, FinishSessionSchema } from '@gymtracker/shared';

class CreateTemplateDto extends createZodDto(CreateTemplateSchema) {}
class StartSessionDto extends createZodDto(StartSessionSchema) {}
class FinishSessionDto extends createZodDto(FinishSessionSchema) {}

@Controller()
export class WorkoutsController {
  constructor(private readonly svc: WorkoutsService) {}

  @Get('templates') getTemplates(@Req() req: any) { return this.svc.getTemplates(req.user.id); }
  @Get('templates/:id') getTemplate(@Param('id') id: string, @Req() req: any) { return this.svc.getTemplate(id, req.user.id); }
  @Post('templates') createTemplate(@Body() dto: CreateTemplateDto, @Req() req: any) { return this.svc.createTemplate(req.user.id, dto); }
  @Delete('templates/:id') deleteTemplate(@Param('id') id: string, @Req() req: any) { return this.svc.deleteTemplate(id, req.user.id); }

  @Get('sessions') getSessions(@Req() req: any) { return this.svc.getSessions(req.user.id); }
  @Get('sessions/active') getActive(@Req() req: any) { return this.svc.getActiveSession(req.user.id); }
  @Get('sessions/:id') getSession(@Param('id') id: string, @Req() req: any) { return this.svc.getSession(id, req.user.id); }
  @Post('sessions') startSession(@Body() dto: StartSessionDto, @Req() req: any) { return this.svc.startSession(req.user.id, dto); }
  @Post('sessions/:id/finish') finishSession(@Param('id') id: string, @Body() dto: FinishSessionDto, @Req() req: any) { return this.svc.finishSession(id, req.user.id, dto); }
}
