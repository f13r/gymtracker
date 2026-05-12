import { Controller, Get, Post, Patch, Delete, Param, Body, Req } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'

import { CreateExerciseSchema, UpdateExerciseSchema } from '@gymtracker/shared'

import { ExercisesService } from './exercises.service'
import { AuthenticatedRequest } from '../auth/request.types'

class CreateExerciseDto extends createZodDto(CreateExerciseSchema) {}
class UpdateExerciseDto extends createZodDto(UpdateExerciseSchema) {}

@Controller('exercises')
export class ExercisesController {
  constructor(private readonly svc: ExercisesService) {}

  @Get() findAll(@Req() req: AuthenticatedRequest) {
    return this.svc.findAll(req.user.id)
  }
  @Get(':id/last-sets') getLastSets(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.getLastSets(id, req.user.id)
  }
  @Get(':id') findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.findOne(id, req.user.id)
  }
  @Post() create(@Body() dto: CreateExerciseDto, @Req() req: AuthenticatedRequest) {
    return this.svc.create(req.user.id, dto)
  }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateExerciseDto, @Req() req: AuthenticatedRequest) {
    return this.svc.update(id, req.user.id, dto)
  }
  @Delete(':id') remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.remove(id, req.user.id)
  }
}
