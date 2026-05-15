import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, desc, and } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import sharp from 'sharp'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'
import { mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'

@Injectable()
export class PhotosService {
  private readonly photosDir: string

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private config: ConfigService,
  ) {
    this.photosDir = config.getOrThrow<string>('PHOTOS_DIR')
  }

  getPhotos(userId: string) {
    return this.db
      .select()
      .from(schema.progressPhotos)
      .where(eq(schema.progressPhotos.userId, userId))
      .orderBy(desc(schema.progressPhotos.recordedAt))
  }

  async uploadPhoto(userId: string, buffer: Buffer, bodyWeight?: number, tags?: string[], notes?: string) {
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

    return row
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
      try { unlinkSync(join(this.photosDir, rel)) } catch {} // eslint-disable-line no-empty
    }
    await this.db.delete(schema.progressPhotos).where(eq(schema.progressPhotos.id, id))
  }

  getPhotoPath(userId: string, filename: string) {
    return join(this.photosDir, userId, filename)
  }
}
