# Progression Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every finished Session, generate one AI-driven Progression Suggestion per exercise (suggested sets/reps/weight + reason + evidence) via a single async Gemini batch call; surface the suggestion in the workout logger's weight/reps inputs with last-done values shown below and an expandable "why?" panel.

**Architecture:** NestJS `ProgressionModule` owns a `ProgressionService` that builds a text prompt from session data (last-sets, PRs, 4-week volume, weekly frequency, user profile, most recent body weight), calls Gemini once for all exercises, and upserts results into `progression_suggestions` (one row per user+exercise, replaced each time). `WorkoutsService.finishSession` fires this call without awaiting. The React logger fetches the active suggestion via a new `GET /exercises/:id/progression-suggestion` endpoint and pre-populates the pending-set inputs with PS values (falling back to last-done, then template default). Last-done values are shown in small text below; reason+evidence are accessible via an expandable toggle.

**Tech Stack:** NestJS, Drizzle ORM (PostgreSQL), Gemini 2.5 Flash (same as Equipment Analysis), Vitest (shared package tests), React + TanStack Query (web)

---

## File Map

**Create:**
- `packages/shared/src/progression.schema.ts` — `ProgressionSuggestion` type used by both API and web
- `apps/api/src/progression/progression.service.ts` — context building, Gemini call, upsert
- `apps/api/src/progression/progression.controller.ts` — `GET /exercises/:id/progression-suggestion`
- `apps/api/src/progression/progression.module.ts` — NestJS module

**Modify:**
- `packages/shared/src/index.ts` — re-export `progression.schema`
- `apps/api/src/drizzle/schema.ts` — add `userProfiles` and `progressionSuggestions` tables
- `apps/api/src/app.module.ts` — import `ProgressionModule`
- `apps/api/src/workouts/workouts.service.ts` — fire-and-forget in `finishSession`
- `apps/api/src/workouts/workouts.module.ts` — import `ProgressionModule` to inject the service
- `apps/web/src/api/exercises.ts` — add `getProgressionSuggestion`
- `apps/web/src/components/workout/WorkoutLogger.tsx` — fetch PS, update pre-population, update `PendingSetRow`

**Generate (via drizzle-kit):**
- `apps/api/src/drizzle/migrations/0004_*.sql`

---

### Task 1: Shared `ProgressionSuggestion` type

**Files:**
- Create: `packages/shared/src/progression.schema.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the shared type file**

```typescript
// packages/shared/src/progression.schema.ts

export type ProgressionSuggestion = {
  id: string
  userId: string
  exerciseId: string
  suggestedSets: number
  suggestedReps: number
  suggestedWeightKg: number
  reason: string
  evidence: string[]
  createdAt: number
}
```

- [ ] **Step 2: Export it from the shared package index**

In `packages/shared/src/index.ts`, add at the end:

```typescript
export * from './progression.schema.js'
```

- [ ] **Step 3: Build shared package to verify no type errors**

```bash
cd packages/shared && npm run build
```

Expected: exits 0, `dist/` updated with `progression.schema.d.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/progression.schema.ts packages/shared/src/index.ts
git commit -m "feat: add ProgressionSuggestion shared type"
```

---

### Task 2: DB schema — `userProfiles` and `progressionSuggestions` tables

**Files:**
- Modify: `apps/api/src/drizzle/schema.ts`

- [ ] **Step 1: Add both tables at the end of the schema file**

Append to `apps/api/src/drizzle/schema.ts`:

```typescript
export const userProfiles = pgTable('user_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id),
  age: integer('age'),
  heightCm: integer('height_cm'),
  experienceLevel: text('experience_level'), // 'beginner' | 'intermediate' | 'advanced'
  updatedAt: integer('updated_at').notNull(),
})

export const progressionSuggestions = pgTable('progression_suggestions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  exerciseId: text('exercise_id').notNull().references(() => exercises.id),
  suggestedSets: integer('suggested_sets').notNull(),
  suggestedReps: integer('suggested_reps').notNull(),
  suggestedWeightKg: real('suggested_weight_kg').notNull(),
  reason: text('reason').notNull(),
  evidence: text('evidence').notNull(), // JSON.stringify(string[])
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  userExercise: uniqueIndex('progression_suggestions_user_exercise').on(t.userId, t.exerciseId),
}))
```

Note: `uniqueIndex` requires adding it to the imports at the top of `schema.ts`. Check line 1 — it currently imports `{ pgTable, text, integer, real, primaryKey, uniqueIndex }`. `uniqueIndex` is already imported (used by `gyms`). No import change needed.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

---

### Task 3: Generate and apply migration

**Files:**
- Generate: `apps/api/src/drizzle/migrations/0004_*.sql`

- [ ] **Step 1: Generate migration**

```bash
cd apps/api && npx drizzle-kit generate
```

Expected: new file `apps/api/src/drizzle/migrations/0004_*.sql` created containing `CREATE TABLE user_profiles` and `CREATE TABLE progression_suggestions` with the unique index.

- [ ] **Step 2: Apply migration to local DB**

```bash
cd apps/api && npx drizzle-kit migrate
```

Expected: migration applied, tables visible in `psql gymtracker`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/drizzle/schema.ts apps/api/src/drizzle/migrations/
git commit -m "feat: add user_profiles and progression_suggestions tables"
```

---

### Task 4: ProgressionService — context building

This task implements the SQL queries that build the prompt context. No Gemini call yet.

**Files:**
- Create: `apps/api/src/progression/progression.service.ts`

The service needs:
- DB injection (same pattern as `EquipmentService`)
- `ConfigService` for `GEMINI_API_KEY`
- Logger

- [ ] **Step 1: Create the progression service with context-building only**

```typescript
// apps/api/src/progression/progression.service.ts
import { Injectable, Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, and, sql, desc, isNotNull } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'

type ExerciseContext = {
  exerciseId: string
  name: string
  category: string | null
  lastSets: { setNumber: number; weightKg: number | null; reps: number | null; rpe: number | null }[]
  prWeightKg: number | null
  prReps: number | null
  weeklyVolumes: { week: string; volume: number }[]
  weeklyFrequency: number
}

@Injectable()
export class ProgressionService {
  private readonly logger = new Logger(ProgressionService.name)
  private readonly geminiApiKey: string

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    config: ConfigService,
  ) {
    this.geminiApiKey = config.getOrThrow<string>('GEMINI_API_KEY')
  }

  async buildExerciseContext(
    exerciseId: string,
    userId: string,
    sessionId: string,
  ): Promise<ExerciseContext | null> {
    // Exercise name + category
    const [exercise] = await this.db
      .select({ name: schema.exercises.name, category: schema.exercises.category })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, exerciseId))
      .limit(1)
    if (!exercise) return null

    // Sets from the finished session
    const sessionSets = await this.db
      .select({
        setNumber: schema.sets.setNumber,
        weightKg: schema.sets.weightKg,
        reps: schema.sets.reps,
        rpe: schema.sets.rpe,
      })
      .from(schema.sets)
      .where(and(eq(schema.sets.sessionId, sessionId), eq(schema.sets.exerciseId, exerciseId), eq(schema.sets.done, 1)))
      .orderBy(schema.sets.setNumber)

    // Personal record
    const prResult = await this.db.execute(sql`
      SELECT s.weight_kg AS "weightKg", s.reps
      FROM sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId} AND s.done = 1
      ORDER BY s.weight_kg DESC NULLS LAST
      LIMIT 1
    `)
    const pr = prResult.rows[0] as { weightKg: number | null; reps: number | null } | undefined

    // 4-week volume by week
    const volumeResult = await this.db.execute(sql`
      SELECT
        to_char(to_timestamp(s.completed_at), 'IYYY-"W"IW') AS week,
        SUM(s.reps * s.weight_kg) AS volume
      FROM sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      WHERE ws.user_id = ${userId}
        AND s.exercise_id = ${exerciseId}
        AND s.done = 1
        AND s.completed_at > extract(epoch from now() - interval '4 weeks')
      GROUP BY week
      ORDER BY week
    `)

    // Weekly training frequency (all exercises, last 4 weeks)
    const freqResult = await this.db.execute(sql`
      SELECT COUNT(DISTINCT to_char(to_timestamp(started_at), 'IYYY-"W"IW')) AS weeks_active
      FROM workout_sessions
      WHERE user_id = ${userId}
        AND finished_at IS NOT NULL
        AND started_at > extract(epoch from now() - interval '4 weeks')
    `)
    const weeklyFrequency = Number((freqResult.rows[0] as { weeks_active: string })?.weeks_active ?? 0)

    return {
      exerciseId,
      name: exercise.name,
      category: exercise.category,
      lastSets: sessionSets,
      prWeightKg: pr?.weightKg ?? null,
      prReps: pr?.reps ?? null,
      weeklyVolumes: (volumeResult.rows as { week: string; volume: string }[]).map(r => ({
        week: r.week,
        volume: Number(r.volume),
      })),
      weeklyFrequency,
    }
  }

  async getUserContext(userId: string): Promise<{
    age: number | null
    heightCm: number | null
    experienceLevel: string | null
    latestBodyWeightKg: number | null
  }> {
    const [profile] = await this.db
      .select()
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, userId))
      .limit(1)

    const [latestWeight] = await this.db
      .select({ weightKg: schema.bodyWeights.weightKg })
      .from(schema.bodyWeights)
      .where(eq(schema.bodyWeights.userId, userId))
      .orderBy(desc(schema.bodyWeights.recordedAt))
      .limit(1)

    return {
      age: profile?.age ?? null,
      heightCm: profile?.heightCm ?? null,
      experienceLevel: profile?.experienceLevel ?? null,
      latestBodyWeightKg: latestWeight?.weightKg ?? null,
    }
  }

  buildPrompt(
    exercises: ExerciseContext[],
    user: { age: number | null; heightCm: number | null; experienceLevel: string | null; latestBodyWeightKg: number | null },
  ): string {
    const userLine = [
      user.age && `Age: ${user.age}`,
      user.heightCm && `Height: ${user.heightCm}cm`,
      user.experienceLevel && `Experience: ${user.experienceLevel}`,
      user.latestBodyWeightKg && `Body weight: ${user.latestBodyWeightKg}kg`,
    ]
      .filter(Boolean)
      .join(' | ')

    const exerciseBlocks = exercises
      .map(ex => {
        const setsLine = ex.lastSets
          .map(s => `set${s.setNumber} ${s.weightKg ?? 0}kg×${s.reps ?? 0}${s.rpe ? ` @RPE${s.rpe}` : ''}`)
          .join(', ')
        const prLine = ex.prWeightKg ? `PR: ${ex.prWeightKg}kg × ${ex.prReps ?? '?'} reps` : 'PR: none recorded'
        const volumeLine =
          ex.weeklyVolumes.length > 0
            ? `4-week volume: ${ex.weeklyVolumes.map(v => `${v.volume.toFixed(0)}kg`).join(' → ')}`
            : '4-week volume: insufficient data'
        return [
          `EXERCISE [${ex.exerciseId}] ${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
          `This session: ${setsLine || 'no done sets'}`,
          prLine,
          volumeLine,
          `Weekly frequency: ${ex.weeklyFrequency} sessions/week`,
        ].join('\n')
      })
      .join('\n\n')

    return [
      'You are a certified strength and conditioning coach.',
      'Analyse the training data below and return a progression suggestion for each exercise.',
      'Rules: conservative increments (2.5–5 kg max), always cite specific numbers in evidence[].',
      'If fewer than 3 sessions of history exist for an exercise, suggest +2–3% and include',
      '"Insufficient history — suggestion will improve as more data accumulates" in evidence[].',
      '',
      userLine ? `USER:\n${userLine}` : 'USER: No profile data available.',
      '',
      exerciseBlocks,
    ].join('\n')
  }
}
```

- [ ] **Step 2: Write a unit test for `buildPrompt`**

```typescript
// packages/shared/src/progression.schema.test.ts
// NOTE: buildPrompt is a pure function — test it in the shared package
// or directly in the API. Since it lives in the NestJS service, we test it
// by importing the class and calling the method without DI.
// Create the test file at:
// apps/api/src/progression/progression.service.spec.ts
```

Actually, `buildPrompt` is a pure string-building method on the service. We can test it by instantiating the service with mocks. Create:

```typescript
// apps/api/src/progression/progression.service.spec.ts
import { describe, it, expect } from 'vitest'
import { ProgressionService } from './progression.service'

// Minimal mocks — buildPrompt doesn't use db or config
const service = new ProgressionService(
  {} as any,
  { getOrThrow: () => 'fake-key' } as any,
)

describe('ProgressionService.buildPrompt', () => {
  it('includes exercise block with id, name, and session sets', () => {
    const result = service.buildPrompt(
      [{
        exerciseId: 'bench-id',
        name: 'Bench Press',
        category: 'push',
        lastSets: [{ setNumber: 1, weightKg: 80, reps: 8, rpe: null }],
        prWeightKg: 90,
        prReps: 3,
        weeklyVolumes: [{ week: '2026-W20', volume: 1920 }],
        weeklyFrequency: 2,
      }],
      { age: 32, heightCm: 180, experienceLevel: 'intermediate', latestBodyWeightKg: 82 },
    )
    expect(result).toContain('[bench-id] Bench Press (push)')
    expect(result).toContain('set1 80kg×8')
    expect(result).toContain('PR: 90kg × 3 reps')
    expect(result).toContain('4-week volume: 1920kg')
    expect(result).toContain('Age: 32')
  })

  it('shows "insufficient data" when no weekly volumes', () => {
    const result = service.buildPrompt(
      [{
        exerciseId: 'squat-id',
        name: 'Squat',
        category: 'legs',
        lastSets: [],
        prWeightKg: null,
        prReps: null,
        weeklyVolumes: [],
        weeklyFrequency: 1,
      }],
      { age: null, heightCm: null, experienceLevel: null, latestBodyWeightKg: null },
    )
    expect(result).toContain('4-week volume: insufficient data')
    expect(result).toContain('PR: none recorded')
    expect(result).toContain('No profile data available')
  })
})
```

- [ ] **Step 3: Run the test — expect it to pass immediately (pure function)**

```bash
cd apps/api && npx vitest run src/progression/progression.service.spec.ts
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/progression/progression.service.ts apps/api/src/progression/progression.service.spec.ts
git commit -m "feat: add ProgressionService context building and prompt generation"
```

---

### Task 5: ProgressionService — Gemini call + upsert

**Files:**
- Modify: `apps/api/src/progression/progression.service.ts`

- [ ] **Step 1: Add the Gemini response type, `callGemini`, and `generateForSession` to the service**

The Gemini URL and call pattern is identical to `equipment.service.ts`. Add these to `progression.service.ts`:

```typescript
// Add at the top of the file with other imports
import { randomUUID } from 'crypto'

// Add these types inside the file (not exported)
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

type GeminiSuggestionRaw = {
  exerciseId: string
  suggestedSets: number
  suggestedReps: number
  suggestedWeightKg: number
  reason: string
  evidence: string[]
}
```

Add these methods to `ProgressionService`:

```typescript
  private async callGemini(prompt: string): Promise<GeminiSuggestionRaw[]> {
    const response = await fetch(`${GEMINI_URL}?key=${this.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              suggestions: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    exerciseId:        { type: 'STRING' },
                    suggestedSets:     { type: 'INTEGER' },
                    suggestedReps:     { type: 'INTEGER' },
                    suggestedWeightKg: { type: 'NUMBER' },
                    reason:            { type: 'STRING' },
                    evidence:          { type: 'ARRAY', items: { type: 'STRING' } },
                  },
                  required: ['exerciseId', 'suggestedSets', 'suggestedReps',
                             'suggestedWeightKg', 'reason', 'evidence'],
                },
              },
            },
            required: ['suggestions'],
          },
        },
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)')
      throw new Error(`Gemini ${response.status}: ${body}`)
    }

    const json = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>
    }
    const text = json.candidates[0]?.content.parts[0]?.text
    if (!text) throw new Error('Gemini returned empty response')

    const parsed = JSON.parse(text) as { suggestions: GeminiSuggestionRaw[] }
    return parsed.suggestions ?? []
  }

  async generateForSession(sessionId: string, userId: string): Promise<void> {
    // Collect all exercises with at least one done set in this session
    const doneRows = await this.db
      .selectDistinct({ exerciseId: schema.sets.exerciseId })
      .from(schema.sets)
      .where(and(eq(schema.sets.sessionId, sessionId), eq(schema.sets.done, 1), isNotNull(schema.sets.exerciseId)))

    if (doneRows.length === 0) return

    const [userCtx, ...exerciseContexts] = await Promise.all([
      this.getUserContext(userId),
      ...doneRows.map(r => this.buildExerciseContext(r.exerciseId!, userId, sessionId)),
    ])

    const validContexts = exerciseContexts.filter((c): c is ExerciseContext => c !== null)
    if (validContexts.length === 0) return

    const prompt = this.buildPrompt(validContexts, userCtx)

    let suggestions: GeminiSuggestionRaw[]
    try {
      suggestions = await this.callGemini(prompt)
    } catch (err) {
      this.logger.error(`Gemini call failed for session ${sessionId}`, err)
      return
    }

    const now = Math.floor(Date.now() / 1000)
    for (const s of suggestions) {
      if (!s.exerciseId || !s.suggestedSets || !s.suggestedReps || !s.suggestedWeightKg) continue
      await this.db
        .insert(schema.progressionSuggestions)
        .values({
          id: randomUUID(),
          userId,
          exerciseId: s.exerciseId,
          suggestedSets: s.suggestedSets,
          suggestedReps: s.suggestedReps,
          suggestedWeightKg: s.suggestedWeightKg,
          reason: s.reason,
          evidence: JSON.stringify(s.evidence),
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.progressionSuggestions.userId, schema.progressionSuggestions.exerciseId],
          set: {
            id: randomUUID(),
            suggestedSets: s.suggestedSets,
            suggestedReps: s.suggestedReps,
            suggestedWeightKg: s.suggestedWeightKg,
            reason: s.reason,
            evidence: JSON.stringify(s.evidence),
            createdAt: now,
          },
        })
    }

    this.logger.log(`Generated ${suggestions.length} progression suggestions for session ${sessionId}`)
  }

  async getForExercise(exerciseId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(schema.progressionSuggestions)
      .where(
        and(
          eq(schema.progressionSuggestions.exerciseId, exerciseId),
          eq(schema.progressionSuggestions.userId, userId),
        ),
      )
      .limit(1)

    if (!row) return null

    return {
      id: row.id,
      userId: row.userId,
      exerciseId: row.exerciseId,
      suggestedSets: row.suggestedSets,
      suggestedReps: row.suggestedReps,
      suggestedWeightKg: row.suggestedWeightKg,
      reason: row.reason,
      evidence: JSON.parse(row.evidence) as string[],
      createdAt: row.createdAt,
    }
  }
```

Also add `isNotNull` to the drizzle imports at the top:
```typescript
import { eq, and, sql, desc, isNotNull } from 'drizzle-orm'
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/progression/progression.service.ts
git commit -m "feat: add Gemini batch call and upsert to ProgressionService"
```

---

### Task 6: ProgressionController + ProgressionModule + wire into AppModule

**Files:**
- Create: `apps/api/src/progression/progression.controller.ts`
- Create: `apps/api/src/progression/progression.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the controller**

```typescript
// apps/api/src/progression/progression.controller.ts
import { Controller, Get, Param, Req, NotFoundException } from '@nestjs/common'

import { AuthenticatedRequest } from '../auth/request.types'
import { ProgressionService } from './progression.service'

@Controller()
export class ProgressionController {
  constructor(private readonly svc: ProgressionService) {}

  @Get('exercises/:id/progression-suggestion')
  async getForExercise(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const result = await this.svc.getForExercise(id, req.user.id)
    if (!result) throw new NotFoundException('No progression suggestion found')
    return result
  }
}
```

- [ ] **Step 2: Create the module**

```typescript
// apps/api/src/progression/progression.module.ts
import { Module } from '@nestjs/common'

import { ProgressionController } from './progression.controller'
import { ProgressionService } from './progression.service'

@Module({
  controllers: [ProgressionController],
  providers: [ProgressionService],
  exports: [ProgressionService],
})
export class ProgressionModule {}
```

- [ ] **Step 3: Register in AppModule**

In `apps/api/src/app.module.ts`, add the import:

```typescript
import { ProgressionModule } from './progression/progression.module'
```

And add `ProgressionModule` to the `imports` array (after `EquipmentModule`):

```typescript
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  DrizzleModule,
  AuthModule,
  SeedModule,
  ExercisesModule,
  WorkoutsModule,
  SchedulesModule,
  SetsModule,
  BodyModule,
  StatsModule,
  PhotosModule,
  EquipmentModule,
  ProgressionModule,
],
```

- [ ] **Step 4: Start the API and verify the endpoint exists**

```bash
cd apps/api && npm run start:dev
```

Then in another terminal:
```bash
curl -s http://localhost:3000/exercises/nonexistent-id/progression-suggestion
```

Expected: `{"statusCode":404,"message":"No progression suggestion found"}`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/progression/
git commit -m "feat: add ProgressionController and ProgressionModule"
```

---

### Task 7: Wire fire-and-forget into WorkoutsService

**Files:**
- Modify: `apps/api/src/workouts/workouts.service.ts`
- Modify: `apps/api/src/workouts/workouts.module.ts`

- [ ] **Step 1: Import ProgressionModule into WorkoutsModule so the service can be injected**

In `apps/api/src/workouts/workouts.module.ts`:

```typescript
import { Module } from '@nestjs/common'

import { SessionsModule } from '../sessions/sessions.module'
import { ProgressionModule } from '../progression/progression.module'
import { WorkoutsController } from './workouts.controller'
import { WorkoutsService } from './workouts.service'

@Module({
  imports: [SessionsModule, ProgressionModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService],
})
export class WorkoutsModule {}
```

- [ ] **Step 2: Inject ProgressionService and fire-and-forget in `finishSession`**

In `apps/api/src/workouts/workouts.service.ts`, update the class:

Add to imports:
```typescript
import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { ProgressionService } from '../progression/progression.service'
```

Update the constructor to inject `ProgressionService`:
```typescript
private readonly logger = new Logger(WorkoutsService.name)

constructor(
  @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
  private sessions: SessionRepository,
  private progressionService: ProgressionService,
) {}
```

Update `finishSession` to fire-and-forget:
```typescript
async finishSession(id: string, userId: string, dto: FinishSessionDto) {
  await this.getSession(id, userId)
  await this.db
    .update(schema.workoutSessions)
    .set({ finishedAt: Math.floor(Date.now() / 1000), notes: dto.notes ?? null })
    .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))

  // Fire-and-forget — do not await, errors are caught and logged inside generateForSession
  this.progressionService.generateForSession(id, userId).catch(err => {
    this.logger.error(`Progression generation failed for session ${id}`, err)
  })

  return this.getSession(id, userId)
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: End-to-end smoke test**

Start the API. Finish an existing session (or create+finish one):

```bash
curl -s -X POST http://localhost:3000/sessions/<SESSION_ID>/finish \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: immediate JSON response (session data), no hang. Check logs — after a few seconds you should see `Generated N progression suggestions for session <id>`.

Then verify suggestion was persisted:
```bash
curl -s http://localhost:3000/exercises/<EXERCISE_ID>/progression-suggestion
```

Expected: JSON with `suggestedSets`, `suggestedReps`, `suggestedWeightKg`, `reason`, `evidence[]`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workouts/workouts.service.ts apps/api/src/workouts/workouts.module.ts
git commit -m "feat: fire-and-forget progression suggestion generation on session finish"
```

---

### Task 8: Frontend API client

**Files:**
- Modify: `apps/web/src/api/exercises.ts`

- [ ] **Step 1: Add `getProgressionSuggestion` to the exercises API**

In `apps/web/src/api/exercises.ts`:

```typescript
import type { CreateExerciseDto, Exercise, UpdateExerciseDto, WorkoutSet, ProgressionSuggestion } from '@gymtracker/shared'

import { api } from './client'

export const exercisesApi = {
  getAll: () => api.get<Exercise[]>('/exercises'),
  getOne: (id: string) => api.get<Exercise>(`/exercises/${id}`),
  create: (data: CreateExerciseDto) => api.post<Exercise>('/exercises', data),
  update: (id: string, data: UpdateExerciseDto) => api.patch<Exercise>(`/exercises/${id}`, data),
  remove: (id: string) => api.delete(`/exercises/${id}`),
  getLastSets: (exerciseId: string) => api.get<WorkoutSet[]>(`/exercises/${exerciseId}/last-sets`),
  getProgressionSuggestion: (exerciseId: string) =>
    api.get<ProgressionSuggestion>(`/exercises/${exerciseId}/progression-suggestion`),
}
```

Note: the API client will 404 when no suggestion exists. TanStack Query treats non-2xx as an error, so `data` will be `undefined` when there's no suggestion — handle this with `enabled` or `retry: false`.

- [ ] **Step 2: Build the web app to verify no type errors**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/exercises.ts
git commit -m "feat: add getProgressionSuggestion to exercises API client"
```

---

### Task 9: WorkoutLogger — PS pre-population + last-done display + expandable reason

This is the largest frontend task. Read the full context before starting.

**Context:** `WorkoutLogger.tsx` has a `PendingSetRow` component (lines 170–244) and a `ExerciseSummaryBar` component. The main logger fetches `prevSets` (last done sets for current exercise) at line 448. Pre-population currently happens at lines 455–468 using `currentExercise.loggedSets.at(-1)` and template defaults.

**What changes:**
1. Fetch the active `ProgressionSuggestion` for `currentExercise` alongside `prevSets`
2. Update pre-population to use PS weight/reps when available (PS → last-done → template default)
3. Pass PS and `prevSets` into `PendingSetRow`; display PS in inputs, last-done in small text below, expandable reason toggle

**Files:**
- Modify: `apps/web/src/components/workout/WorkoutLogger.tsx`

- [ ] **Step 1: Update `PendingSetRow` to accept and display PS data**

Replace the `PendingSetRow` function (lines 170–244) with:

```typescript
function PendingSetRow({
  index,
  defaultWeight,
  defaultReps,
  progressionSuggestion,
  lastDoneWeightKg,
  lastDoneReps,
  onLog,
}: {
  index: number
  defaultWeight: number
  defaultReps: number
  progressionSuggestion?: { suggestedWeightKg: number; suggestedReps: number; reason: string; evidence: string[] } | null
  lastDoneWeightKg?: number | null
  lastDoneReps?: number | null
  onLog: (weightKg: number, reps: number) => void
}) {
  const [weight, setWeight] = useState(defaultWeight)
  const [reps, setReps] = useState(defaultReps)
  const [showReason, setShowReason] = useState(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressDidFireRef = useRef(false)

  const handlePressStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) { return }
    longPressTimerRef.current = setTimeout(() => {
      longPressDidFireRef.current = true
      longPressTimerRef.current = null
    }, 500)
  }

  const handlePressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) { return }
    if (longPressDidFireRef.current) {
      longPressDidFireRef.current = false
      return
    }
    onLog(weight, reps)
  }

  const hasPs = !!progressionSuggestion
  const hasLastDone = lastDoneWeightKg != null || lastDoneReps != null

  return (
    <div
      className="border-border/40 border-b px-4 pt-4 pb-5 transition-colors"
      style={{ touchAction: 'pan-y' }}
      onClick={handleRowClick}
      onPointerDown={handlePressStart}
      onPointerLeave={handlePressEnd}
      onPointerUp={handlePressEnd}
    >
      <div className="grid grid-cols-2 gap-3">
        <NumericInput
          bigStep={5}
          fieldKey={`pending-weight-${index}`}
          highlighted={hasPs}
          label="WEIGHT"
          max={300}
          min={0}
          size="lg"
          step={2.5}
          value={weight}
          onChange={setWeight}
        />
        <NumericInput
          bigStep={5}
          fieldKey={`pending-reps-${index}`}
          highlighted={hasPs}
          label="REPS"
          max={50}
          min={1}
          size="lg"
          step={1}
          value={reps}
          onChange={setReps}
        />
      </div>

      {hasPs && (
        <div className="mt-2 space-y-1">
          {hasLastDone && (
            <p className="text-muted-foreground text-[11px]">
              Previous: {lastDoneWeightKg ?? 0}kg × {lastDoneReps ?? 0} reps
            </p>
          )}
          <button
            className="text-primary text-[11px] underline-offset-2 hover:underline"
            onClick={e => { e.stopPropagation(); setShowReason(v => !v) }}
          >
            {showReason ? 'Hide reason' : 'Why this weight?'}
          </button>
          {showReason && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
              <p className="text-[12px] leading-snug">{progressionSuggestion!.reason}</p>
              <ul className="list-disc list-inside space-y-0.5">
                {progressionSuggestion!.evidence.map((e, i) => (
                  <li key={i} className="text-muted-foreground text-[11px]">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Fetch the progression suggestion in the logger**

In the main `WorkoutLogger` component body, after the existing `prevSets` query (around line 448), add:

```typescript
const { data: progressionSuggestion } = useQuery({
  queryKey: ['progression-suggestion', currentExercise?.id],
  queryFn: () => exercisesApi.getProgressionSuggestion(currentExercise!.id),
  enabled: !!currentExercise?.id,
  staleTime: 5 * 60_000,
  retry: false, // 404 is expected when no suggestion exists yet
})
```

Add the import for `exercisesApi` if not already imported (check the top of the file — it likely imports from `@/api/exercises`).

- [ ] **Step 3: Update pre-population to respect the PS → last-done → template default hierarchy**

The two pre-population blocks (lines 455–468) currently read from `currentExercise.loggedSets.at(-1)` and template defaults. Replace both with PS-aware versions.

Find:
```typescript
if (currentExercise && !newSetInitialized.current) {
  newSetInitialized.current = true
  const last = currentExercise.loggedSets.at(-1)
  setNewSetWeight(last?.weightKg ?? currentExercise.defaultWeightKg)
  setNewSetReps(last?.reps ?? currentExercise.defaultReps)
}

// Re-sync when navigating to a different exercise
if (currentExercise && prevActiveExerciseIndex !== activeExerciseIndex) {
  setPrevActiveExerciseIndex(activeExerciseIndex)
  const last = currentExercise.loggedSets.at(-1)
  setNewSetWeight(last?.weightKg ?? currentExercise.defaultWeightKg ?? 0)
  setNewSetReps(last?.reps ?? currentExercise.defaultReps ?? 8)
}
```

Replace with:

```typescript
const lastDoneSet = prevSets.at(-1) // last set from previous session

if (currentExercise && !newSetInitialized.current) {
  newSetInitialized.current = true
  setNewSetWeight(
    progressionSuggestion?.suggestedWeightKg
    ?? lastDoneSet?.weightKg
    ?? currentExercise.defaultWeightKg
    ?? 0
  )
  setNewSetReps(
    progressionSuggestion?.suggestedReps
    ?? lastDoneSet?.reps
    ?? currentExercise.defaultReps
    ?? 8
  )
}

if (currentExercise && prevActiveExerciseIndex !== activeExerciseIndex) {
  setPrevActiveExerciseIndex(activeExerciseIndex)
  setNewSetWeight(
    progressionSuggestion?.suggestedWeightKg
    ?? lastDoneSet?.weightKg
    ?? currentExercise.defaultWeightKg
    ?? 0
  )
  setNewSetReps(
    progressionSuggestion?.suggestedReps
    ?? lastDoneSet?.reps
    ?? currentExercise.defaultReps
    ?? 8
  )
}
```

- [ ] **Step 4: Pass PS and last-done data into `PendingSetRow`**

Find the `<PendingSetRow` usage (around line 670) and add the new props:

```typescript
<PendingSetRow
  key={`${currentExercise?.id}-${progressionSuggestion ? 'ps' : 'no-ps'}`}
  index={loggedCount}
  defaultWeight={newSetWeight}
  defaultReps={newSetReps}
  progressionSuggestion={progressionSuggestion}
  lastDoneWeightKg={lastDoneSet?.weightKg}
  lastDoneReps={lastDoneSet?.reps}
  onLog={handleLog}
/>
```

The `key` forces `PendingSetRow` to remount when the PS query resolves (changing `'no-ps'` → `'ps'`). Without this, `useState(defaultWeight)` inside `PendingSetRow` only reads the initial prop — if PS arrives after first render, the inputs would stay on last-done values. Remounting is safe here because PendingSetRow is only for an unlogged pending set.

Note: `lastDoneSet` was declared in Step 3 above. Replace `handleLog` with whatever the actual `onLog` handler name is at that call site in the original file.

- [ ] **Step 5: Start the dev server and test manually**

```bash
cd apps/web && npm run dev
```

Open the workout logger for an active session. For an exercise that has a Progression Suggestion stored:
- Weight and reps inputs should show the AI's suggested values
- "Previous: Xkg × Y reps" appears below
- "Why this weight?" expands to show reason + evidence bullets

For an exercise with no suggestion: inputs use last-done values (same as before).

- [ ] **Step 6: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/workout/WorkoutLogger.tsx
git commit -m "feat: show progression suggestion in workout logger with last-done context and expandable reason"
```
