import { Module } from '@nestjs/common'

import { SessionsModule } from '../sessions/sessions.module'
import { ProgressionModule } from '../progression/progression.module'
import { WorkoutsController } from './workouts.controller'
import { WorkoutsService } from './workouts.service'

@Module({
  imports: [SessionsModule, ProgressionModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService],
})
export class WorkoutsModule {}
