import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from './drizzle/drizzle.module';
import { AuthModule } from './auth/auth.module';
import { SeedModule } from './seed/seed.module';
import { ExercisesModule } from './exercises/exercises.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    AuthModule,
    SeedModule,
    ExercisesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
