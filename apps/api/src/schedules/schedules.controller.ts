import { Controller, Get, Post, Delete, Param, Body, Req } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'

import { CreateScheduleSchema } from '@gymtracker/shared'

import { SchedulesService } from './schedules.service'
import { AuthenticatedRequest } from '../auth/request.types'

class CreateScheduleDto extends createZodDto(CreateScheduleSchema) {}

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly svc: SchedulesService) {}

  @Get() getSchedules(@Req() req: AuthenticatedRequest) {
    return this.svc.getSchedules(req.user.id)
  }

  @Get('today') getToday(@Req() req: AuthenticatedRequest) {
    return this.svc.getTodaySchedule(req.user.id)
  }

  @Post() createSchedule(@Body() dto: CreateScheduleDto, @Req() req: AuthenticatedRequest) {
    return this.svc.createSchedule(req.user.id, dto)
  }

  @Delete(':id') deleteSchedule(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.deleteSchedule(id, req.user.id)
  }
}
