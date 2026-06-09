import { Module } from '@nestjs/common'

import { WorkoutsController } from './workouts.controller'
import { WorkoutsService } from './workouts.service'
import { ProgramModule } from '../program/program.module'
import { ProgressionModule } from '../progression/progression.module'
import { SessionsModule } from '../sessions/sessions.module'

@Module({
  imports: [SessionsModule, ProgressionModule, ProgramModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService],
})
export class WorkoutsModule {}
