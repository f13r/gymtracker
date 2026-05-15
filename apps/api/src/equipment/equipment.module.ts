import { Module } from '@nestjs/common'

import { GymModule } from '../gym/gym.module'
import { EquipmentController } from './equipment.controller'
import { EquipmentService } from './equipment.service'

@Module({
  imports: [GymModule],
  controllers: [EquipmentController],
  providers: [EquipmentService],
})
export class EquipmentModule {}
