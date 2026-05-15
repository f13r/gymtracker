# SQLite to PostgreSQL Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `better-sqlite3` with `pg` (node-postgres) and make all database calls async throughout the NestJS API.

**Architecture:** Drizzle ORM already supports PostgreSQL via `drizzle-orm/node-postgres` — the schema stays structurally identical (same column types), only the import and table constructor change. All synchronous `.all()` / `.get()` / `.run()` terminators are removed in favour of `await`-ing the Promise that Drizzle PG returns natively. Two services (`stats`, `exercises`) have raw SQLite-specific SQL that must be rewritten.

**Tech Stack:** Drizzle ORM (`drizzle-orm/node-postgres`), `pg` (node-postgres), Docker Compose (local Postgres 16), NestJS async lifecycle hooks.

---

## File Map

| Action | Path |
|--------|------|
| Create | `docker-compose.yml` |
| Create | `.env.example` |
| Create | `apps/api/.env` |
| Modify | `apps/api/package.json` |
| Modify | `apps/api/drizzle.config.ts` |
| Modify | `apps/api/src/drizzle/schema.ts` |
| Rewrite | `apps/api/src/drizzle/drizzle.module.ts` |
| Delete+regenerate | `apps/api/src/drizzle/migrations/` |
| Modify | `apps/api/src/sessions/session.repository.ts` |
| Modify | `apps/api/src/schedules/schedules.service.ts` |
| Modify | `apps/api/src/body/body.service.ts` |
| Modify | `apps/api/src/photos/photos.service.ts` |
| Modify | `apps/api/src/sets/sets.service.ts` |
| Modify | `apps/api/src/workouts/workouts.service.ts` |
| Modify | `apps/api/src/exercises/exercises.service.ts` |
| Modify | `apps/api/src/stats/stats.service.ts` |
| Modify | `apps/api/src/seed/seed.service.ts` |

---

## Async transformation cheat-sheet (reference for Tasks 5–11)

```typescript
// DB type — swap in every service constructor
// Before: import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
//         private db: BetterSQLite3Database<typeof schema>
// After:  import { NodePgDatabase } from 'drizzle-orm/node-postgres'
//         private db: NodePgDatabase<typeof schema>

// .all() — remove terminator, add async/await
// Before: return this.db.select().from(table).where(...).all()
// After:  return this.db.select().from(table).where(...)

// .get() — limit(1) + destructure
// Before: const row = this.db.select().from(table).where(...).get()
// After:  const [row] = await this.db.select().from(table).where(...).limit(1)

// .run() on insert — use .returning() to fold select-after-write into one query
// Before: this.db.insert(t).values({id, ...}).run()
//         return this.db.select().from(t).where(eq(t.id, id)).get()!
// After:  const [row] = await this.db.insert(t).values({...}).returning()
//         return row

// .run() on update/delete — just await
// Before: this.db.update(t).set({...}).where(...).run()
// After:  await this.db.update(t).set({...}).where(...)
```

---

## Task 1: Infrastructure — Docker Compose + env

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `apps/api/.env`

- [ ] **Step 1: Create docker-compose.yml at repo root**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: gymtracker
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

- [ ] **Step 2: Create .env.example at repo root**

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gymtracker
PHOTOS_DIR=../../data/photos
```

- [ ] **Step 3: Create apps/api/.env**

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gymtracker
PHOTOS_DIR=../../data/photos
```

- [ ] **Step 4: Start PostgreSQL**

```bash
docker compose up -d
```

Expected: container starts, `docker compose ps` shows `postgres` as `running`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add docker-compose for local postgres"
```

---

## Task 2: Swap npm packages

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Edit apps/api/package.json**

In `dependencies`, remove `better-sqlite3` and add `pg`:

```json
"pg": "^8.13.0"
```

In `devDependencies`, remove `@types/better-sqlite3` and add:

```json
"@types/pg": "^8.11.0"
```

- [ ] **Step 2: Install**

```bash
cd apps/api && npm install
```

Expected: `better-sqlite3` removed from `node_modules`, `pg` installed.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json
git commit -m "chore: swap better-sqlite3 for pg"
```

---

## Task 3: Update schema.ts and drizzle.config.ts

**Files:**
- Modify: `apps/api/src/drizzle/schema.ts`
- Modify: `apps/api/drizzle.config.ts`

- [ ] **Step 1: Update schema.ts — change import and table constructor**

Change the top of `apps/api/src/drizzle/schema.ts`:

```typescript
// Before:
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// After:
import { pgTable, text, integer, real } from 'drizzle-orm/pg-core'
```

Replace every `sqliteTable(` with `pgTable(` throughout the file (9 occurrences). Everything else in the file stays identical — `text`, `integer`, and `real` exist in both dialects.

- [ ] **Step 2: Update drizzle.config.ts**

Replace the entire file:

```typescript
import type { Config } from 'drizzle-kit'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

export default {
  schema: './src/drizzle/schema.ts',
  out: './src/drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/gymtracker',
  },
} satisfies Config
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/drizzle/schema.ts apps/api/drizzle.config.ts
git commit -m "chore: migrate drizzle schema from sqlite to postgresql"
```

---

## Task 4: Rewrite drizzle.module.ts

**Files:**
- Rewrite: `apps/api/src/drizzle/drizzle.module.ts`

- [ ] **Step 1: Replace the module**

```typescript
import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { join } from 'path'

import { DATABASE } from './drizzle.constants'
import * as schema from './schema'

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const pool = new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') })
        const db = drizzle(pool, { schema })
        await migrate(db, { migrationsFolder: join(__dirname, 'migrations') })
        return db
      },
    },
  ],
  exports: [DATABASE],
})
export class DrizzleModule {}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/drizzle/drizzle.module.ts
git commit -m "chore: rewrite drizzle module to use pg Pool"
```

---

## Task 5: Regenerate migrations

**Files:**
- Delete+regenerate: `apps/api/src/drizzle/migrations/`

- [ ] **Step 1: Delete all existing SQLite migrations**

```bash
rm -rf apps/api/src/drizzle/migrations
```

- [ ] **Step 2: Generate fresh PostgreSQL migration**

```bash
cd apps/api && npm run db:migrate -- --config drizzle.config.ts
```

Wait — `db:migrate` in package.json runs `drizzle-kit migrate` (applies migrations). First generate, then apply:

```bash
cd apps/api && npx drizzle-kit generate
```

Expected: `apps/api/src/drizzle/migrations/` recreated with a single `0000_*.sql` file containing PostgreSQL DDL.

- [ ] **Step 3: Apply migration**

```bash
cd apps/api && npm run db:migrate
```

Expected: tables created in the `gymtracker` PostgreSQL database. Verify with:

```bash
docker compose exec postgres psql -U postgres -d gymtracker -c '\dt'
```

Expected output lists: `users`, `exercises`, `workout_templates`, `template_exercises`, `workout_sessions`, `sets`, `body_weights`, `body_measurements`, `workout_schedules`, `progress_photos`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/drizzle/migrations
git commit -m "chore: replace sqlite migrations with postgres schema"
```

---

## Task 6: Convert session.repository.ts to async

**Files:**
- Modify: `apps/api/src/sessions/session.repository.ts`

- [ ] **Step 1: Rewrite the file**

```typescript
import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, isNull } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { WorkoutSession } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import { toWorkoutSession } from '../drizzle/mappers'
import * as schema from '../drizzle/schema'

type DrizzleDB = NodePgDatabase<typeof schema>

@Injectable()
export class SessionRepository {
  constructor(@Inject(DATABASE) private db: DrizzleDB) {}

  async findActive(userId: string): Promise<WorkoutSession | null> {
    const [row] = await this.db
      .select()
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, userId), isNull(schema.workoutSessions.finishedAt)))
      .limit(1)
    return row ? toWorkoutSession(row) : null
  }

  async findById(id: string, userId: string): Promise<WorkoutSession> {
    const [row] = await this.db
      .select()
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
      .limit(1)
    if (!row) {
      throw new NotFoundException('Session not found')
    }
    return toWorkoutSession(row)
  }

  async assertActive(id: string, userId: string): Promise<WorkoutSession> {
    const session = await this.findById(id, userId)
    if (session.finishedAt !== null) {
      throw new BadRequestException('Session is already finished')
    }
    return session
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/sessions/session.repository.ts
git commit -m "refactor: make SessionRepository async for postgres"
```

---

## Task 7: Convert schedules.service.ts, body.service.ts, photos.service.ts to async

**Files:**
- Modify: `apps/api/src/schedules/schedules.service.ts`
- Modify: `apps/api/src/body/body.service.ts`
- Modify: `apps/api/src/photos/photos.service.ts`

- [ ] **Step 1: Rewrite schedules.service.ts**

```typescript
import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, or, gte, lt, count } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CreateScheduleDto } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'

@Injectable()
export class SchedulesService {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  getSchedules(userId: string) {
    return this.db.select().from(schema.workoutSchedules).where(eq(schema.workoutSchedules.userId, userId))
  }

  async createSchedule(userId: string, dto: CreateScheduleDto) {
    if (dto.type === 'once' && !dto.scheduledDate) {
      throw new BadRequestException('scheduledDate is required for one-time schedules')
    }
    if (dto.type === 'weekly' && dto.dayOfWeek === undefined) {
      throw new BadRequestException('dayOfWeek is required for weekly schedules')
    }
    const [row] = await this.db
      .insert(schema.workoutSchedules)
      .values({
        id: randomUUID(),
        userId,
        templateId: dto.templateId,
        type: dto.type,
        scheduledDate: dto.scheduledDate ?? null,
        dayOfWeek: dto.dayOfWeek ?? null,
        createdAt: Math.floor(Date.now() / 1000),
      })
      .returning()
    return row
  }

  async deleteSchedule(id: string, userId: string) {
    const [existing] = await this.db
      .select()
      .from(schema.workoutSchedules)
      .where(and(eq(schema.workoutSchedules.id, id), eq(schema.workoutSchedules.userId, userId)))
      .limit(1)
    if (!existing) {
      throw new NotFoundException('Schedule not found')
    }
    await this.db
      .delete(schema.workoutSchedules)
      .where(and(eq(schema.workoutSchedules.id, id), eq(schema.workoutSchedules.userId, userId)))
  }

  async getTodaySchedule(userId: string) {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const dayOfWeek = now.getDay()

    const [match] = await this.db
      .select()
      .from(schema.workoutSchedules)
      .where(
        and(
          eq(schema.workoutSchedules.userId, userId),
          or(
            and(eq(schema.workoutSchedules.type, 'once'), eq(schema.workoutSchedules.scheduledDate, today)),
            and(eq(schema.workoutSchedules.type, 'weekly'), eq(schema.workoutSchedules.dayOfWeek, dayOfWeek)),
          ),
        ),
      )
      .limit(1)

    if (!match) { return null }

    const startOfDay = Math.floor(new Date(today).getTime() / 1000)
    const endOfDay = startOfDay + 86400
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.workoutSessions)
      .where(
        and(
          eq(schema.workoutSessions.userId, userId),
          eq(schema.workoutSessions.templateId, match.templateId!),
          gte(schema.workoutSessions.startedAt, startOfDay),
          lt(schema.workoutSessions.startedAt, endOfDay),
        ),
      )
    if (result && result.count > 0) { return null }

    const [template] = await this.db
      .select()
      .from(schema.workoutTemplates)
      .where(eq(schema.workoutTemplates.id, match.templateId!))
      .limit(1)

    const exercises = await this.db
      .select()
      .from(schema.templateExercises)
      .where(eq(schema.templateExercises.templateId, match.templateId!))

    return {
      schedule: match,
      templateName: template?.name ?? 'Workout',
      exerciseCount: exercises.length,
    }
  }
}
```

- [ ] **Step 2: Rewrite body.service.ts**

```typescript
import { Injectable, Inject } from '@nestjs/common'
import { eq, desc } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CreateBodyWeightDto, CreateMeasurementDto } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'

@Injectable()
export class BodyService {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  getWeights(userId: string) {
    return this.db
      .select()
      .from(schema.bodyWeights)
      .where(eq(schema.bodyWeights.userId, userId))
      .orderBy(desc(schema.bodyWeights.recordedAt))
  }

  async addWeight(userId: string, dto: CreateBodyWeightDto) {
    const now = Math.floor(Date.now() / 1000)
    const [row] = await this.db
      .insert(schema.bodyWeights)
      .values({
        id: randomUUID(),
        userId,
        weightKg: dto.weightKg,
        recordedAt: dto.recordedAt ?? now,
        notes: dto.notes ?? null,
      })
      .returning()
    return row
  }

  getMeasurements(userId: string) {
    return this.db
      .select()
      .from(schema.bodyMeasurements)
      .where(eq(schema.bodyMeasurements.userId, userId))
      .orderBy(desc(schema.bodyMeasurements.recordedAt))
  }

  async addMeasurement(userId: string, dto: CreateMeasurementDto) {
    const now = Math.floor(Date.now() / 1000)
    const [row] = await this.db
      .insert(schema.bodyMeasurements)
      .values({
        id: randomUUID(),
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
      .returning()
    return row
  }
}
```

- [ ] **Step 3: Rewrite photos.service.ts**

```typescript
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
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/schedules/schedules.service.ts \
        apps/api/src/body/body.service.ts \
        apps/api/src/photos/photos.service.ts
git commit -m "refactor: make schedules, body, photos services async for postgres"
```

---

## Task 8: Convert sets.service.ts and workouts.service.ts to async

**Files:**
- Modify: `apps/api/src/sets/sets.service.ts`
- Modify: `apps/api/src/workouts/workouts.service.ts`

Both depend on `SessionRepository` which is now async — callers must `await` its methods.

- [ ] **Step 1: Rewrite sets.service.ts**

```typescript
import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CreateSetDto, UpdateSetDto } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { toWorkoutSet } from '../drizzle/mappers'
import { SessionRepository } from '../sessions/session.repository'
import { randomUUID } from 'crypto'

@Injectable()
export class SetsService {
  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private sessions: SessionRepository,
  ) {}

  async getSessionSets(sessionId: string, userId: string) {
    await this.sessions.assertActive(sessionId, userId)
    const rows = await this.db.select().from(schema.sets).where(eq(schema.sets.sessionId, sessionId))
    return rows.map(toWorkoutSet)
  }

  async logSet(sessionId: string, userId: string, dto: CreateSetDto) {
    await this.sessions.assertActive(sessionId, userId)
    const [row] = await this.db
      .insert(schema.sets)
      .values({
        id: randomUUID(),
        sessionId,
        exerciseId: dto.exerciseId,
        setNumber: dto.setNumber,
        reps: dto.reps ?? null,
        weightKg: dto.weightKg ?? null,
        durationSec: dto.durationSec ?? null,
        rpe: dto.rpe ?? null,
        done: dto.done ? 1 : 0,
        completedAt: dto.done ? Math.floor(Date.now() / 1000) : null,
      })
      .returning()
    return toWorkoutSet(row)
  }

  async updateSet(sessionId: string, setId: string, userId: string, dto: UpdateSetDto) {
    await this.sessions.assertActive(sessionId, userId)
    const [set] = await this.db
      .select()
      .from(schema.sets)
      .where(and(eq(schema.sets.id, setId), eq(schema.sets.sessionId, sessionId)))
      .limit(1)
    if (!set) {
      throw new NotFoundException('Set not found')
    }
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(dto).map(([k, v]) => [k, k === 'done' ? (v ? 1 : 0) : (v ?? null)]),
    )
    if ('done' in dto) {
      patch.completedAt = dto.done ? Math.floor(Date.now() / 1000) : null
    }
    const [updated] = await this.db
      .update(schema.sets)
      .set(patch)
      .where(eq(schema.sets.id, setId))
      .returning()
    return toWorkoutSet(updated)
  }

  async deleteSet(sessionId: string, setId: string, userId: string) {
    await this.sessions.assertActive(sessionId, userId)
    const [set] = await this.db
      .select()
      .from(schema.sets)
      .where(and(eq(schema.sets.id, setId), eq(schema.sets.sessionId, sessionId)))
      .limit(1)
    if (!set) {
      throw new NotFoundException('Set not found')
    }
    await this.db.delete(schema.sets).where(eq(schema.sets.id, setId))
  }
}
```

- [ ] **Step 2: Rewrite workouts.service.ts**

```typescript
import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, desc } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CreateTemplateDto, FinishSessionDto, StartSessionDto } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { toWorkoutSession, toWorkoutSet } from '../drizzle/mappers'
import { SessionRepository } from '../sessions/session.repository'
import { randomUUID } from 'crypto'

@Injectable()
export class WorkoutsService {
  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private sessions: SessionRepository,
  ) {}

  async getTemplates(userId: string) {
    const templates = await this.db
      .select()
      .from(schema.workoutTemplates)
      .where(eq(schema.workoutTemplates.userId, userId))
      .orderBy(desc(schema.workoutTemplates.createdAt))
    return Promise.all(
      templates.map(async t => ({
        ...t,
        exercises: await this.db
          .select()
          .from(schema.templateExercises)
          .where(eq(schema.templateExercises.templateId, t.id)),
      })),
    )
  }

  async getTemplate(id: string, userId: string) {
    const [t] = await this.db
      .select()
      .from(schema.workoutTemplates)
      .where(and(eq(schema.workoutTemplates.id, id), eq(schema.workoutTemplates.userId, userId)))
      .limit(1)
    if (!t) {
      throw new NotFoundException('Template not found')
    }
    const exercises = await this.db
      .select()
      .from(schema.templateExercises)
      .where(eq(schema.templateExercises.templateId, id))
    return { ...t, exercises }
  }

  async createTemplate(userId: string, dto: CreateTemplateDto) {
    const id = randomUUID()
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .insert(schema.workoutTemplates)
      .values({ id, userId, name: dto.name, notes: dto.notes ?? null, createdAt: now })
    for (const ex of dto.exercises) {
      await this.db
        .insert(schema.templateExercises)
        .values({
          id: randomUUID(),
          templateId: id,
          ...ex,
          defaultWeightKg: ex.defaultWeightKg ?? null,
          defaultSets: ex.defaultSets ?? null,
          defaultReps: ex.defaultReps ?? null,
        })
    }
    return this.getTemplate(id, userId)
  }

  async deleteTemplate(id: string, userId: string) {
    await this.getTemplate(id, userId)
    await this.db.delete(schema.workoutSchedules).where(eq(schema.workoutSchedules.templateId, id))
    await this.db.update(schema.workoutSessions).set({ templateId: null }).where(eq(schema.workoutSessions.templateId, id))
    await this.db.delete(schema.templateExercises).where(eq(schema.templateExercises.templateId, id))
    await this.db.delete(schema.workoutTemplates).where(and(eq(schema.workoutTemplates.id, id), eq(schema.workoutTemplates.userId, userId)))
  }

  async getSessions(userId: string) {
    const rows = await this.db
      .select()
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.userId, userId))
      .orderBy(desc(schema.workoutSessions.startedAt))
    return rows.map(toWorkoutSession)
  }

  async getSession(id: string, userId: string) {
    const [s] = await this.db
      .select()
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
      .limit(1)
    if (!s) {
      throw new NotFoundException('Session not found')
    }
    const sessionSets = await this.db.select().from(schema.sets).where(eq(schema.sets.sessionId, id))
    return { ...toWorkoutSession(s), sets: sessionSets.map(toWorkoutSet) }
  }

  async getActiveSession(userId: string) {
    return this.sessions.findActive(userId)
  }

  async startSession(userId: string, dto: StartSessionDto) {
    const active = await this.getActiveSession(userId)
    if (active) {
      throw new BadRequestException('A session is already active')
    }
    const id = randomUUID()
    await this.db
      .insert(schema.workoutSessions)
      .values({
        id,
        userId,
        templateId: dto.templateId ?? null,
        name: dto.name,
        startedAt: Math.floor(Date.now() / 1000),
        finishedAt: null,
        notes: null,
      })
    return this.getSession(id, userId)
  }

  async finishSession(id: string, userId: string, dto: FinishSessionDto) {
    await this.getSession(id, userId)
    await this.db
      .update(schema.workoutSessions)
      .set({ finishedAt: Math.floor(Date.now() / 1000), notes: dto.notes ?? null })
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
    return this.getSession(id, userId)
  }

  async deleteSession(id: string, userId: string) {
    await this.getSession(id, userId)
    await this.db.delete(schema.sets).where(eq(schema.sets.sessionId, id))
    await this.db
      .delete(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/sets/sets.service.ts apps/api/src/workouts/workouts.service.ts
git commit -m "refactor: make sets and workouts services async for postgres"
```

---

## Task 9: Rewrite exercises.service.ts (async + raw SQL)

**Files:**
- Modify: `apps/api/src/exercises/exercises.service.ts`

`getLastSets` uses `$client.prepare()` (better-sqlite3 specific). Replace with `db.execute(sql\`...\`)`.

- [ ] **Step 1: Rewrite the file**

```typescript
import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and, or, sql } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CreateExerciseDto, UpdateExerciseDto, WorkoutSet } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
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
        equipment: dto.equipment ?? null,
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
    const result = await this.db.execute(sql`
      SELECT s.id, s.session_id AS "sessionId", s.exercise_id AS "exerciseId",
             s.set_number AS "setNumber", s.reps, s.weight_kg AS "weightKg",
             s.duration_sec AS "durationSec", s.rpe,
             s.completed_at AS "completedAt", s.done
      FROM sets s
      WHERE s.session_id = (
        SELECT ws.id FROM workout_sessions ws
        INNER JOIN sets s2 ON s2.session_id = ws.id
        WHERE ws.user_id = ${userId} AND s2.exercise_id = ${exerciseId} AND ws.finished_at IS NOT NULL
        ORDER BY ws.finished_at DESC LIMIT 1
      ) AND s.exercise_id = ${exerciseId}
      ORDER BY s.set_number ASC
    `)
    return result.rows.map(r => toWorkoutSet(r as DbSet))
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/exercises/exercises.service.ts
git commit -m "refactor: make exercises service async, port getLastSets to pg"
```

---

## Task 10: Rewrite stats.service.ts (async + SQLite SQL → PostgreSQL)

**Files:**
- Modify: `apps/api/src/stats/stats.service.ts`

SQLite-specific functions to replace:
- `date(col, 'unixepoch')` → `to_char(to_timestamp(col), 'YYYY-MM-DD')`
- `strftime('%Y-W%W', col, 'unixepoch')` → `to_char(to_timestamp(col), 'IYYY-"W"IW')`
- `getPRs` raw query via `$client.prepare()` → `db.execute(sql\`...\`)`

- [ ] **Step 1: Rewrite the file**

```typescript
import { Injectable, Inject } from '@nestjs/common'
import { eq, and, gte, lte, sql, isNotNull, count, desc } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { calculateStreak } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import type { VolumePoint, FrequencyPoint, PersonalRecord, WorkoutStreak } from '@gymtracker/shared'

@Injectable()
export class StatsService {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  async getPRs(userId: string, exerciseId?: string, limit = 10): Promise<PersonalRecord[]> {
    const result = await this.db.execute(sql`
      WITH ranked AS (
        SELECT s.exercise_id, e.name,
               s.weight_kg      AS "maxWeightKg",
               s.reps           AS "repsAtMax",
               s.completed_at   AS "achievedAt",
               ROW_NUMBER() OVER (PARTITION BY s.exercise_id ORDER BY s.weight_kg DESC) AS rn
        FROM sets s
        JOIN workout_sessions ws ON s.session_id = ws.id
        JOIN exercises e ON s.exercise_id = e.id
        WHERE ws.user_id = ${userId} AND s.done = 1
        ${exerciseId ? sql`AND s.exercise_id = ${exerciseId}` : sql``}
      )
      SELECT exercise_id AS "exerciseId", name, "maxWeightKg", "repsAtMax", "achievedAt"
      FROM ranked
      WHERE rn = 1
      ORDER BY "maxWeightKg" DESC
      LIMIT ${limit}
    `)
    return result.rows as PersonalRecord[]
  }

  async getVolume(userId: string, exerciseId?: string, from?: number, to?: number): Promise<VolumePoint[]> {
    const conditions = [
      eq(schema.workoutSessions.userId, userId),
      eq(schema.sets.done, 1),
      isNotNull(schema.sets.reps),
      isNotNull(schema.sets.weightKg),
    ]
    if (exerciseId) conditions.push(eq(schema.sets.exerciseId, exerciseId))
    if (from) conditions.push(gte(schema.sets.completedAt, from))
    if (to) conditions.push(lte(schema.sets.completedAt, to))

    return this.db
      .select({
        date: sql<string>`to_char(to_timestamp(${schema.sets.completedAt}), 'YYYY-MM-DD')`,
        volume: sql<number>`SUM(${schema.sets.reps} * ${schema.sets.weightKg})`,
      })
      .from(schema.sets)
      .innerJoin(schema.workoutSessions, eq(schema.sets.sessionId, schema.workoutSessions.id))
      .where(and(...conditions))
      .groupBy(sql`to_char(to_timestamp(${schema.sets.completedAt}), 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(to_timestamp(${schema.sets.completedAt}), 'YYYY-MM-DD')`)
  }

  async getStreak(userId: string): Promise<WorkoutStreak> {
    const days = await this.db
      .selectDistinct({ day: sql<string>`to_char(to_timestamp(${schema.workoutSessions.startedAt}), 'YYYY-MM-DD')` })
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, userId), isNotNull(schema.workoutSessions.finishedAt)))
      .orderBy(desc(sql<string>`to_char(to_timestamp(${schema.workoutSessions.startedAt}), 'YYYY-MM-DD')`))
    return calculateStreak(days.map(r => r.day))
  }

  getBodyWeight(userId: string, from?: number, to?: number) {
    const conditions = [eq(schema.bodyWeights.userId, userId)]
    if (from) conditions.push(gte(schema.bodyWeights.recordedAt, from))
    if (to) conditions.push(lte(schema.bodyWeights.recordedAt, to))
    return this.db
      .select()
      .from(schema.bodyWeights)
      .where(and(...conditions))
      .orderBy(schema.bodyWeights.recordedAt)
  }

  getMeasurements(userId: string, from?: number, to?: number) {
    const conditions = [eq(schema.bodyMeasurements.userId, userId)]
    if (from) conditions.push(gte(schema.bodyMeasurements.recordedAt, from))
    if (to) conditions.push(lte(schema.bodyMeasurements.recordedAt, to))
    return this.db
      .select()
      .from(schema.bodyMeasurements)
      .where(and(...conditions))
      .orderBy(schema.bodyMeasurements.recordedAt)
  }

  async getFrequency(userId: string, from?: number, to?: number): Promise<FrequencyPoint[]> {
    const conditions = [eq(schema.workoutSessions.userId, userId), isNotNull(schema.workoutSessions.finishedAt)]
    if (from) conditions.push(gte(schema.workoutSessions.startedAt, from))
    if (to) conditions.push(lte(schema.workoutSessions.startedAt, to))

    return this.db
      .select({
        week: sql<string>`to_char(to_timestamp(${schema.workoutSessions.startedAt}), 'IYYY-"W"IW')`,
        count: count(),
      })
      .from(schema.workoutSessions)
      .where(and(...conditions))
      .groupBy(sql`to_char(to_timestamp(${schema.workoutSessions.startedAt}), 'IYYY-"W"IW')`)
      .orderBy(sql`to_char(to_timestamp(${schema.workoutSessions.startedAt}), 'IYYY-"W"IW')`)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/stats/stats.service.ts
git commit -m "refactor: make stats service async, port SQLite SQL to PostgreSQL"
```

---

## Task 11: Convert seed.service.ts to async

**Files:**
- Modify: `apps/api/src/seed/seed.service.ts`

NestJS supports async `onApplicationBootstrap()` — just add `async`.

- [ ] **Step 1: Rewrite the file**

```typescript
import { Injectable, Inject, OnApplicationBootstrap } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'

const DEFAULT_EXERCISES = [
  { name: 'Bench Press', category: 'push', equipment: 'barbell' },
  { name: 'Squat', category: 'legs', equipment: 'barbell' },
  { name: 'Deadlift', category: 'pull', equipment: 'barbell' },
  { name: 'Overhead Press', category: 'push', equipment: 'barbell' },
  { name: 'Barbell Row', category: 'pull', equipment: 'barbell' },
  { name: 'Romanian Deadlift', category: 'legs', equipment: 'barbell' },
  { name: 'Front Squat', category: 'legs', equipment: 'barbell' },
  { name: 'Incline Bench Press', category: 'push', equipment: 'barbell' },
  { name: 'Dumbbell Press', category: 'push', equipment: 'dumbbell' },
  { name: 'Dumbbell Row', category: 'pull', equipment: 'dumbbell' },
  { name: 'Lateral Raise', category: 'push', equipment: 'dumbbell' },
  { name: 'Bicep Curl', category: 'pull', equipment: 'dumbbell' },
  { name: 'Tricep Extension', category: 'push', equipment: 'dumbbell' },
  { name: 'Dumbbell Lunge', category: 'legs', equipment: 'dumbbell' },
  { name: 'Bulgarian Split Squat', category: 'legs', equipment: 'dumbbell' },
  { name: 'Leg Press', category: 'legs', equipment: 'machine' },
  { name: 'Leg Curl', category: 'legs', equipment: 'machine' },
  { name: 'Leg Extension', category: 'legs', equipment: 'machine' },
  { name: 'Cable Row', category: 'pull', equipment: 'cable' },
  { name: 'Lat Pulldown', category: 'pull', equipment: 'cable' },
  { name: 'Chest Fly', category: 'push', equipment: 'machine' },
  { name: 'Cable Lateral Raise', category: 'push', equipment: 'cable' },
  { name: 'Pull-up', category: 'pull', equipment: 'bodyweight' },
  { name: 'Chin-up', category: 'pull', equipment: 'bodyweight' },
  { name: 'Push-up', category: 'push', equipment: 'bodyweight' },
  { name: 'Dip', category: 'push', equipment: 'bodyweight' },
  { name: 'Plank', category: 'core', equipment: 'bodyweight' },
  { name: 'Hollow Hold', category: 'core', equipment: 'bodyweight' },
  { name: 'Running', category: 'cardio', equipment: 'other' },
  { name: 'Cycling', category: 'cardio', equipment: 'other' },
  { name: 'Rowing (erg)', category: 'cardio', equipment: 'other' },
  { name: 'Jump Rope', category: 'cardio', equipment: 'other' },
]

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedUser()
    await this.seedExercises()
  }

  private async seedUser() {
    const [existing] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, 'default-user'))
      .limit(1)
    if (existing) return

    await this.db.insert(schema.users).values({
      id: 'default-user',
      displayName: 'Viktor',
      createdAt: Math.floor(Date.now() / 1000),
    })
  }

  private async seedExercises() {
    const [existing] = await this.db
      .select()
      .from(schema.exercises)
      .where(eq(schema.exercises.isDefault, 1))
      .limit(1)
    if (existing) return

    const now = Math.floor(Date.now() / 1000)
    for (const ex of DEFAULT_EXERCISES) {
      await this.db.insert(schema.exercises).values({
        id: randomUUID(),
        userId: 'default-user',
        name: ex.name,
        category: ex.category,
        equipment: ex.equipment,
        isDefault: 1,
        createdAt: now,
      })
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/seed/seed.service.ts
git commit -m "refactor: make seed service async for postgres"
```

---

## Task 12: Verify end-to-end

- [ ] **Step 1: Build to check for TypeScript errors**

```bash
cd apps/api && npm run build
```

Expected: no TypeScript compilation errors. Fix any type errors before continuing.

- [ ] **Step 2: Start the API**

```bash
cd apps/api && npm run dev
```

Expected: API starts, migration runs, seed data is inserted. No errors in console.

- [ ] **Step 3: Smoke test core endpoints**

```bash
# Should return the seeded exercises list
curl -s http://localhost:3000/exercises | jq '.[0]'

# Should return an empty sessions list
curl -s http://localhost:3000/sessions | jq .

# Should return stats without errors
curl -s http://localhost:3000/stats/volume | jq .
```

Expected: valid JSON responses, no 500 errors.

- [ ] **Step 4: Add .env to .gitignore if not already present**

```bash
grep -q 'apps/api/.env' .gitignore || echo 'apps/api/.env' >> .gitignore
```

- [ ] **Step 5: Final commit**

```bash
git add .gitignore
git commit -m "chore: ignore api .env file"
```
