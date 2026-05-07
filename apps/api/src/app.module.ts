import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from './drizzle/drizzle.module';
import { AuthModule } from './auth/auth.module';
import { SeedModule } from './seed/seed.module';
import { ExercisesModule } from './exercises/exercises.module';
import { WorkoutsModule } from './workouts/workouts.module';
import { SetsModule } from './sets/sets.module';
import { BodyModule } from './body/body.module';
import { StatsModule } from './stats/stats.module';
import { PhotosModule } from './photos/photos.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    AuthModule,
    SeedModule,
    ExercisesModule,
    WorkoutsModule,
    SetsModule,
    BodyModule,
    StatsModule,
    PhotosModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
