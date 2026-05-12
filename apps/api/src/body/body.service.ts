import { Injectable, Inject } from '@nestjs/common'
import { eq, desc } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { CreateBodyWeightDto, CreateMeasurementDto } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'

@Injectable()
export class BodyService {
  constructor(@Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>) {}

  getWeights(userId: string) {
    return this.db
      .select()
      .from(schema.bodyWeights)
      .where(eq(schema.bodyWeights.userId, userId))
      .orderBy(desc(schema.bodyWeights.recordedAt))
      .all()
  }

  addWeight(userId: string, dto: CreateBodyWeightDto) {
    const id = randomUUID()
    const now = Math.floor(Date.now() / 1000)
    this.db
      .insert(schema.bodyWeights)
      .values({
        id,
        userId,
        weightKg: dto.weightKg,
        recordedAt: dto.recordedAt ?? now,
        notes: dto.notes ?? null,
      })
      .run()
    return this.db.select().from(schema.bodyWeights).where(eq(schema.bodyWeights.id, id)).get()!
  }

  getMeasurements(userId: string) {
    return this.db
      .select()
      .from(schema.bodyMeasurements)
      .where(eq(schema.bodyMeasurements.userId, userId))
      .orderBy(desc(schema.bodyMeasurements.recordedAt))
      .all()
  }

  addMeasurement(userId: string, dto: CreateMeasurementDto) {
    const id = randomUUID()
    const now = Math.floor(Date.now() / 1000)
    this.db
      .insert(schema.bodyMeasurements)
      .values({
        id,
        userId,
        recordedAt: dto.recordedAt ?? now,
        chest: dto.chest ?? null,
        waist: dto.waist ?? null,
        hips: dto.hips ?? null,
        leftBicep: dto.leftBicep ?? null,
        rightBicep: dto.rightBicep ?? null,
        leftThigh: dto.leftThigh ?? null,
        rightThigh: dto.rightThigh ?? null,
        shoulders: dto.shoulders ?? null,
        neck: dto.neck ?? null,
        notes: dto.notes ?? null,
      })
      .run()
    return this.db.select().from(schema.bodyMeasurements).where(eq(schema.bodyMeasurements.id, id)).get()!
  }
}
