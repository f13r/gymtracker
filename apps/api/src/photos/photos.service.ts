import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, desc, and } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import sharp from 'sharp'

import type { ProgressPhoto } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import { toProgressPhoto } from '../drizzle/mappers'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'
import { mkdirSync, unlinkSync } from 'fs'
import { join, resolve, sep } from 'path'

// The user id becomes a folder name under PHOTOS_DIR, so it must be one plain path segment.
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/

@Injectable()
export class PhotosService {
  private readonly photosDir: string

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private config: ConfigService,
  ) {
    this.photosDir = config.getOrThrow<string>('PHOTOS_DIR')
  }

  async getPhotos(userId: string): Promise<ProgressPhoto[]> {
    const rows = await this.db
      .select()
      .from(schema.progressPhotos)
      .where(eq(schema.progressPhotos.userId, userId))
      .orderBy(desc(schema.progressPhotos.recordedAt))
    return rows.map(toProgressPhoto)
  }

  async uploadPhoto(userId: string, buffer: Buffer, bodyWeight?: number, tags?: string[], notes?: string) {
    if (!SAFE_PATH_SEGMENT.test(userId)) {
      throw new BadRequestException('Invalid user id')
    }
    const id = randomUUID()
    const userDir = join(this.photosDir, userId)
    mkdirSync(userDir, { recursive: true })

    const origPath = join(userDir, `${id}-orig.webp`)
    const thumbPath = join(userDir, `${id}-thumb.webp`)
    const relOrig = `${userId}/${id}-orig.webp`
    const relThumb = `${userId}/${id}-thumb.webp`

    await sharp(buffer).rotate().webp({ quality: 85 }).toFile(origPath)
    await sharp(buffer).rotate().resize({ width: 400 }).webp({ quality: 75 }).toFile(thumbPath)

    const [row] = await this.db
      .insert(schema.progressPhotos)
      .values({
        id,
        userId,
        recordedAt: Math.floor(Date.now() / 1000),
        filePath: relOrig,
        thumbPath: relThumb,
        bodyWeight: bodyWeight ?? null,
        tags: tags ? JSON.stringify(tags) : null,
        notes: notes ?? null,
      })
      .returning()

    return toProgressPhoto(row!)
  }

  async deletePhoto(id: string, userId: string) {
    const [photo] = await this.db
      .select()
      .from(schema.progressPhotos)
      .where(and(eq(schema.progressPhotos.id, id), eq(schema.progressPhotos.userId, userId)))
      .limit(1)
    if (!photo) {
      throw new NotFoundException('Photo not found')
    }

    for (const rel of [photo.filePath, photo.thumbPath]) {
      try {
        unlinkSync(join(this.photosDir, rel))
      } catch {} // eslint-disable-line no-empty
    }
    await this.db.delete(schema.progressPhotos).where(eq(schema.progressPhotos.id, id))
  }

  // Serve a progress photo by id, only to its owner: anyone else (or an unknown id) gets a 404.
  async getPhotoFile(id: string, userId: string, kind: 'file' | 'thumb'): Promise<string> {
    const [photo] = await this.db
      .select()
      .from(schema.progressPhotos)
      .where(and(eq(schema.progressPhotos.id, id), eq(schema.progressPhotos.userId, userId)))
      .limit(1)
    if (!photo) {
      throw new NotFoundException('Photo not found')
    }
    return this.resolveInPhotosDir(kind === 'thumb' ? photo.thumbPath : photo.filePath)
  }

  // Defence in depth: a stored relative path must never resolve outside PHOTOS_DIR.
  private resolveInPhotosDir(rel: string): string {
    const root = resolve(this.photosDir)
    const full = resolve(root, rel)
    if (!full.startsWith(root + sep)) {
      throw new NotFoundException('Photo not found')
    }
    return full
  }
}
