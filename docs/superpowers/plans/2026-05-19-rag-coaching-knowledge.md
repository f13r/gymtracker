# RAG Coaching Knowledge for Progression Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Augment Gemini's Progression Suggestions with retrieved strength-training coaching principles so that suggestions are grounded in evidence-based programming rules, not just Gemini's general knowledge.

**Architecture:** A new `CoachingKnowledgeService` (inside the existing `ProgressionModule`) owns 20 static coaching principle chunks, embeds them via Gemini `text-embedding-004` at startup (seeds the DB if empty), and retrieves the 3 most relevant chunks via cosine similarity against a plain-text summary of the user's current training situation. The 3 chunks are injected into `buildPrompt` as a `COACHING PRINCIPLES` section before the exercise data. `ProgressionService` builds the situation summary string and delegates embedding/retrieval to `CoachingKnowledgeService`.

**Tech Stack:** NestJS, Drizzle ORM (PostgreSQL + pgvector extension), Gemini `text-embedding-004` (new), Gemini 2.5 Flash (existing), Vitest

---

## New data requirements (vs. original plan)

The 20 richer chunks from the research document require data the app does not currently track. This section catalogues every gap and how to fill it.

### Ask the user — profile additions

Two new optional fields on the user profile form:

| Field | Values | Needed for |
|---|---|---|
| `goal` | `hypertrophy \| strength \| powerlifting \| general` | Chunks: competition-lift-specificity, rpe-rir-calibration, phase-potentiation |
| `trainingPhase` | `accumulation \| strength \| peaking \| maintenance` | Chunks: helms-rpe-stop-logic, phase-potentiation, mev-initialization |

These are added to the `userProfiles` table (same migration as pgvector).

### App computes automatically — new ExerciseContext fields

Five additional queries in `buildExerciseContext`:

| New field | What it is | Needed for |
|---|---|---|
| `sessionCount` | Distinct finished sessions with ≥1 done set for this exercise | data-sparsity-calibration |
| `lastTwoSessions` | `{ weightKg, reps }[]` — last 2 prior sessions' top working sets | two-for-two-rule |
| `categoryWeeklySetCount` | Avg done sets/week for exercises sharing the same `category`, last 4 weeks | mev-initialization, mav-trajectory, mrv-breach-detection |
| `hoursSinceCategorySession` | Hours elapsed since any session containing an exercise in same category | recovery-frequency-constraint |
| `consecutiveWeeksActive` | Consecutive calendar weeks this exercise appeared with ≥1 done set | adaptive-resistance-variation |

### Not tracked yet — acknowledged limitations in prompt

These principles still ship as chunks. Gemini applies them conditionally; the prompt notes when data is unavailable.

| Chunk | Missing data | Graceful fallback |
|---|---|---|
| `daily-readiness-load-displacement` | HRV / wearable data | Check if warm-up RPE notably exceeds baseline; note "no HRV available" |
| `form-degradation-response` | CV form scores | Triggered only if user notes pain/breakdown in session notes |
| `weak-point-diagnostics` | Explicit failure-point log | Triggered only if user describes failure pattern in session notes |

---

## File Map

**Create:**
- `apps/api/src/progression/coaching-knowledge.ts` — 20 coaching principle chunks (research-doc quality)
- `apps/api/src/progression/coaching-knowledge.service.ts` — seeding, embedding, cosine retrieval
- `apps/api/src/progression/coaching-knowledge.service.spec.ts` — unit tests for embedText and retrieval

**Modify:**
- `apps/api/src/drizzle/schema.ts` — add `vector` customType + `coachingKnowledge` table + `goal`/`trainingPhase` on `userProfiles`
- `apps/api/src/progression/progression.module.ts` — register `CoachingKnowledgeService`
- `apps/api/src/progression/progression.service.ts` — expand `ExerciseContext` + `getUserContext`, inject `CoachingKnowledgeService`, add `buildSituationSummary`, update `buildPrompt`
- `apps/api/src/progression/progression.service.spec.ts` — update fixtures + add tests for new fields and `buildSituationSummary`

**Generate (via drizzle-kit):**
- `apps/api/src/drizzle/migrations/0005_coaching_knowledge.sql` — then manually prepend `CREATE EXTENSION IF NOT EXISTS vector;`

---

### Task 1: Schema — pgvector + `coachingKnowledge` table + `userProfiles` extensions + migration

**Files:**
- Modify: `apps/api/src/drizzle/schema.ts`
- Generate: `apps/api/src/drizzle/migrations/0005_*.sql`

- [ ] **Step 1: Add `vector` customType, `coachingKnowledge` table, and extend `userProfiles`**

Add `customType` to the existing import at the top of `apps/api/src/drizzle/schema.ts`:

```typescript
import { pgTable, text, integer, real, primaryKey, uniqueIndex, customType } from 'drizzle-orm/pg-core'
```

Add the `vector` customType factory and `coachingKnowledge` table at the end of the file:

```typescript
const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() { return `vector(${dimensions})` },
    toDriver(value: number[]): string { return `[${value.join(',')}]` },
    fromDriver(value: string): number[] { return value.slice(1, -1).split(',').map(Number) },
  })(name)

export const coachingKnowledge = pgTable('coaching_knowledge', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', 768).notNull(),
})
```

Extend `userProfiles` with the two new optional fields:

```typescript
export const userProfiles = pgTable('user_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id),
  age: integer('age'),
  heightCm: integer('height_cm'),
  experienceLevel: text('experience_level'), // 'beginner' | 'intermediate' | 'advanced'
  goal: text('goal'),                         // 'hypertrophy' | 'strength' | 'powerlifting' | 'general'
  trainingPhase: text('training_phase'),       // 'accumulation' | 'strength' | 'peaking' | 'maintenance'
  updatedAt: integer('updated_at').notNull(),
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

Expected: a new file `apps/api/src/drizzle/migrations/0005_*.sql` containing `CREATE TABLE coaching_knowledge` and `ALTER TABLE user_profiles ADD COLUMN goal` and `ADD COLUMN training_phase`.

- [ ] **Step 4: Manually prepend pgvector extension creation to the generated migration**

Open the generated `0005_*.sql` file and add this as the very first line:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

- [ ] **Step 5: Apply migration**

```bash
cd apps/api && npx drizzle-kit migrate
```

Expected: migration applied successfully.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/drizzle/schema.ts apps/api/src/drizzle/migrations/
git commit -m "feat: add coaching_knowledge table with pgvector support and goal/trainingPhase to user profiles"
```

---

### Task 2: Static coaching knowledge content (20 research-grade chunks)

**Files:**
- Create: `apps/api/src/progression/coaching-knowledge.ts`

No tests needed — this is pure static content.

- [ ] **Step 1: Create the file with 20 coaching principle chunks**

These replace the original 20 simple chunks with research-doc quality content across 6 categories.

```typescript
// apps/api/src/progression/coaching-knowledge.ts

export type CoachingChunk = {
  id: string
  category: string
  content: string
}

export const COACHING_CHUNKS: CoachingChunk[] = [
  // ─── Category 1: Progression Protocols by Training Age ───────────────────────
  {
    id: 'novice-linear-progression',
    category: 'progression',
    content: 'Novice lifters (< 6 months training, experience_level: beginner) adapt session-to-session due to rapid neuromuscular adaptation. If all reps were completed at RPE below 9, mandate a direct weight increase for the very next session: +2.5 kg for upper-body compounds (bench press, overhead press, rows, pull-ups), +5 kg for lower-body compounds (squat, deadlift, leg press). Do not suggest undulating periodization or set/rep manipulation for novices — enforce uninterrupted linear progression to fully exploit the novice adaptation window.',
  },
  {
    id: 'two-for-two-rule',
    category: 'progression',
    content: 'Apply the Two-for-Two overload rule: examine the last two sessions for this exercise. If the user completed reps at or above the top of their target rep range in BOTH sessions (e.g., 12+ reps when target is 8–12), command a load increase of 2.5–5% of total cumulative load. If reps are within the target range in either session, maintain current weight. This rule prevents premature increments that lead to form breakdown and connective tissue stress.',
  },
  {
    id: 'intermediate-undulating-progression',
    category: 'progression',
    content: 'Intermediate lifters (6–24 months training, experience_level: intermediate) exhaust session-to-session linear gains. Approve a weight increase only if total weekly volume load (sets × reps × weight) exceeded the prior week AND average session RPE was below 8. If those conditions are NOT met, do not stagnate — suggest adding one extra working set OR reducing rest intervals by 30 seconds to maintain progressive overload via metabolic stress without adding absolute load.',
  },
  {
    id: 'advanced-step-loading',
    category: 'progression',
    content: 'Advanced lifters (> 24 months training, experience_level: advanced) operate near their genetic ceiling. Weekly weight increases are explicitly prohibited. Enforce step-loading: have the user hold the same load for multiple sessions until the effort feels manageable (RPE drops from 8 to 6–7 at the same weight), then authorize a micro-increment of 1–2.5 kg. When current load is within 5 kg of the user\'s personal record, restrict any increment to 1–2.5 kg maximum — aggressive jumps near PR carry exponentially higher connective tissue injury risk.',
  },

  // ─── Category 2: Volume Landmark Navigation (MEV / MAV / MRV) ────────────────
  {
    id: 'mev-initialization',
    category: 'volume',
    content: 'At the start of a hypertrophy block or accumulation phase, anchor weekly set volume at the Minimum Effective Volume (MEV) for the target muscle group. MEV baselines: quadriceps 6–8 sets/week, hamstrings 4–6 sets/week, chest/push category 6–8 sets/week, back/pull category 8–10 sets/week, anterior deltoids 0 direct sets (incidental volume from heavy pressing is sufficient). Initializing at MEV guarantees a sufficient runway to escalate volume across the mesocycle before hitting MRV. Never start a block at or near MRV.',
  },
  {
    id: 'mav-trajectory',
    category: 'volume',
    content: 'Once past the first training week and while average session RPE remains below 8 with a positive performance slope, escalate total weekly sets per muscle category by 1–2 sets each microcycle, navigating through the Maximum Adaptive Volume (MAV) bandwidth. Prioritize adding sets to exercises where the user\'s RPE was lowest in the prior week — this indicates the highest localized recovery capacity. Do not increase absolute weight when adding volume sets; metabolic stress from added sets is the overload mechanism at this stage.',
  },
  {
    id: 'mrv-breach-detection',
    category: 'volume',
    content: 'The Maximum Recoverable Volume (MRV) is breached when all of the following occur: (1) weekly volume load for a muscle category is flat or declining across 2+ consecutive weeks, (2) average RPE for that category has spiked to 9 or above, (3) repetition counts are falling below the prior week across multiple exercises in the same category. When these conditions coincide, immediately halt all volume progression and mandate a reduction in sets for that muscle group. Do not increase weight or volume when MRV signals are present.',
  },
  {
    id: 'data-sparsity-calibration',
    category: 'progression',
    content: 'When an exercise has fewer than 3 completed sessions in the database, the system is in calibration mode. Restrict progression suggestions to a maximum 2–3% weight increase (rounded to nearest 2.5 kg). Include "Insufficient history — system is calibrating this exercise baseline" in the evidence array. Do not suggest complex set/rep manipulations during calibration. Conservative loading during the calibration phase prevents ingraining flawed motor patterns before a baseline is established.',
  },

  // ─── Category 3: Advanced Autoregulation ─────────────────────────────────────
  {
    id: 'rpe-rir-calibration',
    category: 'autoregulation',
    content: 'For hypertrophy goals, target set termination at RPE 7–8 (2–3 reps left in reserve). RPE 8 is the exact repetition where bar speed noticeably and involuntarily decelerates — teach users to use this as an objective proxy. Explicitly warn that training to absolute failure (RPE 10) is counterproductive for hypertrophy: it amplifies CNS fatigue, degrades performance on all subsequent sets, and provides no additional hypertrophic benefit beyond RPE 8–9. If RPE data is missing from sets, note this in evidence and recommend the user begin logging RPE.',
  },
  {
    id: 'helms-rpe-stop-logic',
    category: 'autoregulation',
    content: 'During strength or peaking phases, after the user logs a heavy top set, prescribe autoregulated back-off sets using RPE Stop Logic: reduce load by 4–6% from the top set weight, then instruct the user to continue performing sets of the same rep count until perceived exertion returns to match the top set\'s RPE. Do not prescribe a fixed number of back-off sets for strength phases — RPE determines volume. On high-readiness days the user accumulates 4–6 back-off sets; on fatigued days only 1–2. This is the optimal intra-session volume autoregulation mechanism.',
  },
  {
    id: 'daily-readiness-load-displacement',
    category: 'autoregulation',
    content: 'If warm-up set RPE is notably higher than expected for the same load (e.g., a weight that normally feels like RPE 5 now feels like RPE 7+), the user\'s CNS readiness is compromised. Displace the absolute load downward until effort aligns with the originally prescribed submaximal RPE, while maintaining the target rep range. Do not push through with the planned heavy load on low-readiness days — this protects connective tissue and prevents overreaching. Note the readiness displacement in the evidence. If HRV data is unavailable, use the warm-up RPE delta as the readiness proxy.',
  },
  {
    id: 'recovery-frequency-constraint',
    category: 'autoregulation',
    content: 'Muscle protein synthesis remains elevated for 48–72 hours post-session. If the same exercise or muscle category was trained fewer than 48 hours ago in a prior session, do not recommend aggressive weight increases for the current session. Instead, suggest redirecting volume to a fully recovered muscle group or enforcing a moderate load reduction for the under-recovered group. Prioritize recovery over intensity when intra-week training frequency is high. High-frequency training is only beneficial when recovery is adequately managed.',
  },

  // ─── Category 4: Fatigue Management and Deload Triggers ──────────────────────
  {
    id: 'volume-plateau-deload',
    category: 'deload',
    content: 'If weekly volume load for an exercise or muscle category shows zero increase across 3 or more consecutive weeks, the user is in functional overreaching and requires a deload. Prescribe: maintain absolute weight on the bar (critical — to preserve neurological adaptations and heavy load familiarity), reduce total sets by 40–50%, pull target reps back by 2–3 per set. Alternatively, prescribe a flat 10% weight reduction across all exercises for one week. Clearly communicate that fatigue masks fitness — the deload is a biological prerequisite for the next performance breakthrough, not a regression.',
  },
  {
    id: 'rep-range-sticking-point',
    category: 'deload',
    content: 'If a user has stalled at the same absolute weight for more than 2 sessions but the stall has lasted fewer than 3 weeks (below the deload threshold), prescribe rep range expansion before attempting further weight increases. Example: if stuck at 80 kg × 8 reps, instruct the user to push for 80 kg × 10 reps across 1–2 sessions. Only after the expanded rep target is successfully achieved does the system authorize a weight increment. This micro-progression strategy builds a physiological bridge to the next load level without dangerous ego-driven max-out attempts.',
  },
  {
    id: 'density-metabolic-overload',
    category: 'deload',
    content: 'Progressive overload does not require adding weight. When equipment is limited, load is near the user\'s PR, or absolute weight cannot be increased, prescribe density-based overload: maintain the same weight and sets but reduce rest intervals from 90 seconds to 60 or 45 seconds. Increased metabolic stress and hypoxia from compressed rest drives the hypertrophic cascade independently of absolute tension. This provides an alternative overload pathway for home-gym users, hotel gyms, or any scenario where micro-loading plates are unavailable.',
  },

  // ─── Category 5: Exercise Selection and Specificity ───────────────────────────
  {
    id: 'form-degradation-response',
    category: 'specificity',
    content: 'If the user notes form breakdown, joint pain, or a significant RPE spike suggesting technique failure, immediately halt weight progression regardless of volume metrics. Prescribe a load regression until form normalizes. If the issue persists across multiple sessions, suggest swapping the barbell compound for a stable machine equivalent that isolates the target musculature without the stability demand (e.g., barbell squat → hack squat, barbell bench → machine chest press). Do not resume weight increases until the user confirms form is restored.',
  },
  {
    id: 'adaptive-resistance-variation',
    category: 'specificity',
    content: 'If an exercise has been performed without variation for more than 8 consecutive weeks AND the weekly progression rate has fallen below 1% per week, adaptive resistance has set in. Prescribe a strategic rotation to a functionally related variation that changes the force vector and recruits different regional motor units: barbell back squat → safety bar squat or front squat; barbell bench → close-grip bench or incline press; conventional deadlift → Romanian deadlift or trap bar. The variation must target the same primary mover — random substitution destroys the long-term overload trajectory.',
  },
  {
    id: 'competition-lift-specificity',
    category: 'specificity',
    content: 'For users with a strength or powerlifting goal (goal: strength | powerlifting), the primary competition lifts (squat, bench press, deadlift) must never be substituted or removed from the program. The Principle of Specificity dictates that removal of competition lifts causes rapid detraining of the sport-specific motor pattern. While accessory exercises must be rotated to combat adaptive resistance, variation on core lifts must take the form of execution variability only: pause reps, tempo manipulation, eccentric emphasis, or accommodating resistance (bands/chains).',
  },
  {
    id: 'weak-point-diagnostics',
    category: 'specificity',
    content: 'A compound lift stalls almost universally due to a localized muscular deficiency at a specific kinetic chain position, not total-body weakness. Match accessory prescriptions to failure patterns: failing at chest on bench press → prescribe heavy dumbbell flies or incline press; failing at lockout on bench → prescribe JM press or loaded triceps extensions; failing at knee level on deadlift → prescribe Romanian deadlifts or leg curls; failing out of the hole on squat → prescribe pause squats or leg press with full range. Identify the failure point and prescribe the targeted accessory, not a generic accessory for that muscle.',
  },

  // ─── Category 6: Phase Potentiation ──────────────────────────────────────────
  {
    id: 'phase-potentiation',
    category: 'periodization',
    content: 'A muscle built in a high-volume hypertrophy block is not immediately strong — it requires a strength realization block to neurologically wire the new contractile tissue for maximal force output. After 8–12 weeks of accumulation/hypertrophy training (high volume, 60–75% 1RM, RPE 7–8), transition to a strength block: reduce total weekly sets by 40–50%, push load to 80–95% of 1RM, extend rest to 3–5 minutes. Inform the user that the "pump" will diminish — this is expected and correct. The adaptation driver has shifted from metabolic stress to high-threshold motor unit recruitment and rate coding.',
  },
]
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/progression/coaching-knowledge.ts
git commit -m "feat: add 20 research-grade coaching knowledge chunks across 6 physiological categories"
```

---

### Task 3: CoachingKnowledgeService — embedText + retrieveForSituation + auto-seed

**Files:**
- Create: `apps/api/src/progression/coaching-knowledge.service.ts`
- Create: `apps/api/src/progression/coaching-knowledge.service.spec.ts`

- [ ] **Step 1: Write the failing tests first**

```typescript
// apps/api/src/progression/coaching-knowledge.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CoachingKnowledgeService } from './coaching-knowledge.service'

const mockDb = {
  execute: vi.fn(),
  select: vi.fn(() => ({ from: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([{ count: '0' }])) })) })),
  insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => Promise.resolve()) })) })),
}

const mockConfig = { getOrThrow: () => 'fake-key' }

describe('CoachingKnowledgeService.embedText', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('calls Gemini embedding API and returns number array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } }),
    } as any)

    const svc = new CoachingKnowledgeService(mockDb as any, mockConfig as any)
    const result = await (svc as any).embedText('test text')

    expect(result).toEqual([0.1, 0.2, 0.3])
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('text-embedding-004'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws when Gemini embedding API returns non-ok status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    } as any)

    const svc = new CoachingKnowledgeService(mockDb as any, mockConfig as any)
    await expect((svc as any).embedText('test')).rejects.toThrow('Gemini embed 429')
  })
})

describe('CoachingKnowledgeService.retrieveForSituation', () => {
  it('embeds the situation and returns top content strings from DB', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: Array(768).fill(0.1) } }),
    } as any)

    const mockDbWithExecute = {
      ...mockDb,
      execute: vi.fn().mockResolvedValue({
        rows: [
          { content: 'chunk one' },
          { content: 'chunk two' },
        ],
      }),
    }

    const svc = new CoachingKnowledgeService(mockDbWithExecute as any, mockConfig as any)
    const result = await svc.retrieveForSituation('intermediate lifter, bench press plateau')

    expect(result).toEqual(['chunk one', 'chunk two'])
    expect(mockDbWithExecute.execute).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && npx vitest run src/progression/coaching-knowledge.service.spec.ts
```

Expected: FAIL — `CoachingKnowledgeService` does not exist yet.

- [ ] **Step 3: Implement CoachingKnowledgeService**

```typescript
// apps/api/src/progression/coaching-knowledge.service.ts
import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { sql } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { COACHING_CHUNKS } from './coaching-knowledge'

const GEMINI_EMBED_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent'

@Injectable()
export class CoachingKnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(CoachingKnowledgeService.name)
  private readonly geminiApiKey: string

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    config: ConfigService,
  ) {
    this.geminiApiKey = config.getOrThrow<string>('GEMINI_API_KEY')
  }

  async onModuleInit() {
    try {
      await this.seedIfEmpty()
    } catch (err) {
      this.logger.warn('Failed to seed coaching knowledge — suggestions will have no coaching context', err)
    }
  }

  private async seedIfEmpty() {
    const rows = await this.db
      .select({ id: schema.coachingKnowledge.id })
      .from(schema.coachingKnowledge)
      .limit(1)

    if (rows.length > 0) {
      this.logger.log(`Coaching knowledge already seeded (${rows.length}+ rows), skipping`)
      return
    }

    this.logger.log(`Seeding ${COACHING_CHUNKS.length} coaching knowledge chunks...`)
    for (const chunk of COACHING_CHUNKS) {
      const embedding = await this.embedText(chunk.content)
      await this.db
        .insert(schema.coachingKnowledge)
        .values({ id: chunk.id, category: chunk.category, content: chunk.content, embedding })
        .onConflictDoUpdate({
          target: schema.coachingKnowledge.id,
          set: { content: chunk.content, embedding },
        })
    }
    this.logger.log('Coaching knowledge seeded successfully')
  }

  private async embedText(text: string): Promise<number[]> {
    const response = await fetch(`${GEMINI_EMBED_URL}?key=${this.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)')
      throw new Error(`Gemini embed ${response.status}: ${body}`)
    }

    const json = await response.json() as { embedding: { values: number[] } }
    return json.embedding.values
  }

  async retrieveForSituation(situationSummary: string): Promise<string[]> {
    const embedding = await this.embedText(situationSummary)
    const vecStr = `[${embedding.join(',')}]`

    const result = await this.db.execute(sql`
      SELECT content
      FROM coaching_knowledge
      ORDER BY embedding <=> ${vecStr}::vector
      LIMIT 3
    `)

    return (result.rows as { content: string }[]).map(r => r.content)
  }
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
cd apps/api && npx vitest run src/progression/coaching-knowledge.service.spec.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Verify TypeScript**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/progression/coaching-knowledge.service.ts apps/api/src/progression/coaching-knowledge.service.spec.ts
git commit -m "feat: add CoachingKnowledgeService with Gemini embedding, auto-seed, and cosine retrieval"
```

---

### Task 4: Register CoachingKnowledgeService in ProgressionModule

**Files:**
- Modify: `apps/api/src/progression/progression.module.ts`

- [ ] **Step 1: Add CoachingKnowledgeService to the module**

Replace the entire file content with:

```typescript
// apps/api/src/progression/progression.module.ts
import { Module } from '@nestjs/common'

import { CoachingKnowledgeService } from './coaching-knowledge.service'
import { ProgressionController } from './progression.controller'
import { ProgressionService } from './progression.service'

@Module({
  controllers: [ProgressionController],
  providers: [ProgressionService, CoachingKnowledgeService],
  exports: [ProgressionService],
})
export class ProgressionModule {}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Start the API and verify seeding runs at startup**

```bash
cd apps/api && npm run start:dev
```

Expected log output (within 30 seconds):
```
[CoachingKnowledgeService] Seeding 20 coaching knowledge chunks...
[CoachingKnowledgeService] Coaching knowledge seeded successfully
```

On subsequent restarts:
```
[CoachingKnowledgeService] Coaching knowledge already seeded (1+ rows), skipping
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/progression/progression.module.ts
git commit -m "feat: register CoachingKnowledgeService in ProgressionModule"
```

---

### Task 5: Update ProgressionService — expand ExerciseContext + UserContext, inject CoachingKnowledgeService, add buildSituationSummary, update buildPrompt

**Files:**
- Modify: `apps/api/src/progression/progression.service.ts`
- Modify: `apps/api/src/progression/progression.service.spec.ts`

- [ ] **Step 1: Write the new failing tests first**

Add these test cases to `apps/api/src/progression/progression.service.spec.ts` (append to the existing describe blocks, don't replace existing tests):

```typescript
// Add this import at the top of the existing spec file
import { CoachingKnowledgeService } from './coaching-knowledge.service'

// Replace the service instantiation:
// OLD: const service = new ProgressionService({} as any, { getOrThrow: () => 'fake-key' } as any)
// NEW:
const mockCoachingKnowledge = { retrieveForSituation: vi.fn().mockResolvedValue([]) }
const service = new ProgressionService(
  {} as any,
  { getOrThrow: () => 'fake-key' } as any,
  mockCoachingKnowledge as any,
)

describe('ProgressionService.buildSituationSummary', () => {
  it('includes experience level, goal, training phase, and body weight', () => {
    const result = service.buildSituationSummary(
      [],
      { experienceLevel: 'intermediate', latestBodyWeightKg: 82, goal: 'hypertrophy', trainingPhase: 'accumulation' },
    )
    expect(result).toContain('intermediate')
    expect(result).toContain('82kg')
    expect(result).toContain('hypertrophy')
    expect(result).toContain('accumulation')
  })

  it('includes exercise name, volume trend, session count, and category session gap', () => {
    const result = service.buildSituationSummary(
      [{
        exerciseId: 'bench-id',
        name: 'Bench Press',
        category: 'push',
        lastSets: [{ setNumber: 1, weightKg: 80, reps: 8, rpe: 7 }],
        prWeightKg: 90,
        prReps: 3,
        weeklyVolumes: [
          { week: '2026-W19', volume: 1800 },
          { week: '2026-W20', volume: 1920 },
        ],
        weeklyFrequency: 3,
        sessionCount: 5,
        lastTwoSessions: [{ weightKg: 80, reps: 10 }, { weightKg: 80, reps: 11 }],
        categoryWeeklySetCount: 12,
        hoursSinceCategorySession: 72,
        consecutiveWeeksActive: 6,
      }],
      { experienceLevel: null, latestBodyWeightKg: null, goal: null, trainingPhase: null },
    )
    expect(result).toContain('Bench Press')
    expect(result).toContain('increasing')
    expect(result).toContain('PR: 90kg')
    expect(result).toContain('5 sessions')
    expect(result).toContain('12 sets/week')
    expect(result).toContain('72h since')
    expect(result).toContain('6 weeks')
  })
})

describe('ProgressionService.buildPrompt with coaching chunks', () => {
  it('includes COACHING PRINCIPLES section when chunks are provided', () => {
    const result = service.buildPrompt(
      [{
        exerciseId: 'bench-id',
        name: 'Bench Press',
        category: 'push',
        lastSets: [{ setNumber: 1, weightKg: 80, reps: 8, rpe: null }],
        prWeightKg: 90,
        prReps: 3,
        weeklyVolumes: [],
        weeklyFrequency: 2,
        sessionCount: 4,
        lastTwoSessions: [],
        categoryWeeklySetCount: 8,
        hoursSinceCategorySession: null,
        consecutiveWeeksActive: 3,
      }],
      { age: null, heightCm: null, experienceLevel: 'intermediate', latestBodyWeightKg: null, goal: 'hypertrophy', trainingPhase: 'accumulation' },
      ['Intermediate lifters progress weekly.', 'RPE target is 7–8.'],
    )
    expect(result).toContain('COACHING PRINCIPLES')
    expect(result).toContain('Intermediate lifters progress weekly.')
    expect(result).toContain('RPE target is 7–8.')
  })

  it('omits COACHING PRINCIPLES section when no chunks provided', () => {
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
        sessionCount: 1,
        lastTwoSessions: [],
        categoryWeeklySetCount: 0,
        hoursSinceCategorySession: null,
        consecutiveWeeksActive: 1,
      }],
      { age: null, heightCm: null, experienceLevel: null, latestBodyWeightKg: null, goal: null, trainingPhase: null },
      [],
    )
    expect(result).not.toContain('COACHING PRINCIPLES')
  })
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
cd apps/api && npx vitest run src/progression/progression.service.spec.ts
```

Expected: existing tests pass, new tests fail.

- [ ] **Step 3: Update ProgressionService**

**Expand `ExerciseContext` type** (add 5 new fields):

```typescript
type ExerciseContext = {
  exerciseId: string
  name: string
  category: string | null
  lastSets: { setNumber: number; weightKg: number | null; reps: number | null; rpe: number | null }[]
  prWeightKg: number | null
  prReps: number | null
  weeklyVolumes: { week: string; volume: number }[]
  weeklyFrequency: number
  // New fields for richer coaching chunks
  sessionCount: number
  lastTwoSessions: { weightKg: number | null; reps: number | null }[]
  categoryWeeklySetCount: number
  hoursSinceCategorySession: number | null
  consecutiveWeeksActive: number
}
```

**Expand `buildExerciseContext`** — add 5 new queries after the existing ones:

```typescript
// Session count for this exercise (for data-sparsity-calibration chunk)
const sessionCountResult = await this.db.execute(sql`
  SELECT COUNT(DISTINCT s.session_id) AS cnt
  FROM sets s
  JOIN workout_sessions ws ON ws.id = s.session_id
  WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId}
    AND s.done = 1 AND ws.finished_at IS NOT NULL
`)
const sessionCount = Number((sessionCountResult.rows[0] as { cnt: string })?.cnt ?? 0)

// Last 2 prior sessions' top working set (for two-for-two-rule chunk)
const lastTwoResult = await this.db.execute(sql`
  SELECT s.weight_kg AS "weightKg", s.reps
  FROM sets s
  JOIN workout_sessions ws ON ws.id = s.session_id
  WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId}
    AND s.done = 1 AND ws.finished_at IS NOT NULL
    AND ws.id != ${sessionId}
  ORDER BY ws.finished_at DESC NULLS LAST, s.weight_kg DESC NULLS LAST
  LIMIT 2
`)
const lastTwoSessions = (lastTwoResult.rows as { weightKg: number | null; reps: number | null }[])

// Average weekly sets for same category (for MEV/MAV/MRV chunks)
const catSetsResult = await this.db.execute(sql`
  SELECT AVG(weekly_sets) AS avg_sets
  FROM (
    SELECT to_char(to_timestamp(s.completed_at), 'IYYY-"W"IW') AS week,
           COUNT(*) AS weekly_sets
    FROM sets s
    JOIN workout_sessions ws ON ws.id = s.session_id
    JOIN exercises e ON e.id = s.exercise_id
    WHERE ws.user_id = ${userId} AND e.category = ${exercise.category}
      AND s.done = 1
      AND s.completed_at > extract(epoch from now() - interval '4 weeks')
    GROUP BY week
  ) t
`)
const categoryWeeklySetCount = Math.round(Number((catSetsResult.rows[0] as { avg_sets: string })?.avg_sets ?? 0))

// Hours since last session for same category (for recovery-frequency-constraint chunk)
const catLastResult = await this.db.execute(sql`
  SELECT MAX(ws.finished_at) AS last_at
  FROM workout_sessions ws
  JOIN sets s ON s.session_id = ws.id
  JOIN exercises e ON e.id = s.exercise_id
  WHERE ws.user_id = ${userId} AND e.category = ${exercise.category}
    AND s.done = 1 AND ws.finished_at IS NOT NULL
    AND ws.id != ${sessionId}
`)
const lastCatAt = (catLastResult.rows[0] as { last_at: number | null })?.last_at
const hoursSinceCategorySession = lastCatAt
  ? Math.round((Date.now() / 1000 - lastCatAt) / 3600)
  : null

// Consecutive weeks active (for adaptive-resistance-variation chunk)
const consWeeksResult = await this.db.execute(sql`
  WITH weekly AS (
    SELECT DISTINCT to_char(to_timestamp(s.completed_at), 'IYYY-"W"IW') AS week
    FROM sets s
    JOIN workout_sessions ws ON ws.id = s.session_id
    WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId}
      AND s.done = 1 AND ws.finished_at IS NOT NULL
    ORDER BY week DESC
  ),
  ranked AS (
    SELECT week,
           ROW_NUMBER() OVER (ORDER BY week DESC) AS rn,
           to_char(
             (SELECT MAX(to_timestamp(s2.completed_at))
              FROM sets s2 JOIN workout_sessions ws2 ON ws2.id = s2.session_id
              WHERE ws2.user_id = ${userId} AND s2.exercise_id = ${exerciseId} AND s2.done = 1)
             - (rn - 1) * interval '1 week',
             'IYYY-"W"IW'
           ) AS expected_week
    FROM weekly
  )
  SELECT COUNT(*) AS consecutive
  FROM ranked
  WHERE week = expected_week
`)
const consecutiveWeeksActive = Number((consWeeksResult.rows[0] as { consecutive: string })?.consecutive ?? 1)
```

Update the return object:

```typescript
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
  sessionCount,
  lastTwoSessions,
  categoryWeeklySetCount,
  hoursSinceCategorySession,
  consecutiveWeeksActive,
}
```

**Expand `getUserContext`** — add `goal` and `trainingPhase`:

```typescript
async getUserContext(userId: string): Promise<{
  age: number | null
  heightCm: number | null
  experienceLevel: string | null
  latestBodyWeightKg: number | null
  goal: string | null
  trainingPhase: string | null
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
    goal: profile?.goal ?? null,
    trainingPhase: profile?.trainingPhase ?? null,
  }
}
```

**Add `buildSituationSummary`** (public method, after `getUserContext`):

```typescript
buildSituationSummary(
  exercises: ExerciseContext[],
  user: { experienceLevel: string | null; latestBodyWeightKg: number | null; goal: string | null; trainingPhase: string | null },
): string {
  const parts: string[] = []
  if (user.experienceLevel) parts.push(`Experience level: ${user.experienceLevel}`)
  if (user.goal) parts.push(`Goal: ${user.goal}`)
  if (user.trainingPhase) parts.push(`Training phase: ${user.trainingPhase}`)
  if (user.latestBodyWeightKg) parts.push(`Body weight: ${user.latestBodyWeightKg}kg`)

  for (const ex of exercises.slice(0, 3)) {
    const lastSet = ex.lastSets.at(-1)
    const volumeTrend =
      ex.weeklyVolumes.length >= 2
        ? ex.weeklyVolumes.at(-1)!.volume > ex.weeklyVolumes.at(-2)!.volume
          ? 'increasing'
          : 'flat or decreasing'
        : 'insufficient data'
    const twoForTwoInfo =
      ex.lastTwoSessions.length === 2
        ? `last 2 sessions top sets: ${ex.lastTwoSessions.map(s => `${s.weightKg ?? 0}kg×${s.reps ?? 0}`).join(', ')}`
        : 'fewer than 2 prior sessions'
    parts.push(
      `Exercise: ${ex.name}${ex.category ? ` (${ex.category})` : ''}, ` +
      `${ex.sessionCount} sessions logged, ` +
      `${ex.consecutiveWeeksActive} consecutive weeks active, ` +
      `last: ${lastSet ? `${lastSet.weightKg ?? 0}kg×${lastSet.reps ?? 0}${lastSet.rpe ? ` @RPE${lastSet.rpe}` : ''}` : 'no data'}, ` +
      `${twoForTwoInfo}, ` +
      `PR: ${ex.prWeightKg ?? 'none'}kg, ` +
      `volume trend: ${volumeTrend}, ` +
      `category ${ex.categoryWeeklySetCount} sets/week, ` +
      `${ex.hoursSinceCategorySession !== null ? `${ex.hoursSinceCategorySession}h since last ${ex.category ?? 'category'} session` : 'no prior category session'}, ` +
      `freq: ${ex.weeklyFrequency}/week`,
    )
  }

  return parts.join('. ')
}
```

**Update `buildPrompt`** — add `goal`/`trainingPhase` to user line and optional `coachingChunks` param:

```typescript
buildPrompt(
  exercises: ExerciseContext[],
  user: { age: number | null; heightCm: number | null; experienceLevel: string | null; latestBodyWeightKg: number | null; goal: string | null; trainingPhase: string | null },
  coachingChunks: string[] = [],
): string {
  const userLine = [
    user.age && `Age: ${user.age}`,
    user.heightCm && `Height: ${user.heightCm}cm`,
    user.experienceLevel && `Experience: ${user.experienceLevel}`,
    user.goal && `Goal: ${user.goal}`,
    user.trainingPhase && `Phase: ${user.trainingPhase}`,
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
      const twoForTwo =
        ex.lastTwoSessions.length === 2
          ? `Last 2 sessions top sets: ${ex.lastTwoSessions.map(s => `${s.weightKg ?? 0}kg×${s.reps ?? 0}`).join(', ')}`
          : 'Last 2 sessions: insufficient history'
      return [
        `EXERCISE [${ex.exerciseId}] ${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
        `This session: ${setsLine || 'no done sets'}`,
        prLine,
        volumeLine,
        twoForTwo,
        `Sessions logged: ${ex.sessionCount} | Consecutive weeks active: ${ex.consecutiveWeeksActive}`,
        `Category sets/week: ${ex.categoryWeeklySetCount} | Hours since last ${ex.category ?? 'category'} session: ${ex.hoursSinceCategorySession ?? 'unknown'}`,
        `Weekly frequency: ${ex.weeklyFrequency} sessions/week`,
      ].join('\n')
    })
    .join('\n\n')

  const coachingSection =
    coachingChunks.length > 0
      ? `COACHING PRINCIPLES (apply these when generating suggestions):\n${coachingChunks.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n`
      : ''

  return [
    'You are a certified strength and conditioning coach.',
    'Analyse the training data below and return a progression suggestion for each exercise.',
    'Rules: conservative increments (2.5–5 kg max), always cite specific numbers in evidence[].',
    'If fewer than 3 sessions of history exist for an exercise, suggest +2–3% and include',
    '"Insufficient history — suggestion will improve as more data accumulates" in evidence[].',
    '',
    coachingSection,
    userLine ? `USER:\n${userLine}` : 'USER: No profile data available.',
    '',
    exerciseBlocks,
  ].join('\n')
}
```

**Update `generateForSession`** — retrieve coaching context before calling Gemini:

Find the line:
```typescript
    const prompt = this.buildPrompt(validContexts, userCtx)
```

Replace with:
```typescript
    const situationSummary = this.buildSituationSummary(validContexts, userCtx)
    let coachingChunks: string[] = []
    try {
      coachingChunks = await this.coachingKnowledge.retrieveForSituation(situationSummary)
    } catch (err) {
      this.logger.warn('Coaching knowledge retrieval failed, proceeding without coaching context', err)
    }

    const prompt = this.buildPrompt(validContexts, userCtx, coachingChunks)
```

**Add import and update constructor:**

```typescript
import { CoachingKnowledgeService } from './coaching-knowledge.service'

// Updated constructor:
constructor(
  @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
  config: ConfigService,
  private readonly coachingKnowledge: CoachingKnowledgeService,
) {
  this.geminiApiKey = config.getOrThrow<string>('GEMINI_API_KEY')
}
```

- [ ] **Step 4: Run all tests in the progression directory**

```bash
cd apps/api && npx vitest run src/progression/
```

Expected: all tests pass (existing + new).

- [ ] **Step 5: Verify TypeScript**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/progression/progression.service.ts apps/api/src/progression/progression.service.spec.ts
git commit -m "feat: expand ExerciseContext with 5 coaching data fields and inject coaching context into progression prompt"
```

---

### Task 6: End-to-end smoke test

No code changes — validate the full flow works against a real session.

- [ ] **Step 1: Start the API**

```bash
cd apps/api && npm run start:dev
```

Confirm in logs:
```
[CoachingKnowledgeService] Coaching knowledge already seeded (1+ rows), skipping
```

(Fresh DB: `Seeding 20 coaching knowledge chunks... Coaching knowledge seeded successfully`)

- [ ] **Step 2: Finish an active session and watch the logs**

```bash
curl -s -X POST http://localhost:3000/sessions/<SESSION_ID>/finish \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: fire-and-forget response. After a few seconds, logs show:

```
[ProgressionService] Generated N progression suggestions for session <id>
```

No errors about coaching retrieval.

- [ ] **Step 3: Fetch a suggestion and verify coaching principles are referenced**

```bash
curl -s http://localhost:3000/exercises/<EXERCISE_ID>/progression-suggestion | jq .
```

Expected: JSON with `reason` and `evidence[]` referencing specific volume numbers, RPE values, two-for-two history, or recovery gap — not generic advice.

- [ ] **Step 4: Verify coaching principles are in the DB**

```bash
psql gymtracker -c "SELECT id, category, char_length(content) as len FROM coaching_knowledge ORDER BY category;"
```

Expected: 20 rows with non-zero content lengths, spanning categories: autoregulation, deload, periodization, progression, specificity, volume.

- [ ] **Step 5: Verify new user profile fields are accessible**

```bash
psql gymtracker -c "\d user_profiles"
```

Expected: columns `goal` and `training_phase` present alongside existing columns.
