import { Module } from '@nestjs/common'

import { SessionsModule } from '../sessions/sessions.module'
import { ProgressionModule } from '../progression/progression.module'
import { ProgramModule } from '../program/program.module'
import { WorkoutsController } from './workouts.controller'
import { WorkoutsService } from './workouts.service'

@Module({
  imports: [SessionsModule, ProgressionModule, ProgramModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService],
})
export class WorkoutsModule {}
