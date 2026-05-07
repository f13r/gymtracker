import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { mkdirSync } from 'fs';
import sharp from 'sharp';
import { DATABASE } from '../drizzle/drizzle.constants';
import * as schema from '../drizzle/schema';

@Injectable()
export class PhotosService {
  private readonly photosDir: string;

  constructor(
    @Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>,
    private config: ConfigService,
  ) {
    this.photosDir = config.getOrThrow<string>('PHOTOS_DIR');
  }

  getPhotos(userId: string) {
    return this.db.select().from(schema.progressPhotos)
      .where(eq(schema.progressPhotos.userId, userId))
      .orderBy(desc(schema.progressPhotos.recordedAt)).all();
  }

  async uploadPhoto(userId: string, buffer: Buffer, bodyWeight?: number, tags?: string[], notes?: string) {
    const id = randomUUID();
    const userDir = join(this.photosDir, userId);
    mkdirSync(userDir, { recursive: true });

    const origPath = join(userDir, `${id}-orig.webp`);
    const thumbPath = join(userDir, `${id}-thumb.webp`);
    const relOrig = `${userId}/${id}-orig.webp`;
    const relThumb = `${userId}/${id}-thumb.webp`;

    await sharp(buffer).rotate().webp({ quality: 85 }).toFile(origPath);
    await sharp(buffer).rotate().resize({ width: 400 }).webp({ quality: 75 }).toFile(thumbPath);

    const now = Math.floor(Date.now() / 1000);
    this.db.insert(schema.progressPhotos).values({
      id, userId,
      recordedAt: now,
      filePath: relOrig,
      thumbPath: relThumb,
      bodyWeight: bodyWeight ?? null,
      tags: tags ? JSON.stringify(tags) : null,
      notes: notes ?? null,
    }).run();

    return this.db.select().from(schema.progressPhotos).where(eq(schema.progressPhotos.id, id)).get()!;
  }

  getPhotoPath(userId: string, filename: string) {
    return join(this.photosDir, userId, filename);
  }
}
