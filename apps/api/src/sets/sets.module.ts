import { Module } from '@nestjs/common'

import { SessionsModule } from '../sessions/sessions.module'
import { SetsController } from './sets.controller'
import { SetsService } from './sets.service'

@Module({ imports: [SessionsModule], controllers: [SetsController], providers: [SetsService] })
export class SetsModule {}
