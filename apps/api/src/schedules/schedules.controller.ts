import { Controller, Get, Post, Delete, Param, Body, Req } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'

import { CreateScheduleSchema } from '@gymtracker/shared'

import { SchedulesService } from './schedules.service'
import { AuthenticatedRequest } from '../auth/request.types'
import { TrainerAccess } from '../auth/trainer-access.decorator'

class CreateScheduleDto extends createZodDto(CreateScheduleSchema) {}

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly svc: SchedulesService) {}

  @TrainerAccess('read')
  @Get()
  getSchedules(@Req() req: AuthenticatedRequest) {
    return this.svc.getSchedules(req.user.id)
  }

  @TrainerAccess('read')
  @Get('today')
  getToday(@Req() req: AuthenticatedRequest) {
    return this.svc.getTodaySchedule(req.user.id)
  }

  @TrainerAccess('write')
  @Post()
  createSchedule(@Body() dto: CreateScheduleDto, @Req() req: AuthenticatedRequest) {
    return this.svc.createSchedule(req.user.id, dto)
  }

  @TrainerAccess('write')
  @Delete(':id')
  deleteSchedule(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.deleteSchedule(id, req.user.id)
  }
}
