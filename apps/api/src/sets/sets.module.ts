import { Module } from '@nestjs/common'

import { SetsController } from './sets.controller'
import { SetsService } from './sets.service'
import { SessionsModule } from '../sessions/sessions.module'

@Module({ imports: [SessionsModule], controllers: [SetsController], providers: [SetsService] })
export class SetsModule {}
