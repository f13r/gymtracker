import { Module } from '@nestjs/common'

import { EquipmentController } from './equipment.controller'
import { EquipmentService } from './equipment.service'
import { GeminiModule } from '../ai/gemini.module'
import { GymModule } from '../gym/gym.module'

@Module({
  imports: [GymModule, GeminiModule],
  controllers: [EquipmentController],
  providers: [EquipmentService],
})
export class EquipmentModule {}
