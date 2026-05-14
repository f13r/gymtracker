import { Module } from '@nestjs/common'

import { SessionsModule } from '../sessions/sessions.module'
import { WorkoutsController } from './workouts.controller'
import { WorkoutsService } from './workouts.service'

@Module({ imports: [SessionsModule], controllers: [WorkoutsController], providers: [WorkoutsService] })
export class WorkoutsModule {}
