import { Injectable, Inject, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, and, or, inArray, desc } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import sharp from 'sharp'

import { AnalyzeSuggestion, EquipmentWithExercises, SuggestedExercise } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import { toEquipmentWithExercises } from '../drizzle/mappers'
import * as schema from '../drizzle/schema'
import { GymService } from '../gym/gym.service'
import { randomUUID } from 'crypto'
import { mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

type GeminiRaw = {
  candidates: Array<{ content: { parts: Array<{ text: string }> } }>
}

type GeminiParsed = {
  equipment: { name: string; tags: string[] }
  exercises: Array<{ name: string; category: string; equipmentType: string; tags: string[] }>
}

@Injectable()
export class EquipmentService {
  private readonly logger = new Logger(EquipmentService.name)
  private readonly geminiApiKey: string
  private readonly photosDir: string

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private config: ConfigService,
    private gymService: GymService,
  ) {
    this.geminiApiKey = config.getOrThrow<string>('GEMINI_API_KEY')
    this.photosDir = config.getOrThrow<string>('PHOTOS_DIR')
  }

  getPhotosDir(): string {
    return this.photosDir
  }

  async analyze(
    userId: string,
    buffer: Buffer,
    mimeType: string,
    equipmentType: string,
    description: string,
  ): Promise<AnalyzeSuggestion> {
    const base64 = buffer.toString('base64')

    const response = await fetch(`${GEMINI_URL}?key=${this.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType, data: base64 } },
              {
                text:
                  `Analyze this gym equipment photo. Equipment type: ${equipmentType}. User description: ${description}.\n\n` +
                  `List all exercises that can be performed with this equipment. ` +
                  `Describe each exercise's body position accurately based on what the equipment shows (e.g. seated, lying, standing, incline) — do not assume a default position if the equipment clearly shows otherwise. ` +
                  `Also suggest a concise name for this specific equipment instance (e.g. "Left Cable Tower", "Adjustable Incline Bench").`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              equipment: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING' },
                  tags: { type: 'ARRAY', items: { type: 'STRING' } },
                },
                required: ['name', 'tags'],
              },
              exercises: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    name: { type: 'STRING' },
                    category: {
                      type: 'STRING',
                      enum: ['push', 'pull', 'legs', 'core', 'cardio', 'other'],
                    },
                    equipmentType: {
                      type: 'STRING',
                      enum: ['barbell', 'dumbbell', 'machine', 'bodyweight', 'cable', 'other'],
                    },
                    tags: { type: 'ARRAY', items: { type: 'STRING' } },
                  },
                  required: ['name', 'category', 'equipmentType', 'tags'],
                },
              },
            },
            required: ['equipment', 'exercises'],
          },
        },
      }),
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => '(unreadable)')
      this.logger.error(`Gemini ${response.status}: ${errBody}`)
      throw new UnprocessableEntityException('AI analysis failed — try again or fill in manually')
    }

    const gemini = (await response.json()) as GeminiRaw
    const text = gemini.candidates[0]?.content.parts[0]?.text
    if (!text) {
      throw new UnprocessableEntityException('AI analysis failed — try again or fill in manually')
    }

    let parsed: GeminiParsed
    try {
      parsed = JSON.parse(text) as GeminiParsed
    } catch {
      throw new UnprocessableEntityException('AI analysis failed — try again or fill in manually')
    }

    const allExercises = await this.db
      .select()
      .from(schema.exercises)
      .where(or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1)))

    const byName = new Map(allExercises.map(e => [e.name.toLowerCase(), e.id]))

    const exercises: SuggestedExercise[] = parsed.exercises.map(e => ({
      name: e.name,
      category: e.category,
      equipmentType: e.equipmentType,
      tags: e.tags ?? [],
      existingId: byName.get(e.name.toLowerCase()) ?? null,
    }))

    return { equipment: parsed.equipment, exercises }
  }

  async create(
    userId: string,
    buffer: Buffer,
    name: string,
    equipmentType: string,
    description: string | undefined,
    tags: string[],
    exercises: Array<{ existingId?: string; name: string; category: string; equipmentType: string }>,
  ): Promise<EquipmentWithExercises> {
    const gym = await this.gymService.getOrCreateForUser(userId)

    const id = randomUUID()
    const equipDir = join(this.photosDir, userId, 'equipment')
    mkdirSync(equipDir, { recursive: true })

    const relOrig = `${userId}/equipment/${id}-orig.webp`
    const relThumb = `${userId}/equipment/${id}-thumb.webp`

    await sharp(buffer).rotate().webp({ quality: 85 }).toFile(join(this.photosDir, relOrig))
    await sharp(buffer).rotate().resize({ width: 400 }).webp({ quality: 75 }).toFile(join(this.photosDir, relThumb))

    let equipRow: typeof schema.equipment.$inferSelect
    try {
      const [row] = await this.db
        .insert(schema.equipment)
        .values({
          id,
          gymId: gym.id,
          name,
          equipmentType: equipmentType ?? null,
          description: description ?? null,
          tags: tags.length ? JSON.stringify(tags) : null,
          photoPath: relOrig,
          thumbPath: relThumb,
          createdAt: Math.floor(Date.now() / 1000),
        })
        .returning()
      equipRow = row!
    } catch (err) {
      for (const abs of [join(this.photosDir, relOrig), join(this.photosDir, relThumb)]) {
        try {
          unlinkSync(abs)
        } catch {}
      }
      throw err
    }

    const exerciseIds: string[] = []
    const now = Math.floor(Date.now() / 1000)

    for (const ex of exercises) {
      if (ex.existingId) {
        await this.db
          .update(schema.exercises)
          .set({ name: ex.name })
          .where(
            and(
              eq(schema.exercises.id, ex.existingId),
              eq(schema.exercises.userId, userId),
              eq(schema.exercises.isDefault, 0),
            ),
          )
        exerciseIds.push(ex.existingId)
      } else {
        const [newEx] = await this.db
          .insert(schema.exercises)
          .values({
            id: randomUUID(),
            userId,
            name: ex.name,
            category: ex.category,
            equipmentType: ex.equipmentType,
            notes: null,
            isDefault: 0,
            createdAt: now,
          })
          .returning()
        exerciseIds.push(newEx!.id)
      }
    }

    if (exerciseIds.length > 0) {
      await this.db
        .insert(schema.equipmentExercises)
        .values(exerciseIds.map(exerciseId => ({ equipmentId: id, exerciseId })))
    }

    const linked = await this.db
      .select({ exercise: schema.exercises })
      .from(schema.equipmentExercises)
      .innerJoin(schema.exercises, eq(schema.equipmentExercises.exerciseId, schema.exercises.id))
      .where(eq(schema.equipmentExercises.equipmentId, id))

    return toEquipmentWithExercises(
      equipRow!,
      linked.map(r => r.exercise),
    )
  }

  async findAll(userId: string): Promise<EquipmentWithExercises[]> {
    const rows = await this.db
      .select({ equipment: schema.equipment })
      .from(schema.equipment)
      .innerJoin(schema.gyms, eq(schema.equipment.gymId, schema.gyms.id))
      .where(eq(schema.gyms.userId, userId))
      .orderBy(desc(schema.equipment.createdAt))

    if (rows.length === 0) {
      return []
    }

    const equipmentIds = rows.map(r => r.equipment.id)
    const links = await this.db
      .select({
        equipmentId: schema.equipmentExercises.equipmentId,
        exercise: schema.exercises,
      })
      .from(schema.equipmentExercises)
      .innerJoin(schema.exercises, eq(schema.equipmentExercises.exerciseId, schema.exercises.id))
      .where(inArray(schema.equipmentExercises.equipmentId, equipmentIds))

    const byEquipment = new Map<string, (typeof schema.exercises.$inferSelect)[]>()
    for (const link of links) {
      const arr = byEquipment.get(link.equipmentId) ?? []
      arr.push(link.exercise)
      byEquipment.set(link.equipmentId, arr)
    }

    return rows.map(r => toEquipmentWithExercises(r.equipment, byEquipment.get(r.equipment.id) ?? []))
  }

  async delete(id: string, userId: string): Promise<void> {
    const [row] = await this.db
      .select({ equipment: schema.equipment })
      .from(schema.equipment)
      .innerJoin(schema.gyms, eq(schema.equipment.gymId, schema.gyms.id))
      .where(and(eq(schema.equipment.id, id), eq(schema.gyms.userId, userId)))
      .limit(1)

    if (!row) {
      throw new NotFoundException('Equipment not found')
    }

    for (const rel of [row.equipment.photoPath, row.equipment.thumbPath]) {
      if (!rel) {
        continue
      }
      try {
        unlinkSync(join(this.photosDir, rel))
      } catch {} // eslint-disable-line no-empty
    }

    await this.db.delete(schema.equipment).where(eq(schema.equipment.id, id))
  }
}
