import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, and, or } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import sharp from 'sharp'

import { CreateExerciseDto, UpdateExerciseDto, WorkoutSet } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import type { DbSet, DbExercise } from '../drizzle/mappers'
import { toWorkoutSet, toExercise } from '../drizzle/mappers'
import * as schema from '../drizzle/schema'
import { lastFinishedSessionSetsSql } from '../drizzle/set-queries'
import { randomUUID } from 'crypto'
import { mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'

@Injectable()
export class ExercisesService {
  private readonly photosDir: string

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private config: ConfigService,
  ) {
    this.photosDir = config.getOrThrow<string>('PHOTOS_DIR')
  }

  async findAll(userId: string) {
    const rows = await this.db
      .select()
      .from(schema.exercises)
      .where(or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1)))
    return rows.map(toExercise)
  }

  async findOne(id: string, userId: string) {
    return toExercise(await this.findRow(id, userId))
  }

  // Internal: the raw row, used where the on-disk image paths are needed (serving, deletion).
  private async findRow(id: string, userId: string): Promise<DbExercise> {
    const [ex] = await this.db
      .select()
      .from(schema.exercises)
      .where(
        and(eq(schema.exercises.id, id), or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1))),
      )
      .limit(1)
    if (!ex) {
      throw new NotFoundException('Exercise not found')
    }
    return ex
  }

  async create(userId: string, dto: CreateExerciseDto, image?: Buffer) {
    const name = dto.name?.trim()
    if (!name) {
      throw new BadRequestException('Exercise name is required')
    }
    const id = randomUUID()
    const media = image ? await this.writeImage(userId, id, image) : null

    const [row] = await this.db
      .insert(schema.exercises)
      .values({
        id,
        userId,
        name,
        category: dto.category ?? null,
        equipmentType: dto.equipmentType ?? null,
        notes: dto.notes ?? null,
        description: dto.description?.trim() || null,
        imagePath: media?.imagePath ?? null,
        thumbPath: media?.thumbPath ?? null,
        isDefault: 0,
        createdAt: Math.floor(Date.now() / 1000),
      })
      .returning()
    return toExercise(row!)
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateExerciseDto,
    opts: { image?: Buffer | undefined; removeImage?: boolean } = {},
  ) {
    const existing = await this.findRow(id, userId)

    const patch: Record<string, unknown> = {}
    if (dto.name !== undefined) {
      patch.name = dto.name.trim()
    }
    if (dto.category !== undefined) {
      patch.category = dto.category ?? null
    }
    if (dto.equipmentType !== undefined) {
      patch.equipmentType = dto.equipmentType ?? null
    }
    if (dto.notes !== undefined) {
      patch.notes = dto.notes ?? null
    }
    if (dto.description !== undefined) {
      patch.description = dto.description?.trim() || null
    }
    if (opts.image) {
      const media = await this.writeImage(userId, id, opts.image)
      patch.imagePath = media.imagePath
      patch.thumbPath = media.thumbPath
      this.unlinkMedia(existing) // remove the superseded files
    } else if (opts.removeImage) {
      patch.imagePath = null
      patch.thumbPath = null
      this.unlinkMedia(existing)
    }

    const [row] = await this.db
      .update(schema.exercises)
      .set(patch)
      .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId)))
      .returning()
    return toExercise(row!)
  }

  async remove(id: string, userId: string) {
    const existing = await this.findRow(id, userId)
    await this.db
      .delete(schema.exercises)
      .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 0)))
    this.unlinkMedia(existing)
  }

  // Resolve the absolute path of an Exercise's image (or thumb) for streaming, enforcing the usual
  // own-or-default authz via findRow. Throws NotFound when the Exercise has no such image.
  async getImageFile(id: string, userId: string, kind: 'image' | 'thumb'): Promise<string> {
    const ex = await this.findRow(id, userId)
    const rel = kind === 'thumb' ? ex.thumbPath : ex.imagePath
    if (!rel) {
      throw new NotFoundException('Exercise has no image')
    }
    return join(this.photosDir, rel)
  }

  async getLastSets(exerciseId: string, userId: string): Promise<WorkoutSet[]> {
    const result = await this.db.execute(lastFinishedSessionSetsSql(exerciseId, userId))
    return result.rows.map(r => toWorkoutSet(r as DbSet))
  }

  // Write orig + thumb .webp under PHOTOS_DIR/<userId>/exercises and return the relative paths.
  private async writeImage(userId: string, id: string, buffer: Buffer) {
    const dir = join(this.photosDir, userId, 'exercises')
    mkdirSync(dir, { recursive: true })
    const relOrig = `${userId}/exercises/${id}-orig.webp`
    const relThumb = `${userId}/exercises/${id}-thumb.webp`
    await sharp(buffer).rotate().webp({ quality: 85 }).toFile(join(this.photosDir, relOrig))
    await sharp(buffer).rotate().resize({ width: 400 }).webp({ quality: 75 }).toFile(join(this.photosDir, relThumb))
    return { imagePath: relOrig, thumbPath: relThumb }
  }

  private unlinkMedia(ex: DbExercise) {
    for (const rel of [ex.imagePath, ex.thumbPath]) {
      if (rel) {
        try {
          unlinkSync(join(this.photosDir, rel))
        } catch {} // eslint-disable-line no-empty
      }
    }
  }
}
