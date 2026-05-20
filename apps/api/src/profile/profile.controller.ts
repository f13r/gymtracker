import { Controller, Get, Patch, Body, Req } from '@nestjs/common'
import { Inject } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { AuthenticatedRequest } from '../auth/request.types'

const UpdateProfileSchema = z.object({
  age: z.number().int().positive().nullable().optional(),
  heightCm: z.number().int().positive().nullable().optional(),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).nullable().optional(),
  goal: z.enum(['hypertrophy', 'strength', 'powerlifting', 'general']).nullable().optional(),
  trainingPhase: z.enum(['accumulation', 'strength', 'peaking', 'maintenance']).nullable().optional(),
  trainingDays: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).nullable().optional(),
  sessionDurationMinutes: z.number().int().positive().nullable().optional(),
})

class UpdateProfileDto extends createZodDto(UpdateProfileSchema) {}

@Controller('profile')
export class ProfileController {
  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
  ) {}

  @Get()
  async getProfile(@Req() req: AuthenticatedRequest) {
    const [profile] = await this.db
      .select()
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, req.user.id))
      .limit(1)
    if (!profile) return null
    return {
      ...profile,
      trainingDays: profile.trainingDays ? JSON.parse(profile.trainingDays) as string[] : null,
    }
  }

  @Patch()
  async updateProfile(@Body() dto: UpdateProfileDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id
    const now = Math.floor(Date.now() / 1000)

    const updates: Partial<typeof schema.userProfiles.$inferInsert> = {
      updatedAt: now,
    }
    if (dto.age !== undefined) updates.age = dto.age
    if (dto.heightCm !== undefined) updates.heightCm = dto.heightCm
    if (dto.experienceLevel !== undefined) updates.experienceLevel = dto.experienceLevel
    if (dto.goal !== undefined) updates.goal = dto.goal
    if (dto.trainingPhase !== undefined) updates.trainingPhase = dto.trainingPhase
    if (dto.sessionDurationMinutes !== undefined) updates.sessionDurationMinutes = dto.sessionDurationMinutes
    if (dto.trainingDays !== undefined) {
      updates.trainingDays = dto.trainingDays ? JSON.stringify(dto.trainingDays) : null
    }

    const existing = await this.db
      .select({ userId: schema.userProfiles.userId })
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, userId))
      .limit(1)

    if (existing.length > 0) {
      await this.db
        .update(schema.userProfiles)
        .set(updates)
        .where(eq(schema.userProfiles.userId, userId))
    } else {
      await this.db.insert(schema.userProfiles).values({
        userId,
        updatedAt: now,
        ...updates,
      })
    }

    return this.getProfile({ user: { id: userId } } as AuthenticatedRequest)
  }
}
