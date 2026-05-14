import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_INTERCEPTOR } from '@nestjs/core'

import { AuthModule } from './auth/auth.module'
import { BodyModule } from './body/body.module'
import { CacheControlInterceptor } from './cache-control.interceptor'
import { DrizzleModule } from './drizzle/drizzle.module'
import { ExercisesModule } from './exercises/exercises.module'
import { HealthController } from './health.controller'
import { PhotosModule } from './photos/photos.module'
import { SchedulesModule } from './schedules/schedules.module'
import { SeedModule } from './seed/seed.module'
import { SessionsModule } from './sessions/sessions.module'
import { SetsModule } from './sets/sets.module'
import { StatsModule } from './stats/stats.module'
import { WorkoutsModule } from './workouts/workouts.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    SessionsModule,
    AuthModule,
    SeedModule,
    ExercisesModule,
    WorkoutsModule,
    SchedulesModule,
    SetsModule,
    BodyModule,
    StatsModule,
    PhotosModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor }],
})
export class AppModule {}
