import { Module } from '@nestjs/common'

import { WgerService } from './wger.service'

@Module({ providers: [WgerService], exports: [WgerService] })
export class WgerModule {}
