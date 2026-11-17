import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, isNull } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import sharp from 'sharp'

import { CreateExerciseDto, UpdateExerciseDto, WorkoutSet } from '@gymtracker/shared'

import { EXERCISE_IMAGE_DIR, exerciseImagePaths } from './exercise-images'
import { loadExerciseNotes, saveExerciseNotes } from './exercise-notes'
import { DATABASE } from '../drizzle/drizzle.constants'
import type { DbSet, DbExercise } from '../drizzle/mappers'
import { toWorkoutSet, toExercise } from '../drizzle/mappers'
import * as schema from '../drizzle/schema'
import { lastFinishedSessionSetsSql } from '../drizzle/set-queries'
import { randomUUID } from 'crypto'
import { mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'

// One shared Exercise library (ADR 0012): Exercises have no owner. `userId` only selects the
// caller's own notes (user_exercise_notes).
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
    const rows = await this.db.select().from(schema.exercises).where(isNull(schema.exercises.archivedAt))
    const notes = await loadExerciseNotes(this.db, userId)
    return rows.map(row => toExercise(row, notes.get(row.id) ?? null))
  }

  async findOne(id: string, userId: string) {
    const row = await this.findRow(id)
    const notes = await loadExerciseNotes(this.db, userId, id)
    return toExercise(row, notes.get(id) ?? null)
  }

  // Internal: the raw row, used where the on-disk image paths are needed (serving, deletion).
  // Archived Exercises stay readable: history and images still reference them.
  private async findRow(id: string): Promise<DbExercise> {
    const [ex] = await this.db.select().from(schema.exercises).where(eq(schema.exercises.id, id)).limit(1)
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
    const media = image ? await this.writeImage(id, image) : null

    await this.db.insert(schema.exercises).values({
      id,
      name,
      category: dto.category ?? null,
      equipmentType: dto.equipmentType ?? null,
      description: dto.description?.trim() || null,
      imagePath: media?.imagePath ?? null,
      thumbPath: media?.thumbPath ?? null,
      createdAt: Math.floor(Date.now() / 1000),
    })
    if (dto.notes !== undefined) {
      await saveExerciseNotes(this.db, userId, id, dto.notes)
    }
    return this.findOne(id, userId)
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateExerciseDto,
    opts: { image?: Buffer | undefined; removeImage?: boolean } = {},
  ) {
    const existing = await this.findRow(id)

    const patch: Partial<typeof schema.exercises.$inferInsert> = {}
    if (dto.name !== undefined) {
      patch.name = dto.name.trim()
    }
    if (dto.category !== undefined) {
      patch.category = dto.category ?? null
    }
    if (dto.equipmentType !== undefined) {
      patch.equipmentType = dto.equipmentType ?? null
    }
    if (dto.description !== undefined) {
      patch.description = dto.description?.trim() || null
    }
    if (opts.image) {
      const media = await this.writeImage(id, opts.image)
      patch.imagePath = media.imagePath
      patch.thumbPath = media.thumbPath
      this.unlinkMedia(existing, media) // remove the superseded files, never the ones just written
    } else if (opts.removeImage) {
      patch.imagePath = null
      patch.thumbPath = null
      this.unlinkMedia(existing)
    }

    if (Object.keys(patch).length > 0) {
      await this.db.update(schema.exercises).set(patch).where(eq(schema.exercises.id, id))
    }
    if (dto.notes !== undefined) {
      await saveExerciseNotes(this.db, userId, id, dto.notes)
    }
    return this.findOne(id, userId)
  }

  // Hard delete; a referenced Exercise still fails on its FKs. Archive-on-remove comes later.
  async remove(id: string) {
    const existing = await this.findRow(id)
    await this.db.delete(schema.exercises).where(eq(schema.exercises.id, id))
    this.unlinkMedia(existing)
  }

  // Resolve the absolute path of an Exercise's image (or thumb) for streaming. Throws NotFound when
  // the Exercise has no such image.
  async getImageFile(id: string, kind: 'image' | 'thumb'): Promise<string> {
    const ex = await this.findRow(id)
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

  // Write orig + thumb .webp into the shared Exercise image folder and return the relative paths.
  private async writeImage(id: string, buffer: Buffer) {
    mkdirSync(join(this.photosDir, EXERCISE_IMAGE_DIR), { recursive: true })
    const { imagePath, thumbPath } = exerciseImagePaths(id)
    await sharp(buffer).rotate().webp({ quality: 85 }).toFile(join(this.photosDir, imagePath))
    await sharp(buffer).rotate().resize({ width: 400 }).webp({ quality: 75 }).toFile(join(this.photosDir, thumbPath))
    return { imagePath, thumbPath }
  }

  private unlinkMedia(ex: DbExercise, keep?: { imagePath: string; thumbPath: string }) {
    for (const rel of [ex.imagePath, ex.thumbPath]) {
      if (rel && rel !== keep?.imagePath && rel !== keep?.thumbPath) {
        try {
          unlinkSync(join(this.photosDir, rel))
        } catch {} // eslint-disable-line no-empty
      }
    }
  }
}
