import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { relocateExerciseImages } from '../exercises/exercise-images'
import { randomUUID } from 'crypto'

// The shared starting library. Demonstration images are not seeded here — on the live install they
// were migrated from wger.de into local storage by the one-time backfill; fresh installs start
// image-less and the user adds photos as they go.
const DEFAULT_EXERCISES = [
  { name: 'Bench Press', category: 'push', equipmentType: 'barbell' },
  { name: 'Squat', category: 'legs', equipmentType: 'barbell' },
  { name: 'Deadlift', category: 'pull', equipmentType: 'barbell' },
  { name: 'Overhead Press', category: 'push', equipmentType: 'barbell' },
  { name: 'Barbell Row', category: 'pull', equipmentType: 'barbell' },
  { name: 'Romanian Deadlift', category: 'legs', equipmentType: 'barbell' },
  { name: 'Front Squat', category: 'legs', equipmentType: 'barbell' },
  { name: 'Incline Bench Press', category: 'push', equipmentType: 'barbell' },
  { name: 'Dumbbell Press', category: 'push', equipmentType: 'dumbbell' },
  { name: 'Dumbbell Row', category: 'pull', equipmentType: 'dumbbell' },
  { name: 'Lateral Raise', category: 'push', equipmentType: 'dumbbell' },
  { name: 'Bicep Curl', category: 'pull', equipmentType: 'dumbbell' },
  { name: 'Tricep Extension', category: 'push', equipmentType: 'dumbbell' },
  { name: 'Dumbbell Lunge', category: 'legs', equipmentType: 'dumbbell' },
  { name: 'Bulgarian Split Squat', category: 'legs', equipmentType: 'dumbbell' },
  { name: 'Leg Press', category: 'legs', equipmentType: 'machine' },
  { name: 'Leg Curl', category: 'legs', equipmentType: 'machine' },
  { name: 'Leg Extension', category: 'legs', equipmentType: 'machine' },
  { name: 'Cable Row', category: 'pull', equipmentType: 'cable' },
  { name: 'Lat Pulldown', category: 'pull', equipmentType: 'cable' },
  { name: 'Chest Fly', category: 'push', equipmentType: 'machine' },
  { name: 'Cable Lateral Raise', category: 'push', equipmentType: 'cable' },
  { name: 'Pull-up', category: 'pull', equipmentType: 'bodyweight' },
  { name: 'Chin-up', category: 'pull', equipmentType: 'bodyweight' },
  { name: 'Push-up', category: 'push', equipmentType: 'bodyweight' },
  { name: 'Dip', category: 'push', equipmentType: 'bodyweight' },
  { name: 'Plank', category: 'core', equipmentType: 'bodyweight' },
  { name: 'Hollow Hold', category: 'core', equipmentType: 'bodyweight' },
  { name: 'Running', category: 'cardio', equipmentType: 'other' },
  { name: 'Cycling', category: 'cardio', equipmentType: 'other' },
  { name: 'Rowing (erg)', category: 'cardio', equipmentType: 'other' },
  { name: 'Jump Rope', category: 'cardio', equipmentType: 'other' },
]

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name)

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private config: ConfigService,
  ) {}

  // Runs after the DATABASE provider has applied pending migrations.
  async onModuleInit(): Promise<void> {
    try {
      await this.seedUser()
      await this.seedExercises()
    } catch (err) {
      this.logger.error('Seed failed', err instanceof Error ? err.stack : String(err))
    }
    try {
      // Exercise Images are shared: move any left in old per-User folders (idempotent).
      await relocateExerciseImages(this.db, this.config.getOrThrow<string>('PHOTOS_DIR'), this.logger)
    } catch (err) {
      this.logger.error('Exercise image move failed', err instanceof Error ? err.stack : String(err))
    }
  }

  private async seedUser() {
    const [existing] = await this.db.select().from(schema.users).where(eq(schema.users.id, 'default-user')).limit(1)
    if (existing) {
      return
    }

    await this.db.insert(schema.users).values({
      id: 'default-user',
      displayName: 'Viktor',
      createdAt: Math.floor(Date.now() / 1000),
    })
  }

  // Seed the starting library into an empty install only, so an Exercise someone removed is never
  // brought back on the next boot.
  private async seedExercises() {
    const [existing] = await this.db.select({ id: schema.exercises.id }).from(schema.exercises).limit(1)
    if (existing) {
      return
    }

    const now = Math.floor(Date.now() / 1000)
    for (const ex of DEFAULT_EXERCISES) {
      await this.db
        .insert(schema.exercises)
        .values({
          id: randomUUID(),
          name: ex.name,
          category: ex.category,
          equipmentType: ex.equipmentType,
          createdAt: now,
        })
        .onConflictDoNothing()
    }
  }
}
