import { Module } from '@nestjs/common'
import { GymService } from './gym.service'

@Module({ providers: [GymService], exports: [GymService] })
export class GymModule {}
