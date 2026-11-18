import { Module } from '@nestjs/common'

import { SeedService } from './seed.service'
import { AuthModule } from '../auth/auth.module'

@Module({ imports: [AuthModule], providers: [SeedService] })
export class SeedModule {}
