import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'

import { MeController } from './me.controller'
import { AuthGuard } from './mock-auth.guard'

@Module({
  controllers: [MeController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
