import { Injectable, Inject, OnApplicationBootstrap } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'

const DEFAULT_EXERCISES = [
  { name: 'Bench Press', category: 'push', equipment: 'barbell' },
  { name: 'Squat', category: 'legs', equipment: 'barbell' },
  { name: 'Deadlift', category: 'pull', equipment: 'barbell' },
  { name: 'Overhead Press', category: 'push', equipment: 'barbell' },
  { name: 'Barbell Row', category: 'pull', equipment: 'barbell' },
  { name: 'Romanian Deadlift', category: 'legs', equipment: 'barbell' },
  { name: 'Front Squat', category: 'legs', equipment: 'barbell' },
  { name: 'Incline Bench Press', category: 'push', equipment: 'barbell' },
  { name: 'Dumbbell Press', category: 'push', equipment: 'dumbbell' },
  { name: 'Dumbbell Row', category: 'pull', equipment: 'dumbbell' },
  { name: 'Lateral Raise', category: 'push', equipment: 'dumbbell' },
  { name: 'Bicep Curl', category: 'pull', equipment: 'dumbbell' },
  { name: 'Tricep Extension', category: 'push', equipment: 'dumbbell' },
  { name: 'Dumbbell Lunge', category: 'legs', equipment: 'dumbbell' },
  { name: 'Bulgarian Split Squat', category: 'legs', equipment: 'dumbbell' },
  { name: 'Leg Press', category: 'legs', equipment: 'machine' },
  { name: 'Leg Curl', category: 'legs', equipment: 'machine' },
  { name: 'Leg Extension', category: 'legs', equipment: 'machine' },
  { name: 'Cable Row', category: 'pull', equipment: 'cable' },
  { name: 'Lat Pulldown', category: 'pull', equipment: 'cable' },
  { name: 'Chest Fly', category: 'push', equipment: 'machine' },
  { name: 'Cable Lateral Raise', category: 'push', equipment: 'cable' },
  { name: 'Pull-up', category: 'pull', equipment: 'bodyweight' },
  { name: 'Chin-up', category: 'pull', equipment: 'bodyweight' },
  { name: 'Push-up', category: 'push', equipment: 'bodyweight' },
  { name: 'Dip', category: 'push', equipment: 'bodyweight' },
  { name: 'Plank', category: 'core', equipment: 'bodyweight' },
  { name: 'Hollow Hold', category: 'core', equipment: 'bodyweight' },
  { name: 'Running', category: 'cardio', equipment: 'other' },
  { name: 'Cycling', category: 'cardio', equipment: 'other' },
  { name: 'Rowing (erg)', category: 'cardio', equipment: 'other' },
  { name: 'Jump Rope', category: 'cardio', equipment: 'other' },
]

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedUser()
    await this.seedExercises()
  }

  private async seedUser() {
    const [existing] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, 'default-user'))
      .limit(1)
    if (existing) return

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
    if (existing) return

    const now = Math.floor(Date.now() / 1000)
    for (const ex of DEFAULT_EXERCISES) {
      await this.db.insert(schema.exercises).values({
        id: randomUUID(),
        userId: 'default-user',
        name: ex.name,
        category: ex.category,
        equipment: ex.equipment,
        isDefault: 1,
        createdAt: now,
      })
    }
  }
}
