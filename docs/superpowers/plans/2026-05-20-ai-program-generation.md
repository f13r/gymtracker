# AI Program Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the AI generate a full multi-phase training Program for the user based on their profile (experience level, goal, training days, session duration, body weight) and the exercises available in their Gym. The Program spawns concrete Templates and weekly Schedules. After each Session finishes, the system evaluates whether the current Phase's performance signals warrant a change (phase transition, exercise swap, deload) and surfaces a pending Program Update for the user to accept or dismiss. Progression Suggestions continue to auto-populate set weights as before — no change to that flow.

**Architecture:**
- New `ProgramModule` with `ProgramService` (generation + adaptation) and `ProgramController`
- Program generation: one Gemini call with user profile + available exercises + RAG coaching chunks → structured JSON → persisted as `programs` + `programPhases` + `programPhaseTemplates` + auto-created Templates and Schedules
- Program adaptation: evaluated fire-and-forget on every `finishSession`, also exposed as `POST /programs/:id/evaluate` for manual re-trigger → produces a `programUpdates` row pending user acknowledgement → Templates and Schedules mutated only on acceptance
- Session tagging: sessions started from a Program Schedule carry `programPhaseId` so phase completion is tracked by session count, not calendar

**Tech Stack:** NestJS, Drizzle ORM (PostgreSQL), Gemini 2.5 Flash (same as Equipment Analysis + Progression Suggestions), CoachingKnowledgeService (existing RAG), Vitest, React + TanStack Query

**Product flow this plan implements:**
1. User sets up Gym + Equipment → Exercises exist ✓ (already built)
2. First launch: Onboarding captures profile fields + training days
3. User triggers "Create my Program" → AI generates Program
4. Weekly Schedules auto-created on user's configured days
5. User trains → Progression Suggestions auto-populate weights (already works)
6. System evaluates Program after each Session finish → Program Update surfaced if needed
7. User accepts or dismisses Program Update → Templates/Schedules mutated on accept

---

## Glossary additions (resolved in design session)

- **Program** — AI-generated multi-phase training prescription; one active per user
- **Phase** — Named block within a Program; tracks completion by session count; has machine `type` (`accumulation | strength | peaking | maintenance`) and AI-generated user-facing `name`
- **Program Update** — Pending adaptation proposal (phase transition, exercise swap, deload, phase extension); requires user acceptance before Templates/Schedules are mutated

---

## New data requirements

### User Profile extensions (2 new fields)

| Field | Type | Description |
|---|---|---|
| `trainingDays` | `text` (JSON array) | e.g. `["monday","wednesday","friday"]` |
| `sessionDurationMinutes` | `integer` | e.g. `60` |

### New tables

| Table | Purpose |
|---|---|
| `programs` | Top-level Program record |
| `program_phases` | Ordered Phase blocks within a Program |
| `program_phase_templates` | Links a Phase to its Template(s), one per split day |
| `program_updates` | Pending adaptation proposals awaiting user acknowledgement |

### Existing table extensions

| Table | New column | Purpose |
|---|---|---|
| `workout_sessions` | `program_phase_id` (nullable FK → `program_phases.id`) | Tag sessions started from a Program Schedule |

---

## File Map

**Create:**
- `apps/api/src/program/program.module.ts`
- `apps/api/src/program/program.service.ts` — generation, adaptation evaluation, update apply
- `apps/api/src/program/program.controller.ts` — CRUD + manual re-evaluate
- `apps/api/src/program/program.service.spec.ts`
- `packages/shared/src/program.schema.ts` — shared types

**Modify:**
- `apps/api/src/drizzle/schema.ts` — 4 new tables + 2 userProfile fields + session column
- `apps/api/src/app.module.ts` — import ProgramModule
- `apps/api/src/workouts/workouts.service.ts` — call ProgramService.evaluateAfterSession fire-and-forget in finishSession
- `apps/api/src/workouts/workouts.module.ts` — import ProgramModule
- `packages/shared/src/index.ts` — re-export program.schema
- `apps/web/src/api/program.ts` — API client functions (new file)
- `apps/web/src/pages/OnboardingPage.tsx` — new onboarding form (new file)
- `apps/web/src/pages/ProgramPage.tsx` — Program view + pending updates (new file)

**Generate (via drizzle-kit):**
- `apps/api/src/drizzle/migrations/0006_programs.sql`

---

### Task 1: Schema — User Profile extensions + 4 new tables + session column

**Files:**
- Modify: `apps/api/src/drizzle/schema.ts`
- Generate: `apps/api/src/drizzle/migrations/0006_*.sql`

- [ ] **Step 1: Extend `userProfiles` and add 4 new tables in `schema.ts`**

Extend `userProfiles`:

```typescript
export const userProfiles = pgTable('user_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id),
  age: integer('age'),
  heightCm: integer('height_cm'),
  experienceLevel: text('experience_level'),
  goal: text('goal'),
  trainingPhase: text('training_phase'),
  trainingDays: text('training_days'),           // JSON: string[] e.g. ["monday","wednesday","friday"]
  sessionDurationMinutes: integer('session_duration_minutes'),
  updatedAt: integer('updated_at').notNull(),
})
```

Add 4 new tables:

```typescript
export const programs = pgTable('programs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),                  // AI-generated, user-facing
  goal: text('goal').notNull(),
  experienceLevel: text('experience_level').notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'completed' | 'abandoned'
  createdAt: integer('created_at').notNull(),
})

export const programPhases = pgTable('program_phases', {
  id: text('id').primaryKey(),
  programId: text('program_id').notNull().references(() => programs.id),
  name: text('name').notNull(),                  // AI-generated, user-facing e.g. "Building Your Base"
  type: text('type').notNull(),                  // 'accumulation' | 'strength' | 'peaking' | 'maintenance'
  orderIndex: integer('order_index').notNull(),
  targetSessionCount: integer('target_session_count').notNull(), // e.g. 24 (3/week × 8 weeks)
  completedSessionCount: integer('completed_session_count').notNull().default(0),
  splitType: text('split_type').notNull(),        // 'full_body' | 'upper_lower' | 'push_pull_legs'
  rationale: text('rationale').notNull(),         // AI explanation shown to user
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'completed'
})

export const programPhaseTemplates = pgTable('program_phase_templates', {
  id: text('id').primaryKey(),
  phaseId: text('phase_id').notNull().references(() => programPhases.id),
  templateId: text('template_id').notNull().references(() => workoutTemplates.id),
  dayLabel: text('day_label').notNull(),          // 'A', 'B', 'C' — rotation label within the split
})

export const programUpdates = pgTable('program_updates', {
  id: text('id').primaryKey(),
  programId: text('program_id').notNull().references(() => programs.id),
  type: text('type').notNull(),                  // 'phase_transition' | 'exercise_swap' | 'deload' | 'phase_extension'
  description: text('description').notNull(),    // human-readable summary for the user
  reason: text('reason').notNull(),              // coaching rationale
  evidence: text('evidence').notNull(),          // JSON: string[] — specific numbers/signals cited
  proposedChanges: text('proposed_changes').notNull(), // JSON: structured payload applied on accept
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'dismissed'
  createdAt: integer('created_at').notNull(),
})
```

Add `programPhaseId` to `workoutSessions`:

```typescript
export const workoutSessions = pgTable('workout_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  templateId: text('template_id').references(() => workoutTemplates.id),
  programPhaseId: text('program_phase_id').references(() => programPhases.id), // new — nullable
  name: text('name').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  notes: text('notes'),
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Generate migration**

```bash
cd apps/api && npx drizzle-kit generate
```

Expected: `0006_*.sql` containing new tables + ALTER statements for userProfiles and workout_sessions.

- [ ] **Step 4: Apply migration**

```bash
cd apps/api && npx drizzle-kit migrate
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/drizzle/schema.ts apps/api/src/drizzle/migrations/
git commit -m "feat: add programs, program_phases, program_phase_templates, program_updates tables; extend user_profiles and workout_sessions"
```

---

### Task 2: Shared types

**Files:**
- Create: `packages/shared/src/program.schema.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create shared types**

```typescript
// packages/shared/src/program.schema.ts
import { z } from 'zod'

export const ProgramStatusSchema = z.enum(['active', 'completed', 'abandoned'])
export const PhaseTypeSchema = z.enum(['accumulation', 'strength', 'peaking', 'maintenance'])
export const PhaseStatusSchema = z.enum(['pending', 'active', 'completed'])
export const SplitTypeSchema = z.enum(['full_body', 'upper_lower', 'push_pull_legs'])
export const ProgramUpdateTypeSchema = z.enum(['phase_transition', 'exercise_swap', 'deload', 'phase_extension'])
export const ProgramUpdateStatusSchema = z.enum(['pending', 'accepted', 'dismissed'])

export type ProgramStatus = z.infer<typeof ProgramStatusSchema>
export type PhaseType = z.infer<typeof PhaseTypeSchema>
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>
export type SplitType = z.infer<typeof SplitTypeSchema>
export type ProgramUpdateType = z.infer<typeof ProgramUpdateTypeSchema>
export type ProgramUpdateStatus = z.infer<typeof ProgramUpdateStatusSchema>

export type ProgramPhaseTemplate = {
  id: string
  phaseId: string
  templateId: string
  dayLabel: string
}

export type ProgramPhase = {
  id: string
  programId: string
  name: string
  type: PhaseType
  orderIndex: number
  targetSessionCount: number
  completedSessionCount: number
  splitType: SplitType
  rationale: string
  status: PhaseStatus
  templates: ProgramPhaseTemplate[]
}

export type Program = {
  id: string
  userId: string
  name: string
  goal: string
  experienceLevel: string
  status: ProgramStatus
  createdAt: number
  phases: ProgramPhase[]
  pendingUpdate: ProgramUpdate | null
}

export type ProgramUpdate = {
  id: string
  programId: string
  type: ProgramUpdateType
  description: string
  reason: string
  evidence: string[]
  proposedChanges: unknown
  status: ProgramUpdateStatus
  createdAt: number
}

export const CreateProgramSchema = z.object({}) // all inputs come from User Profile

export const AcknowledgeProgramUpdateSchema = z.object({
  action: z.enum(['accept', 'dismiss']),
})
```

- [ ] **Step 2: Export from shared index**

```typescript
export * from './program.schema.js'
```

- [ ] **Step 3: Build and verify**

```bash
cd packages/shared && npm run build
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/program.schema.ts packages/shared/src/index.ts
git commit -m "feat: add Program shared types"
```

---

### Task 3: ProgramService — generation

**Files:**
- Create: `apps/api/src/program/program.service.ts`
- Create: `apps/api/src/program/program.service.spec.ts`

The generation flow:
1. Validate prerequisites (user has goal + trainingDays + experienceLevel in profile; gym has exercises)
2. Build situation summary for RAG
3. Retrieve 5 coaching chunks via CoachingKnowledgeService
4. Build Gemini prompt (profile + available exercises + coaching chunks)
5. Call Gemini, parse structured JSON
6. Persist: programs → programPhases (mark first as 'active') → for each phase: create Templates → programPhaseTemplates
7. Auto-create weekly Schedules for the user's training days pointing to Phase 1 Templates

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/program/program.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProgramService } from './program.service'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
  execute: vi.fn(),
}
const mockConfig = { getOrThrow: () => 'fake-key' }
const mockCoaching = { retrieveForSituation: vi.fn().mockResolvedValue([]) }

describe('ProgramService.buildGenerationPrompt', () => {
  it('includes experience level, goal, training days, and session duration', () => {
    const svc = new ProgramService(mockDb as any, mockConfig as any, mockCoaching as any)
    const prompt = svc.buildGenerationPrompt(
      { experienceLevel: 'beginner', goal: 'hypertrophy', trainingDays: ['monday', 'wednesday', 'friday'], sessionDurationMinutes: 60, latestBodyWeightKg: 75 },
      [{ id: 'squat-id', name: 'Squat', category: 'legs' }, { id: 'bench-id', name: 'Bench Press', category: 'push' }],
      ['Novice lifters adapt session-to-session.'],
    )
    expect(prompt).toContain('beginner')
    expect(prompt).toContain('hypertrophy')
    expect(prompt).toContain('monday')
    expect(prompt).toContain('60 minutes')
    expect(prompt).toContain('75kg')
    expect(prompt).toContain('Squat')
    expect(prompt).toContain('Novice lifters adapt session-to-session.')
  })

  it('includes JSON output format instructions', () => {
    const svc = new ProgramService(mockDb as any, mockConfig as any, mockCoaching as any)
    const prompt = svc.buildGenerationPrompt(
      { experienceLevel: 'beginner', goal: 'strength', trainingDays: ['tuesday', 'thursday'], sessionDurationMinutes: 45, latestBodyWeightKg: null },
      [],
      [],
    )
    expect(prompt).toContain('phases')
    expect(prompt).toContain('targetSessionCount')
    expect(prompt).toContain('splitType')
  })
})

describe('ProgramService.parseGeminiProgram', () => {
  it('parses valid AI response into Program structure', () => {
    const svc = new ProgramService(mockDb as any, mockConfig as any, mockCoaching as any)
    const raw = {
      name: 'My 16-Week Journey',
      phases: [
        {
          name: 'Building Your Base',
          type: 'accumulation',
          durationWeeks: 8,
          splitType: 'full_body',
          rationale: 'Beginners need full-body frequency.',
          templates: [
            {
              name: 'Full Body A',
              dayLabel: 'A',
              exercises: [
                { exerciseId: 'squat-id', orderIndex: 0, defaultSets: 3, defaultReps: 8, defaultWeightKg: 40 },
              ],
            },
          ],
        },
      ],
    }
    const result = svc.parseGeminiProgram(raw, 3)
    expect(result.name).toBe('My 16-Week Journey')
    expect(result.phases).toHaveLength(1)
    expect(result.phases[0].targetSessionCount).toBe(24) // 3 days/week × 8 weeks
    expect(result.phases[0].type).toBe('accumulation')
  })

  it('throws on missing required fields', () => {
    const svc = new ProgramService(mockDb as any, mockConfig as any, mockCoaching as any)
    expect(() => svc.parseGeminiProgram({ phases: [] }, 3)).toThrow()
  })
})
```

- [ ] **Step 2: Run tests — expect fail**

```bash
cd apps/api && npx vitest run src/program/program.service.spec.ts
```

Expected: FAIL — ProgramService does not exist.

- [ ] **Step 3: Implement ProgramService (generation portion)**

```typescript
// apps/api/src/program/program.service.ts
import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, and, desc, isNull } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { randomUUID } from 'crypto'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { CoachingKnowledgeService } from '../progression/coaching-knowledge.service'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

type UserProgramContext = {
  experienceLevel: string
  goal: string
  trainingDays: string[]
  sessionDurationMinutes: number
  latestBodyWeightKg: number | null
}

type AvailableExercise = {
  id: string
  name: string
  category: string | null
}

type ParsedPhaseTemplate = {
  name: string
  dayLabel: string
  exercises: { exerciseId: string; orderIndex: number; defaultSets: number; defaultReps: number; defaultWeightKg: number }[]
}

type ParsedPhase = {
  name: string
  type: string
  durationWeeks: number
  splitType: string
  rationale: string
  templates: ParsedPhaseTemplate[]
  targetSessionCount: number
}

type ParsedProgram = {
  name: string
  phases: ParsedPhase[]
}

@Injectable()
export class ProgramService {
  private readonly logger = new Logger(ProgramService.name)
  private readonly geminiApiKey: string

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    config: ConfigService,
    private readonly coachingKnowledge: CoachingKnowledgeService,
  ) {
    this.geminiApiKey = config.getOrThrow<string>('GEMINI_API_KEY')
  }

  async generateProgram(userId: string) {
    // 1. Load user profile
    const userCtx = await this.getUserProgramContext(userId)

    // 2. Load available exercises from user's gym
    const exercises = await this.getAvailableExercises(userId)
    if (exercises.length === 0) {
      throw new BadRequestException(
        'No exercises found. Add equipment to your gym first so the AI knows what to prescribe.',
      )
    }

    // 3. Abandon any existing active program
    await this.db
      .update(schema.programs)
      .set({ status: 'abandoned' })
      .where(and(eq(schema.programs.userId, userId), eq(schema.programs.status, 'active')))

    // 4. RAG: retrieve relevant coaching chunks
    const situationSummary = `${userCtx.experienceLevel} lifter, goal: ${userCtx.goal}, ${userCtx.trainingDays.length} days/week, ${userCtx.sessionDurationMinutes} min sessions, creating new program from scratch`
    let coachingChunks: string[] = []
    try {
      coachingChunks = await this.coachingKnowledge.retrieveForSituation(situationSummary)
    } catch {
      this.logger.warn('Coaching RAG failed during program generation — proceeding without chunks')
    }

    // 5. Build prompt and call Gemini
    const prompt = this.buildGenerationPrompt(userCtx, exercises, coachingChunks)
    const raw = await this.callGemini(prompt)
    const parsed = this.parseGeminiProgram(raw, userCtx.trainingDays.length)

    // 6. Persist program + phases + templates + schedules
    return this.persistProgram(userId, parsed, userCtx.trainingDays)
  }

  buildGenerationPrompt(user: UserProgramContext, exercises: AvailableExercise[], coachingChunks: string[]): string {
    const exerciseList = exercises.map(e => `- ${e.name} (${e.category ?? 'other'})`).join('\n')
    const coachingSection = coachingChunks.length > 0
      ? `COACHING PRINCIPLES (apply these when designing the program):\n${coachingChunks.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n`
      : ''

    return [
      'You are a certified strength and conditioning coach creating a personalised multi-phase training program.',
      '',
      coachingSection,
      'USER PROFILE:',
      `Experience level: ${user.experienceLevel}`,
      `Goal: ${user.goal}`,
      `Available training days: ${user.trainingDays.join(', ')}`,
      `Session duration: ${user.sessionDurationMinutes} minutes`,
      user.latestBodyWeightKg ? `Body weight: ${user.latestBodyWeightKg}kg` : 'Body weight: unknown',
      '',
      'AVAILABLE EXERCISES (only prescribe exercises from this list, use exact IDs):',
      exerciseList,
      '',
      'TASK:',
      'Design a complete multi-phase training program. For a beginner: start with full-body 3x/week for 8 weeks (accumulation), then progress to an appropriate split for another 8 weeks. For intermediate/advanced: adjust phases accordingly.',
      '',
      'Return ONLY valid JSON in exactly this structure (no markdown, no explanation):',
      JSON.stringify({
        name: 'Program name (inspiring, concise)',
        phases: [
          {
            name: 'Phase user-facing name',
            type: 'accumulation | strength | peaking | maintenance',
            durationWeeks: 8,
            splitType: 'full_body | upper_lower | push_pull_legs',
            rationale: 'Why this phase structure for this user (2-3 sentences shown to user)',
            templates: [
              {
                name: 'Template name e.g. Full Body A',
                dayLabel: 'A',
                exercises: [
                  {
                    exerciseId: 'exact-exercise-id-from-list',
                    orderIndex: 0,
                    defaultSets: 3,
                    defaultReps: 8,
                    defaultWeightKg: 40,
                  },
                ],
              },
            ],
          },
        ],
      }, null, 2),
      '',
      'Rules:',
      '- For beginners: 2 templates per full-body phase (A and B), alternating. 3-4 exercises per template max for 60-min sessions.',
      '- For upper/lower split: 2 templates (Upper, Lower). For PPL: 3 templates (Push, Pull, Legs).',
      '- Starting weights: conservative — roughly 30-40% of estimated 1RM based on body weight and experience.',
      '- targetSessionCount is computed as durationWeeks × trainingDaysPerWeek (do not include in output — computed by the server).',
      '- exerciseId must exactly match one of the IDs from the AVAILABLE EXERCISES list.',
    ].join('\n')
  }

  parseGeminiProgram(raw: unknown, daysPerWeek: number): ParsedProgram {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid AI response: not an object')
    const obj = raw as Record<string, unknown>
    if (!obj.name || typeof obj.name !== 'string') throw new Error('Invalid AI response: missing name')
    if (!Array.isArray(obj.phases) || obj.phases.length === 0) throw new Error('Invalid AI response: missing phases')

    const phases: ParsedPhase[] = obj.phases.map((p: unknown, i: number) => {
      const phase = p as Record<string, unknown>
      if (!phase.name || !phase.type || !phase.durationWeeks || !phase.splitType || !phase.templates) {
        throw new Error(`Invalid phase at index ${i}`)
      }
      return {
        name: phase.name as string,
        type: phase.type as string,
        durationWeeks: Number(phase.durationWeeks),
        splitType: phase.splitType as string,
        rationale: (phase.rationale as string) ?? '',
        templates: phase.templates as ParsedPhaseTemplate[],
        targetSessionCount: Number(phase.durationWeeks) * daysPerWeek,
      }
    })

    return { name: obj.name as string, phases }
  }

  private async callGemini(prompt: string): Promise<unknown> {
    const response = await fetch(`${GEMINI_URL}?key=${this.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)')
      throw new Error(`Gemini program generation failed ${response.status}: ${body}`)
    }
    const json = await response.json() as { candidates: { content: { parts: { text: string }[] } }[] }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Gemini returned empty response')
    return JSON.parse(text)
  }

  private async getUserProgramContext(userId: string): Promise<UserProgramContext> {
    const [profile] = await this.db
      .select()
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, userId))
      .limit(1)

    if (!profile?.experienceLevel || !profile?.goal || !profile?.trainingDays) {
      throw new BadRequestException(
        'Complete your profile (experience level, goal, training days) before generating a Program.',
      )
    }

    const [latestWeight] = await this.db
      .select({ weightKg: schema.bodyWeights.weightKg })
      .from(schema.bodyWeights)
      .where(eq(schema.bodyWeights.userId, userId))
      .orderBy(desc(schema.bodyWeights.recordedAt))
      .limit(1)

    return {
      experienceLevel: profile.experienceLevel,
      goal: profile.goal,
      trainingDays: JSON.parse(profile.trainingDays) as string[],
      sessionDurationMinutes: profile.sessionDurationMinutes ?? 60,
      latestBodyWeightKg: latestWeight?.weightKg ?? null,
    }
  }

  private async getAvailableExercises(userId: string): Promise<AvailableExercise[]> {
    // Get exercises from user's gym equipment + default exercises
    const [gym] = await this.db
      .select({ id: schema.gyms.id })
      .from(schema.gyms)
      .where(eq(schema.gyms.userId, userId))
      .limit(1)

    if (gym) {
      // Exercises available via gym equipment
      const equipmentExercises = await this.db
        .selectDistinct({ id: schema.exercises.id, name: schema.exercises.name, category: schema.exercises.category })
        .from(schema.exercises)
        .innerJoin(schema.equipmentExercises, eq(schema.equipmentExercises.exerciseId, schema.exercises.id))
        .innerJoin(schema.equipment, eq(schema.equipment.id, schema.equipmentExercises.equipmentId))
        .where(eq(schema.equipment.gymId, gym.id))

      if (equipmentExercises.length > 0) return equipmentExercises
    }

    // Fall back to default exercises
    return this.db
      .select({ id: schema.exercises.id, name: schema.exercises.name, category: schema.exercises.category })
      .from(schema.exercises)
      .where(eq(schema.exercises.isDefault, 1))
  }

  private async persistProgram(userId: string, parsed: ParsedProgram, trainingDays: string[]) {
    const now = Math.floor(Date.now() / 1000)
    const programId = randomUUID()

    await this.db.insert(schema.programs).values({
      id: programId,
      userId,
      name: parsed.name,
      goal: '',
      experienceLevel: '',
      status: 'active',
      createdAt: now,
    })

    // Delete old schedules generated by a previous program (weekly schedules only)
    await this.db
      .delete(schema.workoutSchedules)
      .where(and(eq(schema.workoutSchedules.userId, userId), eq(schema.workoutSchedules.type, 'weekly')))

    for (let i = 0; i < parsed.phases.length; i++) {
      const phase = parsed.phases[i]
      const phaseId = randomUUID()

      await this.db.insert(schema.programPhases).values({
        id: phaseId,
        programId,
        name: phase.name,
        type: phase.type,
        orderIndex: i,
        targetSessionCount: phase.targetSessionCount,
        completedSessionCount: 0,
        splitType: phase.splitType,
        rationale: phase.rationale,
        status: i === 0 ? 'active' : 'pending',
      })

      for (const tmpl of phase.templates) {
        const templateId = randomUUID()
        await this.db.insert(schema.workoutTemplates).values({
          id: templateId,
          userId,
          name: tmpl.name,
          notes: null,
          createdAt: now,
        })

        for (let j = 0; j < tmpl.exercises.length; j++) {
          const ex = tmpl.exercises[j]
          await this.db.insert(schema.templateExercises).values({
            id: randomUUID(),
            templateId,
            exerciseId: ex.exerciseId,
            orderIndex: ex.orderIndex,
            defaultSets: ex.defaultSets,
            defaultReps: ex.defaultReps,
            defaultWeightKg: ex.defaultWeightKg,
            equipmentId: null,
          })
        }

        await this.db.insert(schema.programPhaseTemplates).values({
          id: randomUUID(),
          phaseId,
          templateId,
          dayLabel: tmpl.dayLabel,
        })

        // Auto-create weekly schedules for Phase 1 only
        if (i === 0) {
          const templateIndex = phase.templates.indexOf(tmpl)
          // Assign each template to alternating training days
          const assignedDays = trainingDays.filter((_, idx) => idx % phase.templates.length === templateIndex)
          for (const day of assignedDays) {
            const DAY_MAP: Record<string, number> = {
              sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
              thursday: 4, friday: 5, saturday: 6,
            }
            await this.db.insert(schema.workoutSchedules).values({
              id: randomUUID(),
              userId,
              templateId,
              type: 'weekly',
              scheduledDate: null,
              dayOfWeek: DAY_MAP[day] ?? 1,
              createdAt: now,
            })
          }
        }
      }
    }

    return this.getActiveProgram(userId)
  }

  async getActiveProgram(userId: string) {
    const [program] = await this.db
      .select()
      .from(schema.programs)
      .where(and(eq(schema.programs.userId, userId), eq(schema.programs.status, 'active')))
      .limit(1)

    if (!program) return null

    const phases = await this.db
      .select()
      .from(schema.programPhases)
      .where(eq(schema.programPhases.programId, program.id))
      .orderBy(schema.programPhases.orderIndex)

    const phasesWithTemplates = await Promise.all(
      phases.map(async phase => ({
        ...phase,
        templates: await this.db
          .select()
          .from(schema.programPhaseTemplates)
          .where(eq(schema.programPhaseTemplates.phaseId, phase.id)),
      })),
    )

    const [pendingUpdate] = await this.db
      .select()
      .from(schema.programUpdates)
      .where(and(eq(schema.programUpdates.programId, program.id), eq(schema.programUpdates.status, 'pending')))
      .orderBy(desc(schema.programUpdates.createdAt))
      .limit(1)

    return {
      ...program,
      phases: phasesWithTemplates,
      pendingUpdate: pendingUpdate
        ? { ...pendingUpdate, evidence: JSON.parse(pendingUpdate.evidence) as string[] }
        : null,
    }
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/api && npx vitest run src/program/program.service.spec.ts
```

Expected: all tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/program/
git commit -m "feat: add ProgramService with generation, Gemini call, and program persistence"
```

---

### Task 4: ProgramService — adaptation evaluation

This extends `program.service.ts` with `evaluateAfterSession` (called fire-and-forget from `WorkoutsService.finishSession`) and `evaluateNow` (manual trigger).

- [ ] **Step 1: Add adaptation tests to `program.service.spec.ts`**

```typescript
describe('ProgramService.buildAdaptationPrompt', () => {
  it('includes current phase type, session count, and performance signals', () => {
    const svc = new ProgramService(mockDb as any, mockConfig as any, mockCoaching as any)
    const prompt = svc.buildAdaptationPrompt(
      {
        id: 'phase-1',
        name: 'Building Your Base',
        type: 'accumulation',
        targetSessionCount: 24,
        completedSessionCount: 20,
        splitType: 'full_body',
        rationale: '',
        orderIndex: 0,
        status: 'active',
        programId: 'prog-1',
        templates: [],
      },
      {
        volumePlateau: true,
        averageRpe: 9.1,
        consecutiveWeeksSinceProgress: 3,
        isLastPhase: false,
      },
      ['Volume plateau means MRV is breached.'],
    )
    expect(prompt).toContain('accumulation')
    expect(prompt).toContain('20')
    expect(prompt).toContain('24')
    expect(prompt).toContain('RPE')
    expect(prompt).toContain('Volume plateau means MRV is breached.')
  })
})
```

- [ ] **Step 2: Implement adaptation methods**

Add these methods to `ProgramService`:

```typescript
async evaluateAfterSession(sessionId: string, userId: string) {
  try {
    await this.runAdaptationEvaluation(userId, sessionId)
  } catch (err) {
    this.logger.warn(`Program adaptation evaluation failed for session ${sessionId}`, err)
  }
}

async evaluateNow(userId: string) {
  return this.runAdaptationEvaluation(userId, null)
}

private async runAdaptationEvaluation(userId: string, sessionId: string | null) {
  const program = await this.getActiveProgram(userId)
  if (!program) return

  // Already has a pending update — don't stack another
  if (program.pendingUpdate) return

  const activePhase = program.phases.find(p => p.status === 'active')
  if (!activePhase) return

  // Increment completed session count if this session belongs to this phase
  if (sessionId) {
    const [session] = await this.db
      .select()
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, sessionId), eq(schema.workoutSessions.programPhaseId, activePhase.id)))
      .limit(1)

    if (session) {
      await this.db
        .update(schema.programPhases)
        .set({ completedSessionCount: activePhase.completedSessionCount + 1 })
        .where(eq(schema.programPhases.id, activePhase.id))
      activePhase.completedSessionCount += 1
    }
  }

  // Compute performance signals
  const signals = await this.computePerformanceSignals(userId, activePhase)
  const isLastPhase = activePhase.orderIndex === program.phases.length - 1
  const phaseComplete = activePhase.completedSessionCount >= activePhase.targetSessionCount

  // Determine if an update is warranted
  const needsUpdate =
    phaseComplete ||
    signals.volumePlateau ||
    (signals.averageRpe >= 9 && signals.consecutiveWeeksSinceProgress >= 2)

  if (!needsUpdate) return

  // Build prompt and call Gemini for adaptation decision
  const situationSummary = `${activePhase.type} phase, ${activePhase.completedSessionCount}/${activePhase.targetSessionCount} sessions done, RPE avg ${signals.averageRpe}, plateau: ${signals.volumePlateau}`
  let coachingChunks: string[] = []
  try {
    coachingChunks = await this.coachingKnowledge.retrieveForSituation(situationSummary)
  } catch { /* proceed without */ }

  const prompt = this.buildAdaptationPrompt(activePhase, { ...signals, isLastPhase }, coachingChunks)
  const raw = await this.callGemini(prompt)
  await this.persistProgramUpdate(program.id, raw)
}

buildAdaptationPrompt(
  phase: { id: string; name: string; type: string; targetSessionCount: number; completedSessionCount: number; splitType: string; rationale: string; orderIndex: number; status: string; programId: string; templates: unknown[] },
  signals: { volumePlateau: boolean; averageRpe: number; consecutiveWeeksSinceProgress: number; isLastPhase: boolean },
  coachingChunks: string[],
): string {
  const coachingSection = coachingChunks.length > 0
    ? `COACHING PRINCIPLES:\n${coachingChunks.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n`
    : ''

  return [
    'You are a certified strength coach evaluating whether a user\'s training program phase needs adjustment.',
    '',
    coachingSection,
    'CURRENT PHASE:',
    `Name: ${phase.name}`,
    `Type: ${phase.type}`,
    `Split: ${phase.splitType}`,
    `Progress: ${phase.completedSessionCount} of ${phase.targetSessionCount} sessions completed`,
    `Volume plateau detected: ${signals.volumePlateau}`,
    `Average RPE last 2 weeks: ${signals.averageRpe}`,
    `Consecutive weeks without load progress: ${signals.consecutiveWeeksSinceProgress}`,
    `This is the last phase: ${signals.isLastPhase}`,
    '',
    'Decide ONE of the following actions (or "none" if no change needed):',
    '- "phase_transition": move to the next phase',
    '- "exercise_swap": replace a stalled exercise with a variation',
    '- "deload": reduce volume 40-50% for one week then continue',
    '- "phase_extension": add sessions to the current phase',
    '- "none": no change needed',
    '',
    'Return ONLY valid JSON:',
    JSON.stringify({
      action: 'phase_transition | exercise_swap | deload | phase_extension | none',
      description: '1-sentence user-facing summary of what is changing',
      reason: 'Coaching rationale (2-3 sentences)',
      evidence: ['specific signal 1', 'specific signal 2'],
      proposedChanges: { note: 'action-specific payload — phase_transition: {}, exercise_swap: { exerciseId, replacementExerciseId }, deload: {}, phase_extension: { additionalSessions: 6 }' },
    }, null, 2),
  ].join('\n')
}

private async computePerformanceSignals(userId: string, phase: { id: string }) {
  // Volume plateau: check if weekly volume load for any exercise in the phase has been flat 3+ weeks
  // Simplified: check if any progression suggestion was unchanged for 3+ sessions
  // RPE average: average RPE of done sets in last 2 weeks for phase sessions
  // This is intentionally simplified — the full implementation can use the progression signal data

  const twoWeeksAgo = Math.floor(Date.now() / 1000) - 14 * 24 * 3600

  const recentSets = await this.db
    .select({ rpe: schema.sets.rpe })
    .from(schema.sets)
    .innerJoin(schema.workoutSessions, eq(schema.workoutSessions.id, schema.sets.sessionId))
    .where(
      and(
        eq(schema.workoutSessions.userId, userId),
        eq(schema.workoutSessions.programPhaseId, phase.id),
        eq(schema.sets.done, 1),
      ),
    )

  const rpeSets = recentSets.filter(s => s.rpe !== null)
  const averageRpe = rpeSets.length > 0
    ? rpeSets.reduce((sum, s) => sum + (s.rpe ?? 0), 0) / rpeSets.length
    : 0

  return {
    volumePlateau: false, // TODO: implement full plateau detection using weekly volume queries
    averageRpe: Math.round(averageRpe * 10) / 10,
    consecutiveWeeksSinceProgress: 0, // TODO: implement
  }
}

private async persistProgramUpdate(programId: string, raw: unknown) {
  const obj = raw as Record<string, unknown>
  if (!obj || obj.action === 'none') return

  await this.db.insert(schema.programUpdates).values({
    id: randomUUID(),
    programId,
    type: obj.action as string,
    description: obj.description as string ?? '',
    reason: obj.reason as string ?? '',
    evidence: JSON.stringify(obj.evidence ?? []),
    proposedChanges: JSON.stringify(obj.proposedChanges ?? {}),
    status: 'pending',
    createdAt: Math.floor(Date.now() / 1000),
  })
}

async acknowledgeProgramUpdate(updateId: string, userId: string, action: 'accept' | 'dismiss') {
  const [update] = await this.db
    .select()
    .from(schema.programUpdates)
    .innerJoin(schema.programs, eq(schema.programs.id, schema.programUpdates.programId))
    .where(
      and(
        eq(schema.programUpdates.id, updateId),
        eq(schema.programs.userId, userId),
        eq(schema.programUpdates.status, 'pending'),
      ),
    )
    .limit(1)

  if (!update) throw new BadRequestException('Update not found or already acknowledged')

  await this.db
    .update(schema.programUpdates)
    .set({ status: action === 'accept' ? 'accepted' : 'dismissed' })
    .where(eq(schema.programUpdates.id, updateId))

  if (action === 'accept') {
    await this.applyProgramUpdate(update.program_updates, update.programs)
  }
}

private async applyProgramUpdate(update: typeof schema.programUpdates.$inferSelect, program: typeof schema.programs.$inferSelect) {
  const changes = JSON.parse(update.proposedChanges) as Record<string, unknown>

  if (update.type === 'phase_transition') {
    // Mark current active phase complete, activate next phase
    const phases = await this.db
      .select()
      .from(schema.programPhases)
      .where(eq(schema.programPhases.programId, program.id))
      .orderBy(schema.programPhases.orderIndex)

    const activePhase = phases.find(p => p.status === 'active')
    const nextPhase = activePhase ? phases.find(p => p.orderIndex === activePhase.orderIndex + 1) : null

    if (activePhase) {
      await this.db
        .update(schema.programPhases)
        .set({ status: 'completed' })
        .where(eq(schema.programPhases.id, activePhase.id))
    }

    if (nextPhase) {
      await this.db
        .update(schema.programPhases)
        .set({ status: 'active' })
        .where(eq(schema.programPhases.id, nextPhase.id))

      // Update schedules to point to next phase templates
      const nextTemplates = await this.db
        .select()
        .from(schema.programPhaseTemplates)
        .where(eq(schema.programPhaseTemplates.phaseId, nextPhase.id))

      await this.db
        .delete(schema.workoutSchedules)
        .where(and(eq(schema.workoutSchedules.userId, program.userId), eq(schema.workoutSchedules.type, 'weekly')))

      // Re-create schedules for new phase — use same days from user profile
      const [profile] = await this.db
        .select()
        .from(schema.userProfiles)
        .where(eq(schema.userProfiles.userId, program.userId))
        .limit(1)

      if (profile?.trainingDays) {
        const days = JSON.parse(profile.trainingDays) as string[]
        const DAY_MAP: Record<string, number> = {
          sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
          thursday: 4, friday: 5, saturday: 6,
        }
        const now = Math.floor(Date.now() / 1000)
        for (let i = 0; i < days.length; i++) {
          const template = nextTemplates[i % nextTemplates.length]
          if (template) {
            await this.db.insert(schema.workoutSchedules).values({
              id: randomUUID(),
              userId: program.userId,
              templateId: template.templateId,
              type: 'weekly',
              scheduledDate: null,
              dayOfWeek: DAY_MAP[days[i]] ?? 1,
              createdAt: now,
            })
          }
        }
      }
    } else {
      // All phases complete
      await this.db
        .update(schema.programs)
        .set({ status: 'completed' })
        .where(eq(schema.programs.id, program.id))
    }
  }

  if (update.type === 'phase_extension') {
    const additionalSessions = Number(changes.additionalSessions ?? 6)
    const activePhase = await this.db
      .select()
      .from(schema.programPhases)
      .where(and(eq(schema.programPhases.programId, program.id), eq(schema.programPhases.status, 'active')))
      .limit(1)
    if (activePhase[0]) {
      await this.db
        .update(schema.programPhases)
        .set({ targetSessionCount: activePhase[0].targetSessionCount + additionalSessions })
        .where(eq(schema.programPhases.id, activePhase[0].id))
    }
  }

  // exercise_swap and deload: TODO — requires template exercise mutation and deload template creation
}
```

- [ ] **Step 3: Run all program tests**

```bash
cd apps/api && npx vitest run src/program/
```

Expected: all pass.

- [ ] **Step 4: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/program/program.service.ts apps/api/src/program/program.service.spec.ts
git commit -m "feat: add ProgramService adaptation evaluation — evaluateAfterSession + evaluateNow + acknowledgeProgramUpdate"
```

---

### Task 5: ProgramController + ProgramModule

**Files:**
- Create: `apps/api/src/program/program.controller.ts`
- Create: `apps/api/src/program/program.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/workouts/workouts.service.ts`
- Modify: `apps/api/src/workouts/workouts.module.ts`

- [ ] **Step 1: Create controller**

```typescript
// apps/api/src/program/program.controller.ts
import { Controller, Get, Post, Param, Body, Req } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { AcknowledgeProgramUpdateSchema } from '@gymtracker/shared'
import { ProgramService } from './program.service'
import { AuthenticatedRequest } from '../auth/request.types'

class AcknowledgeDto extends createZodDto(AcknowledgeProgramUpdateSchema) {}

@Controller('program')
export class ProgramController {
  constructor(private readonly svc: ProgramService) {}

  @Get()
  getActiveProgram(@Req() req: AuthenticatedRequest) {
    return this.svc.getActiveProgram(req.user.id)
  }

  @Post('generate')
  generateProgram(@Req() req: AuthenticatedRequest) {
    return this.svc.generateProgram(req.user.id)
  }

  @Post('evaluate')
  evaluateNow(@Req() req: AuthenticatedRequest) {
    return this.svc.evaluateNow(req.user.id)
  }

  @Post('updates/:id/acknowledge')
  acknowledgeUpdate(
    @Param('id') id: string,
    @Body() dto: AcknowledgeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.acknowledgeProgramUpdate(id, req.user.id, dto.action)
  }
}
```

- [ ] **Step 2: Create module**

```typescript
// apps/api/src/program/program.module.ts
import { Module } from '@nestjs/common'
import { ProgressionModule } from '../progression/progression.module'
import { ProgramController } from './program.controller'
import { ProgramService } from './program.service'

@Module({
  imports: [ProgressionModule],
  controllers: [ProgramController],
  providers: [ProgramService],
  exports: [ProgramService],
})
export class ProgramModule {}
```

Note: `ProgressionModule` must export `CoachingKnowledgeService`. Check `progression.module.ts` and add it to `exports` if missing.

- [ ] **Step 3: Wire into AppModule**

In `app.module.ts`, add `ProgramModule` to the imports array.

- [ ] **Step 4: Fire evaluation on Session finish in WorkoutsService**

In `apps/api/src/workouts/workouts.service.ts`, inject `ProgramService` and add the fire-and-forget call in `finishSession`:

```typescript
// After the existing progressionService.generateForSession call:
this.programService.evaluateAfterSession(id, userId).catch(err => {
  this.logger.error(`Program adaptation evaluation failed for session ${id}`, err)
})
```

Also tag the session with `programPhaseId` when starting from a Program Schedule:

In `startSession`, after creating the session, look up if the template belongs to an active program phase and set `programPhaseId`:

```typescript
// After session insert, before return:
if (dto.templateId) {
  const [phaseTemplate] = await this.db
    .select({ phaseId: schema.programPhaseTemplates.phaseId })
    .from(schema.programPhaseTemplates)
    .where(eq(schema.programPhaseTemplates.templateId, dto.templateId))
    .limit(1)

  if (phaseTemplate) {
    await this.db
      .update(schema.workoutSessions)
      .set({ programPhaseId: phaseTemplate.phaseId })
      .where(eq(schema.workoutSessions.id, id))
  }
}
```

- [ ] **Step 5: Export CoachingKnowledgeService from ProgressionModule**

In `apps/api/src/progression/progression.module.ts`, ensure:

```typescript
exports: [ProgressionService, CoachingKnowledgeService],
```

- [ ] **Step 6: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 7: Smoke test — generate a program**

Start the API and call:
```bash
curl -s -X POST http://localhost:3000/program/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>"
```

Expected: JSON with program name + phases + templates.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/program/ apps/api/src/workouts/ apps/api/src/app.module.ts apps/api/src/progression/progression.module.ts
git commit -m "feat: add ProgramController and wire program evaluation into session finish"
```

---

### Task 6: Frontend — Onboarding + Profile settings

**Files:**
- Create: `apps/web/src/pages/OnboardingPage.tsx`
- Modify: `apps/web/src/pages/ProfilePage.tsx` (or wherever profile is edited)

The onboarding form captures: `experienceLevel`, `goal`, `trainingDays`, `sessionDurationMinutes`. It is shown to new users (no profile row yet) on first launch.

- [ ] **Step 1: Add API client for User Profile update**

In `apps/web/src/api/profile.ts` (or equivalent), add the new fields to the update payload type and ensure `trainingDays` is serialized as JSON.

- [ ] **Step 2: Build OnboardingPage**

A multi-step form:
1. Step 1: Experience level (beginner / intermediate / advanced) — radio cards
2. Step 2: Goal (hypertrophy / strength / powerlifting / general) — radio cards
3. Step 3: Training days — day-of-week checkboxes (Mon–Sun), must select 2–6
4. Step 4: Session duration — slider or segmented control (30 / 45 / 60 / 75 / 90 min)
5. Submit → PATCH `/profile` → redirect to Program creation prompt

- [ ] **Step 3: Gate app behind onboarding**

In the root layout or app entry, check if profile has `trainingDays`. If not, redirect to `/onboarding`. After completing onboarding, redirect to `/program/new`.

- [ ] **Step 4: Add training days + session duration to Profile Settings**

In the existing Settings/Profile page, add the two new fields so the user can update them later.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/
git commit -m "feat: add onboarding flow capturing experience, goal, training days, session duration"
```

---

### Task 7: Frontend — Program view + Program Update acknowledgment

**Files:**
- Create: `apps/web/src/api/program.ts`
- Create: `apps/web/src/pages/ProgramPage.tsx`

- [ ] **Step 1: Add API client functions**

```typescript
// apps/web/src/api/program.ts
export const getActiveProgram = () => api.get('/program')
export const generateProgram = () => api.post('/program/generate')
export const evaluateProgram = () => api.post('/program/evaluate')
export const acknowledgeProgramUpdate = (id: string, action: 'accept' | 'dismiss') =>
  api.post(`/program/updates/${id}/acknowledge`, { action })
```

- [ ] **Step 2: Build ProgramPage**

Sections:
1. **If no program**: "You don't have a Program yet. [Generate my Program]" button.
2. **If program active**:
   - Program name + overall progress (current phase / total phases)
   - Current Phase card: name, type badge, rationale, session progress bar (`completedSessionCount / targetSessionCount`)
   - Upcoming phases: list of pending phase names
   - If `pendingUpdate` exists: **Program Update card** (prominent, cannot be dismissed by scrolling past)
     - Icon + type badge (e.g. "Phase Transition", "Deload")
     - Description (1 sentence)
     - Reason (coaching rationale)
     - Evidence list (bullet points with specific numbers)
     - [Accept] [Not yet] buttons
3. **"Re-evaluate my program"** button → calls `/program/evaluate` → shows loading → refreshes

- [ ] **Step 3: Program Update card — what the user sees**

Example for `phase_transition`:
```
🎯 Ready to move on
"Your Foundation phase is complete — you've finished 24 sessions."
Because: Beginners who complete their accumulation block need a strength realization phase...
Evidence:
• 24/24 target sessions completed
• Average RPE dropped from 8.2 to 6.8 in the last 4 sessions (load is manageable)
[Move to Strength Phase]  [Stay in Foundation]
```

- [ ] **Step 4: Add "Program" nav item**

Add Program to the main navigation so the user can reach the Program view.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/
git commit -m "feat: add ProgramPage with phase progress, pending update acknowledgment, and re-evaluate trigger"
```

---

### Task 8: End-to-end smoke test

No code changes — validate the full flow.

- [ ] **Step 1: Fresh user flow**
  1. Create a new user account
  2. App shows onboarding → fill in: beginner, hypertrophy, Mon/Wed/Fri, 60 min
  3. Profile saved — redirect to Program creation prompt
  4. Tap "Generate my Program"
  5. Expected: program created with 2 phases, 2 templates (Full Body A/B), schedules created for Mon/Wed/Fri

- [ ] **Step 2: Verify schedules in DB**

```bash
psql gymtracker -c "SELECT ws.type, ws.day_of_week, wt.name FROM workout_schedules ws JOIN workout_templates wt ON wt.id = ws.template_id WHERE ws.user_id = '<USER_ID>';"
```

Expected: 3 rows — Mon→Full Body A, Wed→Full Body B, Fri→Full Body A (alternating).

- [ ] **Step 3: Verify program in DB**

```bash
psql gymtracker -c "SELECT p.name, pp.name, pp.type, pp.status, pp.target_session_count FROM programs p JOIN program_phases pp ON pp.program_id = p.id WHERE p.user_id = '<USER_ID>';"
```

Expected: 2 rows — Phase 1 `active`, Phase 2 `pending`.

- [ ] **Step 4: Simulate session completion + adaptation**
  1. Start a session from Mon schedule, mark sets as done, finish
  2. Logs should show: `[ProgramService] Evaluating program adaptation for user <id>`
  3. `GET /program` — `completedSessionCount` on Phase 1 incremented to 1
  4. No `pendingUpdate` yet (not enough signals)

- [ ] **Step 5: Verify Program Update flow**
  1. Manually call `POST /program/evaluate`
  2. If not enough signal: response is empty / no update created
  3. Artificially set `completed_session_count = target_session_count` in DB, then re-evaluate
  4. Expected: `pendingUpdate` with `type: phase_transition` appears in `GET /program`
  5. Call `POST /program/updates/:id/acknowledge` with `{ action: "accept" }`
  6. Expected: Phase 1 status → `completed`, Phase 2 status → `active`, Schedules updated to Phase 2 Templates
