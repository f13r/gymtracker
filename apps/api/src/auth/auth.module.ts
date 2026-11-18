import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'

import { ACCESS_KEYS, remoteAccessKeys } from './access-keys'
import { AuthGuard } from './access.guard'
import { AUTH_CONFIG, type AuthConfig, loadAuthConfig } from './auth.config'
import { MeController } from './me.controller'

const ENV_KEYS = [
  'AUTH_MODE',
  'NODE_ENV',
  'CF_ACCESS_TEAM_DOMAIN',
  'CF_ACCESS_AUD',
  'DEV_USER_ID',
  'AGENT_SERVICE_TOKEN_IDS',
  'TRAINER_LINKS',
]

@Module({
  controllers: [MeController],
  exports: [AUTH_CONFIG],
  providers: [
    {
      // Throws on missing/malformed config, so the API refuses to boot.
      provide: AUTH_CONFIG,
      inject: [ConfigService],
      useFactory: (env: ConfigService) =>
        loadAuthConfig(Object.fromEntries(ENV_KEYS.map(key => [key, env.get<string>(key)]))),
    },
    { provide: ACCESS_KEYS, inject: [AUTH_CONFIG], useFactory: (config: AuthConfig) => remoteAccessKeys(config) },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
