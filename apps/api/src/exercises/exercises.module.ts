import { Module } from '@nestjs/common'

import { ExercisesController } from './exercises.controller'
import { ExercisesService } from './exercises.service'
import { WgerModule } from '../wger/wger.module'

@Module({ imports: [WgerModule], controllers: [ExercisesController], providers: [ExercisesService] })
export class ExercisesModule {}
