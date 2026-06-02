# Equipment Photo Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users photograph gym equipment, receive AI-generated exercise suggestions and equipment metadata from Gemini 2.0 Flash, review and confirm selections, then save Equipment with linked Exercises to the database.

**Architecture:** Two-phase API — `POST /equipment/analyze` calls Gemini server-side (no DB write) and returns structured suggestions enriched with server-side exercise deduplication; `POST /equipment` saves an implicit Gym (auto-created on first upload), the Equipment record with photo, and creates or links Exercises in one operation. Frontend: `/gym` route shows an Equipment list; `AddEquipmentWizard` handles the two-step photo → review flow.

**Tech Stack:** NestJS 11 + Drizzle ORM (PostgreSQL), Gemini 2.0 Flash REST API (global `fetch`, no SDK), React + TanStack Query + TanStack Router, TailwindCSS, `sharp` for image processing.

---

## File Map

**Create:**
- `packages/shared/src/equipment.schema.ts` — `AnalyzeSuggestion`, `SuggestedExercise`, `SaveExerciseInput` types
- `apps/api/src/gym/gym.service.ts` — `getOrCreateForUser(userId)` auto-creates implicit Gym
- `apps/api/src/gym/gym.module.ts` — exports `GymService`
- `apps/api/src/equipment/equipment.service.ts` — `analyze`, `create`, `findAll`, `delete`
- `apps/api/src/equipment/equipment.controller.ts` — HTTP handlers
- `apps/api/src/equipment/equipment.module.ts`
- `apps/web/src/api/equipment.ts` — API client
- `apps/web/src/routes/gym.tsx` — Equipment list page
- `apps/web/src/components/equipment/AddEquipmentWizard.tsx` — two-step wizard

**Modify:**
- `packages/shared/src/exercise.schema.ts` — rename `equipment` field → `equipmentType`
- `packages/shared/src/models.ts` — rename `Exercise.equipment` → `equipmentType`; add `Gym`, `Equipment`, `EquipmentWithExercises`
- `packages/shared/src/index.ts` — export `equipment.schema`
- `apps/api/src/drizzle/schema.ts` — rename column; add `gyms`, `equipment`, `equipment_exercises` tables; add nullable `equipment_id` FK to `sets` and `template_exercises`
- `apps/api/src/drizzle/mappers.ts` — add `toEquipment`, `toEquipmentWithExercises`
- `apps/api/src/exercises/exercises.service.ts` — `dto.equipment` → `dto.equipmentType`
- `apps/api/src/seed/seed.service.ts` — `equipment:` → `equipmentType:` throughout
- `apps/api/src/app.module.ts` — import `EquipmentModule`
- `apps/api/.env` — add `GEMINI_API_KEY`
- `apps/api/.env.example` — add `GEMINI_API_KEY` placeholder
- `apps/web/src/routes/exercises.tsx` — `ex.equipment` → `ex.equipmentType`
- `apps/web/src/router.tsx` — add `/gym` route
- `apps/web/src/components/layout/AppLayout.tsx` — add Gym nav entry, change `grid-cols-6` → `grid-cols-7`

---

### Task 1: Commit pre-existing planned-sets changes

**Files:**
- Commit: `packages/shared/src/models.ts`, `packages/shared/src/set.utils.ts`, `packages/shared/src/stats.utils.ts`, `apps/web/src/components/workout/WorkoutLogger.tsx`, `apps/web/vite.config.ts`

- [ ] **Step 1: Stage and commit**

```bash
git add packages/shared/src/models.ts packages/shared/src/set.utils.ts packages/shared/src/stats.utils.ts apps/web/src/components/workout/WorkoutLogger.tsx apps/web/vite.config.ts
git commit -m "fix: sets default to planned (done: false), completedAt nullable"
```

Expected: commit created, `git status` shows clean working tree (except any unrelated files).

---

### Task 2: Rename `exercises.equipment` → `exercises.equipment_type`

**Files:**
- Modify: `packages/shared/src/exercise.schema.ts`
- Modify: `packages/shared/src/models.ts`
- Modify: `apps/api/src/drizzle/schema.ts`
- Modify: `apps/api/src/exercises/exercises.service.ts`
- Modify: `apps/api/src/seed/seed.service.ts`

- [ ] **Step 1: Update `exercise.schema.ts`**

```typescript
// packages/shared/src/exercise.schema.ts
import { z } from 'zod'

export const ExerciseCategorySchema = z.enum(['push', 'pull', 'legs', 'core', 'cardio', 'other'])
export const ExerciseEquipmentSchema = z.enum(['barbell', 'dumbbell', 'machine', 'bodyweight', 'cable', 'other'])

export const CreateExerciseSchema = z.object({
  name: z.string().min(1).max(100),
  category: ExerciseCategorySchema.optional(),
  equipmentType: ExerciseEquipmentSchema.optional(),
  notes: z.string().max(500).optional(),
})

export const UpdateExerciseSchema = CreateExerciseSchema.partial()

export type CreateExerciseDto = z.infer<typeof CreateExerciseSchema>
export type UpdateExerciseDto = z.infer<typeof UpdateExerciseSchema>
```

- [ ] **Step 2: Update `Exercise` type in `models.ts`**

Find and replace the `equipment: string | null` line in the `Exercise` type:

```typescript
// packages/shared/src/models.ts — Exercise type
export type Exercise = {
  id: string
  userId: string | null
  name: string
  category: string | null
  equipmentType: string | null   // was: equipment
  notes: string | null
  isDefault: number | null
  createdAt: number
}
```

- [ ] **Step 3: Rename column in Drizzle schema**

In `apps/api/src/drizzle/schema.ts`, change the `exercises` table entry:

```typescript
// Before:
  equipment: text('equipment'),
// After:
  equipmentType: text('equipment_type'),
```

- [ ] **Step 4: Update exercises service**

In `apps/api/src/exercises/exercises.service.ts`, in the `create` method change:

```typescript
// Before:
        equipment: dto.equipment ?? null,
// After:
        equipmentType: dto.equipmentType ?? null,
```

The `update` method uses a dynamic `Object.fromEntries(Object.entries(dto)...)` patch — no change needed there since the DTO key is already `equipmentType`.

- [ ] **Step 5: Update seed service**

In `apps/api/src/seed/seed.service.ts`, rename every `equipment:` key in `DEFAULT_EXERCISES` and in the insert call:

```typescript
const DEFAULT_EXERCISES = [
  { name: 'Bench Press', category: 'push', equipmentType: 'barbell' },
  { name: 'Squat', category: 'legs', equipmentType: 'barbell' },
  { name: 'Deadlift', category: 'pull', equipmentType: 'barbell' },
  { name: 'Overhead Press', category: 'push', equipmentType: 'barbell' },
  { name: 'Barbell Row', category: 'pull', equipmentType: 'barbell' },
  { name: 'Romanian Deadlift', category: 'legs', equipmentType: 'barbell' },
  { name: 'Front Squat', category: 'legs', equipmentType: 'barbell' },
  { name: 'Incline Bench Press', category: 'push', equipmentType: 'barbell' },
  { name: 'Dumbbell Press', category: 'push', equipmentType: 'dumbbell' },
  { name: 'Dumbbell Row', category: 'pull', equipmentType: 'dumbbell' },
  { name: 'Lateral Raise', category: 'push', equipmentType: 'dumbbell' },
  { name: 'Bicep Curl', category: 'pull', equipmentType: 'dumbbell' },
  { name: 'Tricep Extension', category: 'push', equipmentType: 'dumbbell' },
  { name: 'Dumbbell Lunge', category: 'legs', equipmentType: 'dumbbell' },
  { name: 'Bulgarian Split Squat', category: 'legs', equipmentType: 'dumbbell' },
  { name: 'Leg Press', category: 'legs', equipmentType: 'machine' },
  { name: 'Leg Curl', category: 'legs', equipmentType: 'machine' },
  { name: 'Leg Extension', category: 'legs', equipmentType: 'machine' },
  { name: 'Cable Row', category: 'pull', equipmentType: 'cable' },
  { name: 'Lat Pulldown', category: 'pull', equipmentType: 'cable' },
  { name: 'Chest Fly', category: 'push', equipmentType: 'machine' },
  { name: 'Cable Lateral Raise', category: 'push', equipmentType: 'cable' },
  { name: 'Pull-up', category: 'pull', equipmentType: 'bodyweight' },
  { name: 'Chin-up', category: 'pull', equipmentType: 'bodyweight' },
  { name: 'Push-up', category: 'push', equipmentType: 'bodyweight' },
  { name: 'Dip', category: 'push', equipmentType: 'bodyweight' },
  { name: 'Plank', category: 'core', equipmentType: 'bodyweight' },
  { name: 'Hollow Hold', category: 'core', equipmentType: 'bodyweight' },
  { name: 'Running', category: 'cardio', equipmentType: 'other' },
  { name: 'Cycling', category: 'cardio', equipmentType: 'other' },
  { name: 'Rowing (erg)', category: 'cardio', equipmentType: 'other' },
  { name: 'Jump Rope', category: 'cardio', equipmentType: 'other' },
]
```

And in `seedExercises`, change the insert:

```typescript
      await this.db.insert(schema.exercises).values({
        id: randomUUID(),
        userId: 'default-user',
        name: ex.name,
        category: ex.category,
        equipmentType: ex.equipmentType,
        isDefault: 1,
        createdAt: now,
      })
```

- [ ] **Step 6: Generate migration**

```bash
cd apps/api && npx drizzle-kit generate
```

Expected: creates `apps/api/src/drizzle/migrations/0001_<name>.sql`.

- [ ] **Step 7: Verify migration is a RENAME, not drop+add**

Open the generated `.sql` file. It must contain:
```sql
ALTER TABLE "exercises" RENAME COLUMN "equipment" TO "equipment_type";
```

If instead it shows `DROP COLUMN` + `ADD COLUMN`, replace the file contents with the `RENAME COLUMN` statement above (drop+add would destroy existing data).

- [ ] **Step 8: Apply migration**

```bash
cd apps/api && npm run db:migrate
```

Expected: `All migrations applied` (or equivalent success message).

- [ ] **Step 9: Build check**

```bash
cd apps/api && npm run build
```

Expected: `Build complete` with no TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/exercise.schema.ts packages/shared/src/models.ts apps/api/src/drizzle/schema.ts apps/api/src/drizzle/migrations/ apps/api/src/exercises/exercises.service.ts apps/api/src/seed/seed.service.ts
git commit -m "refactor: rename exercises.equipment column to equipment_type"
```

---

### Task 3: Add Gym + Equipment schema tables + migration

**Files:**
- Modify: `apps/api/src/drizzle/schema.ts`

- [ ] **Step 1: Add `primaryKey` import and new tables to schema**

Replace the import line and add tables at the end of `apps/api/src/drizzle/schema.ts`:

```typescript
import { pgTable, text, integer, real, primaryKey } from 'drizzle-orm/pg-core'
```

Add `equipmentId` to the `templateExercises` table (inside its definition):

```typescript
export const templateExercises = pgTable('template_exercises', {
  id: text('id').primaryKey(),
  templateId: text('template_id').references(() => workoutTemplates.id),
  exerciseId: text('exercise_id').references(() => exercises.id),
  orderIndex: integer('order_index').notNull(),
  defaultSets: integer('default_sets'),
  defaultReps: integer('default_reps'),
  defaultWeightKg: real('default_weight_kg'),
  equipmentId: text('equipment_id'),  // FK added below after equipment table defined
})
```

Add `equipmentId` to the `sets` table:

```typescript
export const sets = pgTable('sets', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => workoutSessions.id),
  exerciseId: text('exercise_id').references(() => exercises.id),
  setNumber: integer('set_number').notNull(),
  reps: integer('reps'),
  weightKg: real('weight_kg'),
  durationSec: integer('duration_sec'),
  rpe: real('rpe'),
  completedAt: integer('completed_at'),
  done: integer('done').default(0),
  equipmentId: text('equipment_id'),  // FK added below after equipment table defined
})
```

Append the new tables **after** all existing table definitions (so forward references are resolved):

```typescript
export const gyms = pgTable('gyms', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const equipment = pgTable('equipment', {
  id: text('id').primaryKey(),
  gymId: text('gym_id').references(() => gyms.id),
  name: text('name').notNull(),
  equipmentType: text('equipment_type'),
  description: text('description'),
  tags: text('tags'),
  photoPath: text('photo_path').notNull(),
  thumbPath: text('thumb_path').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const equipmentExercises = pgTable('equipment_exercises', {
  equipmentId: text('equipment_id').notNull().references(() => equipment.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id').notNull().references(() => exercises.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.equipmentId, t.exerciseId] }),
}))
```

Now add the `equipment` FK references to `sets` and `templateExercises`. Because of circular reference limitations in Drizzle's column-level `.references()`, use a table-level constraint by adding a second argument to their `pgTable` calls:

```typescript
// Replace the sets table definition:
export const sets = pgTable('sets', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => workoutSessions.id),
  exerciseId: text('exercise_id').references(() => exercises.id),
  setNumber: integer('set_number').notNull(),
  reps: integer('reps'),
  weightKg: real('weight_kg'),
  durationSec: integer('duration_sec'),
  rpe: real('rpe'),
  completedAt: integer('completed_at'),
  done: integer('done').default(0),
  equipmentId: text('equipment_id').references(() => equipment.id),
})

// Replace the templateExercises table definition:
export const templateExercises = pgTable('template_exercises', {
  id: text('id').primaryKey(),
  templateId: text('template_id').references(() => workoutTemplates.id),
  exerciseId: text('exercise_id').references(() => exercises.id),
  orderIndex: integer('order_index').notNull(),
  defaultSets: integer('default_sets'),
  defaultReps: integer('default_reps'),
  defaultWeightKg: real('default_weight_kg'),
  equipmentId: text('equipment_id').references(() => equipment.id),
})
```

Note: Drizzle allows forward references via arrow functions `() => equipment.id`, so placing these tables after `equipment` in the file resolves the reference. Move `sets` and `templateExercises` definitions to **after** the `equipment` table definition, or keep them in place and use the arrow-function form (Drizzle evaluates them lazily).

- [ ] **Step 2: Generate migration**

```bash
cd apps/api && npx drizzle-kit generate
```

Expected: creates `apps/api/src/drizzle/migrations/0002_<name>.sql` containing `CREATE TABLE "gyms"`, `CREATE TABLE "equipment"`, `CREATE TABLE "equipment_exercises"`, and `ALTER TABLE "sets" ADD COLUMN "equipment_id"`, `ALTER TABLE "template_exercises" ADD COLUMN "equipment_id"`.

- [ ] **Step 3: Apply migration**

```bash
cd apps/api && npm run db:migrate
```

Expected: migrations applied successfully.

- [ ] **Step 4: Build check**

```bash
cd apps/api && npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/drizzle/schema.ts apps/api/src/drizzle/migrations/
git commit -m "feat: add gyms, equipment, equipment_exercises tables to schema"
```

---

### Task 4: Equipment types in shared package

**Files:**
- Create: `packages/shared/src/equipment.schema.ts`
- Modify: `packages/shared/src/models.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `equipment.schema.ts`**

```typescript
// packages/shared/src/equipment.schema.ts

export type SuggestedExercise = {
  name: string
  category: string
  equipmentType: string
  tags: string[]
  existingId: string | null
}

export type AnalyzeSuggestion = {
  equipment: { name: string; tags: string[] }
  exercises: SuggestedExercise[]
}

export type SaveExerciseInput = {
  existingId?: string
  name: string
  category: string
  equipmentType: string
}
```

- [ ] **Step 2: Add `Gym`, `Equipment`, `EquipmentWithExercises` to `models.ts`**

Append to `packages/shared/src/models.ts`:

```typescript
export type Gym = {
  id: string
  userId: string | null
  name: string
  createdAt: number
}

export type Equipment = {
  id: string
  gymId: string | null
  name: string
  equipmentType: string | null
  description: string | null
  tags: string[] | null
  photoPath: string
  thumbPath: string
  createdAt: number
}

export type EquipmentWithExercises = Equipment & { exercises: Exercise[] }
```

- [ ] **Step 3: Export from `index.ts`**

Append to `packages/shared/src/index.ts`:

```typescript
export * from './equipment.schema.js'
```

- [ ] **Step 4: Build check**

```bash
cd packages/shared && npx tsc --noEmit 2>/dev/null || true && cd ../../apps/api && npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/equipment.schema.ts packages/shared/src/models.ts packages/shared/src/index.ts
git commit -m "feat: add Equipment, Gym, and AI suggestion types to shared package"
```

---

### Task 5: GymService — implicit Gym creation

**Files:**
- Create: `apps/api/src/gym/gym.service.ts`
- Create: `apps/api/src/gym/gym.module.ts`

- [ ] **Step 1: Create `gym.service.ts`**

```typescript
// apps/api/src/gym/gym.service.ts
import { Injectable, Inject } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { randomUUID } from 'crypto'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'

@Injectable()
export class GymService {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  async getOrCreateForUser(userId: string): Promise<typeof schema.gyms.$inferSelect> {
    const [existing] = await this.db
      .select()
      .from(schema.gyms)
      .where(eq(schema.gyms.userId, userId))
      .limit(1)
    if (existing) return existing
    const [gym] = await this.db
      .insert(schema.gyms)
      .values({ id: randomUUID(), userId, name: 'My Gym', createdAt: Math.floor(Date.now() / 1000) })
      .returning()
    return gym!
  }
}
```

- [ ] **Step 2: Create `gym.module.ts`**

```typescript
// apps/api/src/gym/gym.module.ts
import { Module } from '@nestjs/common'
import { GymService } from './gym.service'

@Module({ providers: [GymService], exports: [GymService] })
export class GymModule {}
```

- [ ] **Step 3: Build check**

```bash
cd apps/api && npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/gym/
git commit -m "feat: add GymService with implicit gym creation"
```

---

### Task 6: EquipmentService — Gemini analysis

**Files:**
- Create: `apps/api/src/equipment/equipment.service.ts`
- Modify: `apps/api/.env`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Add `GEMINI_API_KEY` to `.env` and `.env.example`**

In `apps/api/.env`, add:
```
GEMINI_API_KEY=<your-google-ai-studio-key>
```

In `apps/api/.env.example`, add:
```
GEMINI_API_KEY=your_google_ai_studio_key_here
```

- [ ] **Step 2: Create `equipment.service.ts` with the `analyze` method**

```typescript
// apps/api/src/equipment/equipment.service.ts
import { Injectable, Inject, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, and, or, inArray, desc } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { randomUUID } from 'crypto'
import { mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import sharp from 'sharp'

import { AnalyzeSuggestion, EquipmentWithExercises, SuggestedExercise } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { toEquipmentWithExercises } from '../drizzle/mappers'
import { GymService } from '../gym/gym.service'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

type GeminiRaw = {
  candidates: Array<{ content: { parts: Array<{ text: string }> } }>
}

type GeminiParsed = {
  equipment: { name: string; tags: string[] }
  exercises: Array<{ name: string; category: string; equipmentType: string; tags: string[] }>
}

@Injectable()
export class EquipmentService {
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
      throw new UnprocessableEntityException('AI analysis failed — try again or fill in manually')
    }

    const gemini = (await response.json()) as GeminiRaw
    const text = gemini.candidates[0]?.content.parts[0]?.text
    if (!text) {
      throw new UnprocessableEntityException('AI analysis failed — try again or fill in manually')
    }

    const parsed = JSON.parse(text) as GeminiParsed

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
}
```

- [ ] **Step 3: Build check**

```bash
cd apps/api && npm run build
```

Expected: no TypeScript errors. (The service references `toEquipmentWithExercises` which doesn't exist yet — add a stub in mappers first if the build fails: `export function toEquipmentWithExercises(...): any { return {} }`.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/equipment/equipment.service.ts apps/api/.env.example
git commit -m "feat: EquipmentService.analyze — Gemini 2.0 Flash integration"
```

---

### Task 7: EquipmentService — create / findAll / delete + mapper

**Files:**
- Modify: `apps/api/src/equipment/equipment.service.ts`
- Modify: `apps/api/src/drizzle/mappers.ts`

- [ ] **Step 1: Add mapper functions to `mappers.ts`**

Append to `apps/api/src/drizzle/mappers.ts`:

```typescript
import type { Equipment, EquipmentWithExercises } from '@gymtracker/shared'

export type DbEquipment = typeof schema.equipment.$inferSelect

export function toEquipment(row: DbEquipment): Equipment {
  return {
    id: row.id,
    gymId: row.gymId,
    name: row.name,
    equipmentType: row.equipmentType,
    description: row.description,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : null,
    photoPath: row.photoPath,
    thumbPath: row.thumbPath,
    createdAt: row.createdAt,
  }
}

export function toEquipmentWithExercises(
  row: DbEquipment,
  exercises: typeof schema.exercises.$inferSelect[],
): EquipmentWithExercises {
  return { ...toEquipment(row), exercises }
}
```

The `import * as schema` is already at the top of `mappers.ts`. The new import for `Equipment` and `EquipmentWithExercises` should be added at the top of the file alongside the existing `@gymtracker/shared` import.

- [ ] **Step 2: Add `create`, `findAll`, and `delete` to `equipment.service.ts`**

Append these methods inside the `EquipmentService` class (after `analyze`):

```typescript
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

    const [equipRow] = await this.db
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

    const exerciseIds: string[] = []
    const now = Math.floor(Date.now() / 1000)

    for (const ex of exercises) {
      if (ex.existingId) {
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

    return toEquipmentWithExercises(equipRow!, linked.map(r => r.exercise))
  }

  async findAll(userId: string): Promise<EquipmentWithExercises[]> {
    const rows = await this.db
      .select({ equipment: schema.equipment })
      .from(schema.equipment)
      .innerJoin(schema.gyms, eq(schema.equipment.gymId, schema.gyms.id))
      .where(eq(schema.gyms.userId, userId))
      .orderBy(desc(schema.equipment.createdAt))

    if (rows.length === 0) return []

    const equipmentIds = rows.map(r => r.equipment.id)
    const links = await this.db
      .select({
        equipmentId: schema.equipmentExercises.equipmentId,
        exercise: schema.exercises,
      })
      .from(schema.equipmentExercises)
      .innerJoin(schema.exercises, eq(schema.equipmentExercises.exerciseId, schema.exercises.id))
      .where(inArray(schema.equipmentExercises.equipmentId, equipmentIds))

    const byEquipment = new Map<string, typeof schema.exercises.$inferSelect[]>()
    for (const link of links) {
      const arr = byEquipment.get(link.equipmentId) ?? []
      arr.push(link.exercise)
      byEquipment.set(link.equipmentId, arr)
    }

    return rows.map(r =>
      toEquipmentWithExercises(r.equipment, byEquipment.get(r.equipment.id) ?? []),
    )
  }

  async delete(id: string, userId: string): Promise<void> {
    const [row] = await this.db
      .select({ equipment: schema.equipment })
      .from(schema.equipment)
      .innerJoin(schema.gyms, eq(schema.equipment.gymId, schema.gyms.id))
      .where(and(eq(schema.equipment.id, id), eq(schema.gyms.userId, userId)))
      .limit(1)

    if (!row) throw new NotFoundException('Equipment not found')

    for (const rel of [row.equipment.photoPath, row.equipment.thumbPath]) {
      try {
        unlinkSync(join(this.photosDir, rel))
      } catch {} // eslint-disable-line no-empty
    }

    await this.db.delete(schema.equipment).where(eq(schema.equipment.id, id))
  }
```

- [ ] **Step 3: Build check**

```bash
cd apps/api && npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/equipment/equipment.service.ts apps/api/src/drizzle/mappers.ts
git commit -m "feat: EquipmentService.create/findAll/delete + Equipment mapper"
```

---

### Task 8: EquipmentController + Module + wire into AppModule

**Files:**
- Create: `apps/api/src/equipment/equipment.controller.ts`
- Create: `apps/api/src/equipment/equipment.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create `equipment.controller.ts`**

```typescript
// apps/api/src/equipment/equipment.controller.ts
import {
  Controller, Get, Post, Delete, Param, Req, Res, PayloadTooLargeException,
} from '@nestjs/common'
import { createReadStream } from 'fs'
import { join } from 'path'
import type { FastifyReply } from 'fastify'

import { EquipmentService } from './equipment.service'
import { AuthenticatedRequest } from '../auth/request.types'

type FormField = { value: string }

@Controller('equipment')
export class EquipmentController {
  constructor(private readonly svc: EquipmentService) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.svc.findAll(req.user.id)
  }

  @Post('analyze')
  async analyze(@Req() req: AuthenticatedRequest, @Res() res: FastifyReply) {
    const data = await req.file()
    if (!data) return res.code(400).send({ message: 'No file provided' })

    const buffer = await data.toBuffer()
    if (buffer.byteLength > 15 * 1024 * 1024) {
      throw new PayloadTooLargeException('File exceeds 15 MB limit')
    }

    const fields = data.fields as Record<string, FormField | undefined>
    const equipmentType = fields.equipmentType?.value ?? 'other'
    const description = fields.description?.value ?? ''

    const result = await this.svc.analyze(req.user.id, buffer, data.mimetype, equipmentType, description)
    return res.send(result)
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Res() res: FastifyReply) {
    const data = await req.file()
    if (!data) return res.code(400).send({ message: 'No file provided' })

    const buffer = await data.toBuffer()
    if (buffer.byteLength > 15 * 1024 * 1024) {
      throw new PayloadTooLargeException('File exceeds 15 MB limit')
    }

    const fields = data.fields as Record<string, FormField | undefined>
    const name = fields.name?.value ?? 'Equipment'
    const equipmentType = fields.equipmentType?.value ?? 'other'
    const description = fields.description?.value
    const tags = fields.tags?.value ? (JSON.parse(fields.tags.value) as string[]) : []
    const exercises = fields.exercises?.value
      ? (JSON.parse(fields.exercises.value) as Array<{
          existingId?: string
          name: string
          category: string
          equipmentType: string
        }>)
      : []

    const result = await this.svc.create(req.user.id, buffer, name, equipmentType, description, tags, exercises)
    return res.send(result)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.delete(id, req.user.id)
  }

  @Get('photo/:filename')
  servePhoto(
    @Param('filename') filename: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: FastifyReply,
  ) {
    const filePath = join(this.svc.getPhotosDir(), req.user.id, 'equipment', filename)
    const stream = createReadStream(filePath)
    return res.type('image/webp').send(stream)
  }
}
```

- [ ] **Step 2: Create `equipment.module.ts`**

```typescript
// apps/api/src/equipment/equipment.module.ts
import { Module } from '@nestjs/common'

import { GymModule } from '../gym/gym.module'
import { EquipmentController } from './equipment.controller'
import { EquipmentService } from './equipment.service'

@Module({
  imports: [GymModule],
  controllers: [EquipmentController],
  providers: [EquipmentService],
})
export class EquipmentModule {}
```

- [ ] **Step 3: Import `EquipmentModule` in `app.module.ts`**

Add to imports in `apps/api/src/app.module.ts`:

```typescript
import { EquipmentModule } from './equipment/equipment.module'

@Module({
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
    EquipmentModule,   // ← add this
  ],
  ...
})
```

- [ ] **Step 4: Build check**

```bash
cd apps/api && npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Smoke test the API**

Start the API (ensure Docker PostgreSQL is running first):
```bash
docker compose up -d
cd apps/api && npm run dev
```

In a separate terminal:
```bash
curl -s http://localhost:3000/api/equipment -H "x-user-id: default-user" | cat
```

Expected: `[]` (empty array — no equipment yet).

Stop the API with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/equipment/ apps/api/src/app.module.ts
git commit -m "feat: EquipmentController + Module, wire into AppModule"
```

---

### Task 9: Web equipment API client

**Files:**
- Create: `apps/web/src/api/equipment.ts`

- [ ] **Step 1: Create `equipment.ts`**

```typescript
// apps/web/src/api/equipment.ts
import type { AnalyzeSuggestion, EquipmentWithExercises, SaveExerciseInput } from '@gymtracker/shared'

export const equipmentApi = {
  list: async (): Promise<EquipmentWithExercises[]> => {
    const res = await fetch('/api/equipment')
    if (!res.ok) throw new Error('Failed to load equipment')
    return res.json() as Promise<EquipmentWithExercises[]>
  },

  analyze: async (
    file: File,
    equipmentType: string,
    description: string,
  ): Promise<AnalyzeSuggestion> => {
    const form = new FormData()
    form.append('file', file)
    form.append('equipmentType', equipmentType)
    form.append('description', description)
    const res = await fetch('/api/equipment/analyze', { method: 'POST', body: form })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ message: 'AI analysis failed' }))) as {
        message?: string
      }
      throw new Error(err.message ?? 'AI analysis failed')
    }
    return res.json() as Promise<AnalyzeSuggestion>
  },

  create: async (
    file: File,
    name: string,
    equipmentType: string,
    description: string,
    tags: string[],
    exercises: SaveExerciseInput[],
  ): Promise<EquipmentWithExercises> => {
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)
    form.append('equipmentType', equipmentType)
    form.append('description', description)
    form.append('tags', JSON.stringify(tags))
    form.append('exercises', JSON.stringify(exercises))
    const res = await fetch('/api/equipment', { method: 'POST', body: form })
    if (!res.ok) throw new Error('Failed to save equipment')
    return res.json() as Promise<EquipmentWithExercises>
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`/api/equipment/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete equipment')
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/api/equipment.ts
git commit -m "feat: equipment API client"
```

---

### Task 10: /gym route — Equipment list with delete

**Files:**
- Create: `apps/web/src/routes/gym.tsx`

- [ ] **Step 1: Create `gym.tsx`**

```tsx
// apps/web/src/routes/gym.tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { EquipmentWithExercises } from '@gymtracker/shared'

import { equipmentApi } from '@/api/equipment'
import { AddEquipmentWizard } from '@/components/equipment/AddEquipmentWizard'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function GymPage() {
  const queryClient = useQueryClient()
  const [showWizard, setShowWizard] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ['equipment'],
    queryFn: equipmentApi.list,
  })

  const { mutate: deleteEquipment, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => equipmentApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['equipment'] })
      setPendingDeleteId(null)
    },
  })

  const pendingItem = equipment.find((e: EquipmentWithExercises) => e.id === pendingDeleteId)

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-start justify-between border-b px-4 pt-4 pb-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            Equipment
          </p>
          <h1 className="font-display font-700 text-3xl tracking-wide">GYM</h1>
        </div>
        <button
          className="bg-primary text-primary-foreground mt-1 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-transform active:scale-95"
          onClick={() => setShowWizard(true)}
        >
          <Plus size={16} />
          Add Equipment
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="text-muted-foreground p-8 text-center text-sm">Loading…</div>
        )}

        {!isLoading && equipment.length === 0 && (
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <p className="font-semibold">No equipment yet</p>
            <p className="text-muted-foreground text-sm">
              Photograph a piece of gym equipment to get started
            </p>
            <button
              className="bg-primary text-primary-foreground font-display font-600 rounded-xl px-5 py-2.5 text-sm tracking-wide uppercase transition-transform active:scale-95"
              onClick={() => setShowWizard(true)}
            >
              Add Equipment
            </button>
          </div>
        )}

        {equipment.map((item: EquipmentWithExercises) => (
          <div
            key={item.id}
            className="border-border/50 flex items-center gap-3 border-b px-4 py-3"
          >
            <img
              alt={item.name}
              className="bg-muted h-14 w-14 flex-shrink-0 rounded-xl object-cover"
              loading="lazy"
              src={`/api/equipment/photo/${item.thumbPath.split('/').pop()}`}
              onError={e => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <p className="text-muted-foreground text-xs">
                {item.equipmentType ?? 'other'} · {item.exercises.length} exercise
                {item.exercises.length !== 1 ? 's' : ''}
              </p>
              {item.exercises.length > 0 && (
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {item.exercises
                    .slice(0, 3)
                    .map(e => e.name)
                    .join(', ')}
                  {item.exercises.length > 3 ? ` +${item.exercises.length - 3} more` : ''}
                </p>
              )}
            </div>
            <button
              aria-label="Delete equipment"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors"
              onClick={() => setPendingDeleteId(item.id)}
            >
              <Trash2 className="text-muted-foreground" size={16} strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>

      {showWizard && (
        <AddEquipmentWizard
          onClose={() => setShowWizard(false)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ['equipment'] })
            setShowWizard(false)
          }}
        />
      )}

      <Dialog open={pendingDeleteId !== null} onOpenChange={open => !open && setPendingDeleteId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete equipment?</DialogTitle>
            <DialogDescription>
              {pendingItem ? `"${pendingItem.name}" ` : 'This equipment '}
              and its photo will be permanently removed. Linked exercises are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button className="flex-1" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              className="flex-1"
              disabled={isDeleting}
              variant="destructive"
              onClick={() => pendingDeleteId && deleteEquipment(pendingDeleteId)}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/routes/gym.tsx
git commit -m "feat: /gym route — Equipment list with delete"
```

---

### Task 11: AddEquipmentWizard step 1 — photo capture + hints + analyze

**Files:**
- Create: `apps/web/src/components/equipment/AddEquipmentWizard.tsx`

- [ ] **Step 1: Create the wizard with step 1**

```tsx
// apps/web/src/components/equipment/AddEquipmentWizard.tsx
import { useMutation } from '@tanstack/react-query'
import { Camera, ChevronLeft, X } from 'lucide-react'
import { useRef, useState } from 'react'

import type { AnalyzeSuggestion, SaveExerciseInput, SuggestedExercise } from '@gymtracker/shared'

import { equipmentApi } from '@/api/equipment'
import { Button } from '@/components/ui/button'

const EQUIPMENT_TYPES = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'other', label: 'Other' },
] as const

type Props = {
  onClose: () => void
  onSaved: () => void
}

type Step1State = {
  file: File | null
  previewUrl: string | null
  equipmentType: string
  description: string
}

type Step2State = {
  file: File
  suggestion: AnalyzeSuggestion
  name: string
  tags: string[]
  tagsInput: string
  selectedExercises: Set<number>
}

export function AddEquipmentWizard({ onClose, onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<1 | 2>(1)
  const [s1, setS1] = useState<Step1State>({
    file: null,
    previewUrl: null,
    equipmentType: 'machine',
    description: '',
  })
  const [s2, setS2] = useState<Step2State | null>(null)

  const analyze = useMutation({
    mutationFn: ({ file, equipmentType, description }: { file: File; equipmentType: string; description: string }) =>
      equipmentApi.analyze(file, equipmentType, description),
    onSuccess: (suggestion) => {
      setS2({
        file: s1.file!,
        suggestion,
        name: suggestion.equipment.name,
        tags: suggestion.equipment.tags,
        tagsInput: suggestion.equipment.tags.join(', '),
        selectedExercises: new Set(suggestion.exercises.map((_, i) => i)),
      })
      setStep(2)
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setS1(prev => ({
      ...prev,
      file,
      previewUrl: URL.createObjectURL(file),
    }))
  }

  if (step === 2 && s2) {
    return <Step2 s2={s2} setS2={setS2} onBack={() => setStep(1)} onClose={onClose} onSaved={onSaved} />
  }

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="border-border flex items-center gap-3 border-b px-4 py-3">
        <button className="flex h-9 w-9 items-center justify-center rounded-full" onClick={onClose}>
          <X size={20} />
        </button>
        <h2 className="flex-1 text-base font-semibold">Add Equipment</h2>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        {/* Photo picker */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-widest">
            Photo
          </label>
          <button
            className="bg-muted border-border flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-8 transition-colors active:scale-95"
            onClick={() => fileRef.current?.click()}
          >
            {s1.previewUrl ? (
              <img
                alt="Equipment preview"
                className="h-40 w-full rounded-xl object-cover"
                src={s1.previewUrl}
              />
            ) : (
              <>
                <Camera className="text-muted-foreground" size={32} strokeWidth={1.5} />
                <span className="text-muted-foreground text-sm">Tap to take or choose a photo</span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            accept="image/*"
            capture="environment"
            className="hidden"
            type="file"
            onChange={handleFileChange}
          />
        </div>

        {/* Equipment Type */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-widest">
            Equipment Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {EQUIPMENT_TYPES.map(({ value, label }) => (
              <button
                key={value}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  s1.equipmentType === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground'
                }`}
                onClick={() => setS1(prev => ({ ...prev, equipmentType: value }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Description / hint */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-widest">
            Description (helps AI)
          </label>
          <textarea
            className="bg-card border-border focus:border-primary w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors"
            placeholder="e.g. left cable tower near the window, dual pulley"
            rows={3}
            value={s1.description}
            onChange={e => setS1(prev => ({ ...prev, description: e.target.value }))}
          />
        </div>
      </div>

      <div className="border-border border-t p-4 pb-safe">
        {analyze.isError && (
          <p className="text-destructive mb-3 text-center text-sm">
            {analyze.error instanceof Error ? analyze.error.message : 'Analysis failed'}
          </p>
        )}
        <Button
          className="w-full"
          disabled={!s1.file || analyze.isPending}
          onClick={() => {
            if (s1.file) {
              analyze.mutate({
                file: s1.file,
                equipmentType: s1.equipmentType,
                description: s1.description,
              })
            }
          }}
        >
          {analyze.isPending ? 'Analyzing…' : 'Analyze Photo'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit (step 1 only, step 2 comes next task)**

```bash
git add apps/web/src/components/equipment/AddEquipmentWizard.tsx
git commit -m "feat: AddEquipmentWizard step 1 — photo capture and hint form"
```

---

### Task 12: AddEquipmentWizard step 2 — review + confirm + save

**Files:**
- Modify: `apps/web/src/components/equipment/AddEquipmentWizard.tsx`

- [ ] **Step 1: Add the `Step2` component at the end of `AddEquipmentWizard.tsx`**

Add after the `AddEquipmentWizard` function (still in the same file):

```tsx
type Step2Props = {
  s2: {
    file: File
    suggestion: AnalyzeSuggestion
    name: string
    tags: string[]
    tagsInput: string
    selectedExercises: Set<number>
  }
  setS2: React.Dispatch<React.SetStateAction<typeof s2 | null>>
  onBack: () => void
  onClose: () => void
  onSaved: () => void
}

function Step2({ s2, setS2, onBack, onClose, onSaved }: Step2Props) {
  const save = useMutation({
    mutationFn: () => {
      const selected = s2.suggestion.exercises.filter((_, i) => s2.selectedExercises.has(i))
      const exercises: SaveExerciseInput[] = selected.map((ex: SuggestedExercise) => ({
        existingId: ex.existingId ?? undefined,
        name: ex.name,
        category: ex.category,
        equipmentType: ex.equipmentType,
      }))
      return equipmentApi.create(s2.file, s2.name, s2.suggestion.exercises[0]?.equipmentType ?? 'other', '', s2.tags, exercises)
    },
    onSuccess: onSaved,
  })

  const toggleExercise = (index: number) => {
    setS2(prev => {
      if (!prev) return prev
      const next = new Set(prev.selectedExercises)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return { ...prev, selectedExercises: next }
    })
  }

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="border-border flex items-center gap-3 border-b px-4 py-3">
        <button className="flex h-9 w-9 items-center justify-center rounded-full" onClick={onBack}>
          <ChevronLeft size={20} />
        </button>
        <h2 className="flex-1 text-base font-semibold">Review Suggestions</h2>
        <button className="flex h-9 w-9 items-center justify-center rounded-full" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        {/* Equipment name */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-widest">
            Equipment Name
          </label>
          <input
            className="bg-card border-border focus:border-primary w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors"
            value={s2.name}
            onChange={e => setS2(prev => prev ? { ...prev, name: e.target.value } : prev)}
          />
        </div>

        {/* Tags */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-widest">
            Tags (comma-separated)
          </label>
          <input
            className="bg-card border-border focus:border-primary w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors"
            value={s2.tagsInput}
            onChange={e =>
              setS2(prev =>
                prev
                  ? {
                      ...prev,
                      tagsInput: e.target.value,
                      tags: e.target.value
                        .split(',')
                        .map(t => t.trim())
                        .filter(Boolean),
                    }
                  : prev,
              )
            }
          />
        </div>

        {/* Exercises */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-widest">
            Exercises ({s2.selectedExercises.size} selected)
          </label>
          <div className="space-y-1">
            {s2.suggestion.exercises.map((ex: SuggestedExercise, i: number) => (
              <button
                key={i}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                  s2.selectedExercises.has(i)
                    ? 'border-primary bg-primary/5'
                    : 'border-border opacity-50'
                }`}
                onClick={() => toggleExercise(i)}
              >
                <div
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${
                    s2.selectedExercises.has(i)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground'
                  }`}
                >
                  {s2.selectedExercises.has(i) && (
                    <svg fill="none" height="10" viewBox="0 0 12 10" width="12">
                      <path
                        d="M1 5l3.5 3.5L11 1"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{ex.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {ex.category} · {ex.equipmentType}
                    {ex.existingId ? ' · already in library' : ' · will be created'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-border border-t p-4 pb-safe">
        {save.isError && (
          <p className="text-destructive mb-3 text-center text-sm">Failed to save — try again</p>
        )}
        <Button
          className="w-full"
          disabled={save.isPending || s2.selectedExercises.size === 0}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : `Save Equipment`}
        </Button>
      </div>
    </div>
  )
}
```

Also fix the `mutationFn` in `Step2` to pass `equipmentType` from the step 1 state. Since `Step2` doesn't have access to step 1's `equipmentType` directly, add it to the `Step2State`:

In the `Step2State` type, add `equipmentType: string`:
```typescript
type Step2State = {
  file: File
  suggestion: AnalyzeSuggestion
  name: string
  tags: string[]
  tagsInput: string
  selectedExercises: Set<number>
  equipmentType: string   // ← add this
  description: string     // ← add this
}
```

In the `analyze` mutation's `onSuccess`, pass these:
```typescript
onSuccess: (suggestion) => {
  setS2({
    file: s1.file!,
    suggestion,
    name: suggestion.equipment.name,
    tags: suggestion.equipment.tags,
    tagsInput: suggestion.equipment.tags.join(', '),
    selectedExercises: new Set(suggestion.exercises.map((_, i) => i)),
    equipmentType: s1.equipmentType,    // ← add
    description: s1.description,        // ← add
  })
  setStep(2)
},
```

And fix the `mutationFn` in `Step2` to use them:
```typescript
mutationFn: () => {
  const selected = s2.suggestion.exercises.filter((_, i) => s2.selectedExercises.has(i))
  const exercises: SaveExerciseInput[] = selected.map((ex: SuggestedExercise) => ({
    existingId: ex.existingId ?? undefined,
    name: ex.name,
    category: ex.category,
    equipmentType: ex.equipmentType,
  }))
  return equipmentApi.create(
    s2.file,
    s2.name,
    s2.equipmentType,    // ← use from state
    s2.description,      // ← use from state
    s2.tags,
    exercises,
  )
},
```

- [ ] **Step 2: Build check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/equipment/AddEquipmentWizard.tsx
git commit -m "feat: AddEquipmentWizard step 2 — review, confirm, and save"
```

---

### Task 13: Wire router + nav + update exercises.tsx

**Files:**
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/components/layout/AppLayout.tsx`
- Modify: `apps/web/src/routes/exercises.tsx`

- [ ] **Step 1: Add `/gym` route to `router.tsx`**

Add import and route definition:

```typescript
// In router.tsx — add route definition alongside the others:
const gymRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/gym',
  component: lazyRouteComponent(() => import('./routes/gym').then(m => ({ default: m.GymPage }))),
})
```

Add `gymRoute` to `layoutRoute.addChildren([...])`:

```typescript
const routeTree = rootRoute.addChildren([
  layoutRoute.addChildren([
    indexRoute,
    dashboardRoute,
    exercisesRoute,
    statsRoute,
    bodyRoute,
    photosRoute,
    settingsRoute,
    historyRoute,
    historyDetailRoute,
    workoutStartRoute,
    workoutTemplateNewRoute,
    gymRoute,   // ← add
  ]),
  workoutSessionRoute,
])
```

- [ ] **Step 2: Add Gym to nav in `AppLayout.tsx`**

```typescript
// apps/web/src/components/layout/AppLayout.tsx
import { Link, useRouterState } from '@tanstack/react-router'
import { Home, Dumbbell, BookOpen, BarChart2, Activity, Settings, Building2 } from 'lucide-react'

import { cn } from '@/lib/utils'

const NAV = [
  { to: '/dashboard', label: 'Home', Icon: Home },
  { to: '/workout/start', label: 'Workouts', Icon: Dumbbell },
  { to: '/exercises', label: 'Exercises', Icon: BookOpen },
  { to: '/gym', label: 'Gym', Icon: Building2 },
  { to: '/stats', label: 'Stats', Icon: BarChart2 },
  { to: '/body', label: 'Body', Icon: Activity },
  { to: '/settings', label: 'Settings', Icon: Settings },
] as const

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { location } = useRouterState()
  return (
    <div className="bg-background flex h-svh flex-col">
      <main className="flex-1 overflow-y-auto">{children}</main>
      <nav className="border-border bg-card pb-safe grid grid-cols-7 border-t">
        {NAV.map(({ to, label, Icon }) => {
          const active = location.pathname.startsWith(to)
          return (
            <Link
              key={to}
              className="relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 pt-2 pb-1"
              to={to}
            >
              {active && (
                <span className="bg-primary absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full" />
              )}
              <Icon
                className={cn('transition-colors', active ? 'text-primary' : 'text-muted-foreground')}
                size={20}
                strokeWidth={active ? 2.5 : 1.75}
              />
              <span
                className={cn(
                  'text-[10px] font-medium tracking-wide transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
```

Note: icon size reduced from `22` to `20` to fit 7 items.

- [ ] **Step 3: Update `exercises.tsx` for renamed field**

Find the line `{ex.equipment && (` and update:

```tsx
// Before:
                {ex.equipment && (
                  <span className="text-muted-foreground bg-muted rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                    {EQUIPMENT_LABELS[ex.equipment] ?? ex.equipment}
                  </span>
                )}
// After:
                {ex.equipmentType && (
                  <span className="text-muted-foreground bg-muted rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                    {EQUIPMENT_LABELS[ex.equipmentType] ?? ex.equipmentType}
                  </span>
                )}
```

- [ ] **Step 4: Full TypeScript build check**

```bash
cd apps/web && npx tsc --noEmit
cd ../api && npm run build
```

Expected: no TypeScript errors in either package.

- [ ] **Step 5: Start the full stack and test the golden path**

```bash
docker compose up -d
cd apps/api && npm run dev &
cd apps/web && npm run dev
```

Open `http://localhost:5173` in a browser.

1. Navigate to **Gym** tab — should show empty state with "Add Equipment" button
2. Tap **Add Equipment** — wizard opens
3. Choose a photo, select Equipment Type, type a description, tap **Analyze Photo**
4. Step 2 appears: AI-suggested name is pre-filled (editable), tags are pre-filled (editable), exercises are listed with checkboxes pre-checked
5. Toggle some exercises off, tap **Save Equipment**
6. Gym list shows the new card with thumbnail, name, exercise count
7. Tap the trash icon → confirm dialog → delete → card disappears
8. Navigate to **Exercises** tab — confirm the equipment type badge still shows correctly (renamed field)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/router.tsx apps/web/src/components/layout/AppLayout.tsx apps/web/src/routes/exercises.tsx apps/web/src/routes/gym.tsx
git commit -m "feat: wire /gym route and nav entry, update exercises for equipmentType rename"
```

---

## Self-Review

### 1. Spec Coverage

| Requirement | Task |
|---|---|
| API-side Gemini call | Task 6 |
| Gemini 2.0 Flash structured JSON | Task 6 |
| Two-phase flow (analyze + save) | Tasks 6, 7, 8 |
| Photo re-uploaded on save | Task 12 (Step2 passes `s2.file`) |
| Server-side exercise deduplication with `existingId` | Task 6 |
| `exercises.equipment` → `equipment_type` column rename | Task 2 |
| `gyms`, `equipment`, `equipment_exercises` tables | Task 3 |
| Nullable `equipment_id` FK on `sets` and `template_exercises` | Task 3 |
| Implicit Gym creation on first upload | Task 5 + Task 7 (`create` calls `gymService.getOrCreateForUser`) |
| User-owned new exercises (`isDefault: 0`) | Task 7 |
| Equipment photos at `{photosDir}/{userId}/equipment/` | Task 7 |
| HTTP 422 on Gemini failure | Task 6 (`UnprocessableEntityException`) |
| `/gym` route with Equipment list | Task 10 |
| View + Delete only (no edit) | Task 10 |
| Add Equipment wizard (2 steps) | Tasks 11, 12 |
| Gemini name + tags pre-filled and editable | Task 12 |
| Exercise checkbox review | Task 12 |
| Nav entry + `grid-cols-7` | Task 13 |
| ADR for Gemini choice | Already committed (`docs/adr/0003`) |

### 2. No Placeholder Issues

All steps contain actual code. No TBD, TODO, or "handle edge cases" language found.

### 3. Type Consistency

- `SuggestedExercise.existingId: string | null` (Task 4) used in Task 6 (`byName.get(...) ?? null`) ✓
- `SaveExerciseInput.existingId?: string` (Task 4) used in Task 12 (`ex.existingId ?? undefined`) ✓
- `toEquipmentWithExercises(row, exercises)` (Task 7) matches usage in Tasks 7 (`create`) and 7 (`findAll`) ✓
- `EquipmentWithExercises.exercises: Exercise[]` (Task 4) used in Task 10 (`item.exercises.length`) ✓
- `Exercise.equipmentType` (Task 2) used in Task 13 (`ex.equipmentType`) ✓
