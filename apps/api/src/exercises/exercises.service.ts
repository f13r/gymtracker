import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and, or } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CreateExerciseDto, UpdateExerciseDto, WorkoutSet } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { lastFinishedSessionSetsSql } from '../drizzle/set-queries'
import { randomUUID } from 'crypto'
import type { DbSet } from '../drizzle/mappers'
import { toWorkoutSet } from '../drizzle/mappers'

@Injectable()
export class ExercisesService {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  findAll(userId: string) {
    return this.db
      .select()
      .from(schema.exercises)
      .where(or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1)))
  }

  async findOne(id: string, userId: string) {
    const [ex] = await this.db
      .select()
      .from(schema.exercises)
      .where(and(eq(schema.exercises.id, id), or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1))))
      .limit(1)
    if (!ex) {
      throw new NotFoundException('Exercise not found')
    }
    return ex
  }

  async create(userId: string, dto: CreateExerciseDto) {
    const [row] = await this.db
      .insert(schema.exercises)
      .values({
        id: randomUUID(),
        userId,
        name: dto.name,
        category: dto.category ?? null,
        equipmentType: dto.equipmentType ?? null,
        notes: dto.notes ?? null,
        isDefault: 0,
        createdAt: Math.floor(Date.now() / 1000),
      })
      .returning()
    return row
  }

  async update(id: string, userId: string, dto: UpdateExerciseDto) {
    await this.findOne(id, userId)
    const patch = Object.fromEntries(Object.entries(dto).map(([k, v]) => [k, v ?? null]))
    const [row] = await this.db
      .update(schema.exercises)
      .set(patch)
      .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId)))
      .returning()
    return row
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId)
    await this.db
      .delete(schema.exercises)
      .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 0)))
  }

  async getLastSets(exerciseId: string, userId: string): Promise<WorkoutSet[]> {
    const result = await this.db.execute(lastFinishedSessionSetsSql(exerciseId, userId))
    return result.rows.map(r => toWorkoutSet(r as DbSet))
  }
}
