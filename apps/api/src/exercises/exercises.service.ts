import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, or } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CreateExerciseDto, UpdateExerciseDto, WorkoutSet } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import type { DbSet } from '../drizzle/mappers'
import { toWorkoutSet } from '../drizzle/mappers'
import * as schema from '../drizzle/schema'
import { lastFinishedSessionSetsSql } from '../drizzle/set-queries'
import { WgerService } from '../wger/wger.service'
import { randomUUID } from 'crypto'

@Injectable()
export class ExercisesService {
  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private readonly wger: WgerService,
  ) {}

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
    // When a wger id is supplied, pull the canonical name/category/equipment from wger and
    // use it to fill any field the caller didn't provide (a wger-only create relies on this).
    let { name, category, equipmentType } = dto
    if (dto.wgerId != null) {
      const meta = await this.wger.fetchExerciseMetadata(dto.wgerId)
      name = name ?? meta.name
      category = category ?? meta.category
      equipmentType = equipmentType ?? meta.equipmentType
    }
    if (!name?.trim()) {
      throw new BadRequestException('Exercise name is required')
    }

    const [row] = await this.db
      .insert(schema.exercises)
      .values({
        id: randomUUID(),
        userId,
        name: name.trim(),
        category: category ?? null,
        equipmentType: equipmentType ?? null,
        notes: dto.notes ?? null,
        isDefault: 0,
        wgerId: dto.wgerId ?? null,
        createdAt: Math.floor(Date.now() / 1000),
      })
      .returning()
    return row
  }

  async update(id: string, userId: string, dto: UpdateExerciseDto) {
    const existing = await this.findOne(id, userId)
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(dto).map(([k, v]) => [k, v ?? null]),
    )

    // Newly linking (or changing) the wger id re-syncs the metadata from wger — the act of
    // setting a wger id means "this is that exercise", so wger wins over the submitted fields.
    if (dto.wgerId != null && dto.wgerId !== existing.wgerId) {
      const meta = await this.wger.fetchExerciseMetadata(dto.wgerId)
      patch.name = meta.name
      if (meta.category) {
        patch.category = meta.category
      }
      if (meta.equipmentType) {
        patch.equipmentType = meta.equipmentType
      }
    }

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
