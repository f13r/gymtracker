import { Controller, Get, Post, Body, Req } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'

import { CreateBodyWeightSchema, CreateMeasurementSchema } from '@gymtracker/shared'

import { BodyService } from './body.service'
import { AuthenticatedRequest } from '../auth/request.types'

class CreateBodyWeightDto extends createZodDto(CreateBodyWeightSchema) {}
class CreateMeasurementDto extends createZodDto(CreateMeasurementSchema) {}

@Controller('body')
export class BodyController {
  constructor(private readonly svc: BodyService) {}

  @Get('weight') getWeights(@Req() req: AuthenticatedRequest) {
    return this.svc.getWeights(req.user.id)
  }
  @Post('weight') addWeight(@Body() dto: CreateBodyWeightDto, @Req() req: AuthenticatedRequest) {
    return this.svc.addWeight(req.user.id, dto)
  }
  @Get('measurements') getMeasurements(@Req() req: AuthenticatedRequest) {
    return this.svc.getMeasurements(req.user.id)
  }
  @Post('measurements') addMeasurement(@Body() dto: CreateMeasurementDto, @Req() req: AuthenticatedRequest) {
    return this.svc.addMeasurement(req.user.id, dto)
  }
}
