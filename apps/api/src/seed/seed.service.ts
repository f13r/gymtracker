import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'

// wgerId = wger.de exercise (base) id for demonstration media, curated to the closest movement match
// that has an image. null where wger has no usable match (the cardio entries).
const DEFAULT_EXERCISES = [
  { name: 'Bench Press', category: 'push', equipmentType: 'barbell', wgerId: 73 },
  { name: 'Squat', category: 'legs', equipmentType: 'barbell', wgerId: 1801 },
  { name: 'Deadlift', category: 'pull', equipmentType: 'barbell', wgerId: 184 },
  { name: 'Overhead Press', category: 'push', equipmentType: 'barbell', wgerId: 1893 },
  { name: 'Barbell Row', category: 'pull', equipmentType: 'barbell', wgerId: 83 },
  { name: 'Romanian Deadlift', category: 'legs', equipmentType: 'barbell', wgerId: 1652 },
  { name: 'Front Squat', category: 'legs', equipmentType: 'barbell', wgerId: 1640 },
  { name: 'Incline Bench Press', category: 'push', equipmentType: 'barbell', wgerId: 538 },
  { name: 'Dumbbell Press', category: 'push', equipmentType: 'dumbbell', wgerId: 1277 },
  { name: 'Dumbbell Row', category: 'pull', equipmentType: 'dumbbell', wgerId: 81 },
  { name: 'Lateral Raise', category: 'push', equipmentType: 'dumbbell', wgerId: 348 },
  { name: 'Bicep Curl', category: 'pull', equipmentType: 'dumbbell', wgerId: 92 },
  { name: 'Tricep Extension', category: 'push', equipmentType: 'dumbbell', wgerId: 1336 },
  { name: 'Dumbbell Lunge', category: 'legs', equipmentType: 'dumbbell', wgerId: 1651 },
  { name: 'Bulgarian Split Squat', category: 'legs', equipmentType: 'dumbbell', wgerId: 1706 },
  { name: 'Leg Press', category: 'legs', equipmentType: 'machine', wgerId: 371 },
  { name: 'Leg Curl', category: 'legs', equipmentType: 'machine', wgerId: 364 },
  { name: 'Leg Extension', category: 'legs', equipmentType: 'machine', wgerId: 851 },
  { name: 'Cable Row', category: 'pull', equipmentType: 'cable', wgerId: 1117 },
  { name: 'Lat Pulldown', category: 'pull', equipmentType: 'cable', wgerId: 158 },
  { name: 'Chest Fly', category: 'push', equipmentType: 'machine', wgerId: 926 },
  { name: 'Cable Lateral Raise', category: 'push', equipmentType: 'cable', wgerId: 1378 },
  { name: 'Pull-up', category: 'pull', equipmentType: 'bodyweight', wgerId: 475 },
  { name: 'Chin-up', category: 'pull', equipmentType: 'bodyweight', wgerId: 154 },
  { name: 'Push-up', category: 'push', equipmentType: 'bodyweight', wgerId: 1551 },
  { name: 'Dip', category: 'push', equipmentType: 'bodyweight', wgerId: 194 },
  { name: 'Plank', category: 'core', equipmentType: 'bodyweight', wgerId: 458 },
  { name: 'Hollow Hold', category: 'core', equipmentType: 'bodyweight', wgerId: 297 },
  { name: 'Running', category: 'cardio', equipmentType: 'other', wgerId: null },
  { name: 'Cycling', category: 'cardio', equipmentType: 'other', wgerId: null },
  { name: 'Rowing (erg)', category: 'cardio', equipmentType: 'other', wgerId: null },
  { name: 'Jump Rope', category: 'cardio', equipmentType: 'other', wgerId: null },
]

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name)

  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedUser()
      await this.seedExercises()
    } catch (err) {
      this.logger.error('Seed failed', err instanceof Error ? err.stack : String(err))
    }
  }

  private async seedUser() {
    const [existing] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, 'default-user'))
      .limit(1)
    if (existing) {return}

    await this.db.insert(schema.users).values({
      id: 'default-user',
      displayName: 'Viktor',
      createdAt: Math.floor(Date.now() / 1000),
    })
  }

  private async seedExercises() {
    const [existing] = await this.db
      .select()
      .from(schema.exercises)
      .where(eq(schema.exercises.isDefault, 1))
      .limit(1)
    if (existing) {return}

    const now = Math.floor(Date.now() / 1000)
    for (const ex of DEFAULT_EXERCISES) {
      await this.db.insert(schema.exercises).values({
        id: randomUUID(),
        userId: 'default-user',
        name: ex.name,
        category: ex.category,
        equipmentType: ex.equipmentType,
        wgerId: ex.wgerId,
        isDefault: 1,
        createdAt: now,
      })
    }
  }
}
