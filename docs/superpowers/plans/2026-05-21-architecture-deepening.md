# Architecture Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six architectural friction points: centralise all Gemini calls in a single adapter with auto-fallback on rate limits, move CoachingKnowledge to its own module, split ProgressionService into history/prompt/orchestration layers, create a SessionEventService for post-session hooks, use the adapter in EquipmentService, and fold two shallow pass-throughs (GymService, SessionRepository).

**Architecture:** `GeminiAdapter` is a `@Global()` NestJS service that owns all Gemini HTTP calls. It tracks an `activeModel` (`gemini-2.5-flash`), auto-switches to `gemini-2.0-flash` on 429/503, and logs every call via `AiLogService`. `CoachingKnowledgeService` moves from `ProgressionModule` to its own `CoachingModule` and uses `GeminiAdapter.embed()`. `ProgressionService` delegates data collection to `ExerciseHistoryService` and prompt building to `ProgressionPromptBuilder` (static methods). `WorkoutsService` calls `SessionEventService.onSessionFinished()` instead of directly touching `ProgressionService`/`ProgramService`. `GymService` is inlined into `EquipmentService`. `SessionRepository` is inlined into its callers.

**Tech Stack:** NestJS 11, Drizzle ORM, Vitest, TypeScript strict mode.

---

## File Map

### New files
- `apps/api/src/gemini/gemini.adapter.ts` — GeminiAdapter (generate + embed + model fallback)
- `apps/api/src/gemini/gemini.module.ts` — @Global() GeminiModule
- `apps/api/src/gemini/gemini.adapter.spec.ts` — unit tests
- `apps/api/src/coaching/coaching-knowledge.service.ts` — moved + updated from `progression/`
- `apps/api/src/coaching/coaching-knowledge.ts` — moved from `progression/`
- `apps/api/src/coaching/coaching.module.ts` — CoachingModule
- `apps/api/src/coaching/coaching-knowledge.service.spec.ts` — moved + updated from `progression/`
- `apps/api/src/progression/exercise-history.service.ts` — data layer extracted from ProgressionService
- `apps/api/src/progression/progression-prompt.builder.ts` — pure static prompt builders
- `apps/api/src/workouts/session-event.service.ts` — post-session async hook dispatcher

### Modified files
- `apps/api/src/progression/progression.service.ts` — reduced to orchestration only
- `apps/api/src/progression/progression.module.ts` — adds ExerciseHistoryService, CoachingModule
- `apps/api/src/progression/progression.service.spec.ts` — updated imports
- `apps/api/src/program/program.service.ts` — uses GeminiAdapter
- `apps/api/src/program/program.module.ts` — imports CoachingModule; drops ProgressionModule
- `apps/api/src/equipment/equipment.service.ts` — uses GeminiAdapter; GymService inlined
- `apps/api/src/equipment/equipment.module.ts` — drops GymModule
- `apps/api/src/workouts/workouts.service.ts` — uses SessionEventService; SessionRepository inlined
- `apps/api/src/workouts/workouts.module.ts` — adds SessionEventService provider
- `apps/api/src/sets/sets.service.ts` — SessionRepository inlined
- `apps/api/src/sets/sets.module.ts` — drops SessionsModule
- `apps/api/src/app.module.ts` — imports GeminiModule + CoachingModule

### Deleted files
- `apps/api/src/gym/gym.service.ts`
- `apps/api/src/gym/gym.module.ts`
- `apps/api/src/sessions/session.repository.ts`
- `apps/api/src/sessions/sessions.module.ts`
- `apps/api/src/progression/coaching-knowledge.service.ts`
- `apps/api/src/progression/coaching-knowledge.ts`
- `apps/api/src/progression/coaching-knowledge.service.spec.ts`

---

## Task 1: Fold GymService into EquipmentService

**Files:**
- Modify: `apps/api/src/equipment/equipment.service.ts`
- Modify: `apps/api/src/equipment/equipment.module.ts`
- Delete: `apps/api/src/gym/gym.service.ts`
- Delete: `apps/api/src/gym/gym.module.ts`

- [ ] **Step 1: Inline gym get-or-create in `EquipmentService.create()`**

Open `apps/api/src/equipment/equipment.service.ts`. Replace the gym-related constructor injection and the `create()` call to `gymService`:

Before (constructor):
```typescript
constructor(
  @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
  private config: ConfigService,
  private gymService: GymService,
  private readonly aiLog: AiLogService,
) {
  this.geminiApiKey = config.getOrThrow<string>('GEMINI_API_KEY')
  this.photosDir = config.getOrThrow<string>('PHOTOS_DIR')
}
```

After (constructor):
```typescript
constructor(
  @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
  private config: ConfigService,
  private readonly aiLog: AiLogService,
) {
  this.geminiApiKey = config.getOrThrow<string>('GEMINI_API_KEY')
  this.photosDir = config.getOrThrow<string>('PHOTOS_DIR')
}
```

Before (first line of `create()`):
```typescript
const gym = await this.gymService.getOrCreateForUser(userId)
```

After (same first line of `create()`):
```typescript
const gym = await this.getOrCreateGym(userId)
```

Add private helper at end of class (before the closing brace):
```typescript
private async getOrCreateGym(userId: string): Promise<typeof schema.gyms.$inferSelect> {
  const [existing] = await this.db.select().from(schema.gyms).where(eq(schema.gyms.userId, userId)).limit(1)
  if (existing) return existing
  await this.db
    .insert(schema.gyms)
    .values({ id: randomUUID(), userId, name: 'My Gym', createdAt: Math.floor(Date.now() / 1000) })
    .onConflictDoNothing()
  const [gym] = await this.db.select().from(schema.gyms).where(eq(schema.gyms.userId, userId)).limit(1)
  return gym!
}
```

Also add `eq` to the drizzle-orm imports if not already there (it is).
Remove the `GymService` import line at the top.

- [ ] **Step 2: Remove GymModule from EquipmentModule**

In `apps/api/src/equipment/equipment.module.ts`, remove the `GymModule` import:

```typescript
import { Module } from '@nestjs/common'

import { EquipmentController } from './equipment.controller'
import { EquipmentService } from './equipment.service'

@Module({
  controllers: [EquipmentController],
  providers: [EquipmentService],
})
export class EquipmentModule {}
```

- [ ] **Step 3: Delete gym files**

```bash
rm apps/api/src/gym/gym.service.ts
rm apps/api/src/gym/gym.module.ts
rmdir apps/api/src/gym
```

- [ ] **Step 4: Verify build**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/equipment/equipment.service.ts \
        apps/api/src/equipment/equipment.module.ts
git rm apps/api/src/gym/gym.service.ts apps/api/src/gym/gym.module.ts
git commit -m "refactor: fold GymService into EquipmentService (candidate 6a)"
```

---

## Task 2: Fold SessionRepository into its callers

**Files:**
- Modify: `apps/api/src/workouts/workouts.service.ts`
- Modify: `apps/api/src/workouts/workouts.module.ts`
- Modify: `apps/api/src/sets/sets.service.ts`
- Modify: `apps/api/src/sets/sets.module.ts`
- Delete: `apps/api/src/sessions/session.repository.ts`
- Delete: `apps/api/src/sessions/sessions.module.ts`

- [ ] **Step 1: Inline `findActive` in WorkoutsService**

In `apps/api/src/workouts/workouts.service.ts`:

Remove `SessionRepository` import and constructor injection. Remove `private sessions: SessionRepository` from constructor.

Replace `getActiveSession`:
```typescript
async getActiveSession(userId: string) {
  const [row] = await this.db
    .select()
    .from(schema.workoutSessions)
    .where(and(eq(schema.workoutSessions.userId, userId), isNull(schema.workoutSessions.finishedAt)))
    .limit(1)
  return row ? toWorkoutSession(row) : null
}
```

Add `isNull` to the drizzle-orm import line.

- [ ] **Step 2: Remove SessionsModule from WorkoutsModule**

In `apps/api/src/workouts/workouts.module.ts`, remove the `SessionsModule` import:

```typescript
import { Module } from '@nestjs/common'

import { ProgressionModule } from '../progression/progression.module'
import { ProgramModule } from '../program/program.module'
import { WorkoutsController } from './workouts.controller'
import { WorkoutsService } from './workouts.service'

@Module({
  imports: [ProgressionModule, ProgramModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService],
})
export class WorkoutsModule {}
```

- [ ] **Step 3: Inline `assertActive` in SetsService**

In `apps/api/src/sets/sets.service.ts`:

Remove `SessionRepository` import and constructor injection. Add a private `assertActive` method:

```typescript
private async assertActive(sessionId: string, userId: string): Promise<void> {
  const [row] = await this.db
    .select()
    .from(schema.workoutSessions)
    .where(and(eq(schema.workoutSessions.id, sessionId), eq(schema.workoutSessions.userId, userId)))
    .limit(1)
  if (!row) throw new NotFoundException('Session not found')
  if (row.finishedAt !== null) throw new BadRequestException('Session is already finished')
}
```

Change every `await this.sessions.assertActive(sessionId, userId)` call to `await this.assertActive(sessionId, userId)`.

Add these imports at top of the file: `import { eq, and } from 'drizzle-orm'` (they may already exist), `import * as schema from '../drizzle/schema'` (if not already), and `import { BadRequestException } from '@nestjs/common'` (add if not present — check what's already imported from `@nestjs/common`).

The full updated constructor for SetsService:
```typescript
constructor(
  @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
) {}
```

- [ ] **Step 4: Remove SessionsModule from SetsModule**

In `apps/api/src/sets/sets.module.ts`:

```typescript
import { Module } from '@nestjs/common'

import { SetsController } from './sets.controller'
import { SetsService } from './sets.service'

@Module({ controllers: [SetsController], providers: [SetsService] })
export class SetsModule {}
```

- [ ] **Step 5: Delete sessions files**

```bash
rm apps/api/src/sessions/session.repository.ts
rm apps/api/src/sessions/sessions.module.ts
rmdir apps/api/src/sessions
```

- [ ] **Step 6: Verify build**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/workouts/workouts.service.ts \
        apps/api/src/workouts/workouts.module.ts \
        apps/api/src/sets/sets.service.ts \
        apps/api/src/sets/sets.module.ts
git rm apps/api/src/sessions/session.repository.ts \
       apps/api/src/sessions/sessions.module.ts
git commit -m "refactor: fold SessionRepository into WorkoutsService and SetsService (candidate 6b)"
```

---

## Task 3: Create GeminiAdapter

**Files:**
- Create: `apps/api/src/gemini/gemini.adapter.ts`
- Create: `apps/api/src/gemini/gemini.module.ts`
- Create: `apps/api/src/gemini/gemini.adapter.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/gemini/gemini.adapter.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GeminiAdapter } from './gemini.adapter'

const mockConfig = { getOrThrow: () => 'test-key' }
const mockAiLog = { add: vi.fn() }

function makeAdapter() {
  return new GeminiAdapter(mockConfig as any, mockAiLog as any)
}

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown>; text?: () => Promise<string> }) {
  global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, ...response })
}

function makeCandidates(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] }
}

describe('GeminiAdapter.generate', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls gemini-2.5-flash by default and parses JSON response', async () => {
    const payload = { suggestions: [{ exerciseId: 'x', suggestedSets: 3 }] }
    mockFetchOnce({ json: async () => makeCandidates(JSON.stringify(payload)) })

    const adapter = makeAdapter()
    const result = await adapter.generate('progression', 'test prompt')

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('gemini-2.5-flash'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result).toEqual(payload)
  })

  it('includes responseSchema in generationConfig when schema provided', async () => {
    const schema = { type: 'OBJECT', properties: { foo: { type: 'STRING' } } }
    mockFetchOnce({ json: async () => makeCandidates('{"foo":"bar"}') })

    await makeAdapter().generate('test', 'prompt', { schema })

    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.generationConfig.responseSchema).toEqual(schema)
  })

  it('includes inlineData part when image provided', async () => {
    mockFetchOnce({ json: async () => makeCandidates('{"equipment":{"name":"Cable Tower","tags":[]}}') })

    await makeAdapter().generate('equipment', 'analyze this', {
      image: { base64: 'abc123', mimeType: 'image/jpeg' },
    })

    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'abc123' } })
    expect(body.contents[0].parts[1]).toEqual({ text: 'analyze this' })
  })

  it('logs success to AiLog', async () => {
    mockFetchOnce({ json: async () => makeCandidates('{"ok":true}') })
    await makeAdapter().generate('progression', 'test prompt')
    expect(mockAiLog.add).toHaveBeenCalledWith('progression', 'test prompt', '{"ok":true}', expect.any(Number))
  })

  it('logs error to AiLog and rethrows on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'internal server error',
    })

    const adapter = makeAdapter()
    await expect(adapter.generate('test', 'prompt')).rejects.toThrow('Gemini 500')
    expect(mockAiLog.add).toHaveBeenCalledWith('test', 'prompt', expect.stringContaining('ERROR'), expect.any(Number))
  })

  it('switches to gemini-2.0-flash on 429 and retries', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValueOnce({ ok: true, json: async () => makeCandidates('{"ok":true}') })

    const adapter = makeAdapter()
    const result = await adapter.generate('test', 'prompt')

    expect(result).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(2)
    const firstUrl = (fetch as any).mock.calls[0][0] as string
    const secondUrl = (fetch as any).mock.calls[1][0] as string
    expect(firstUrl).toContain('gemini-2.5-flash')
    expect(secondUrl).toContain('gemini-2.0-flash')
  })

  it('stays on fallback model after switching', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValue({ ok: true, json: async () => makeCandidates('{"ok":true}') })

    const adapter = makeAdapter()
    await adapter.generate('test', 'first call')
    await adapter.generate('test', 'second call')

    const secondCallUrl = (fetch as any).mock.calls[1][0] as string
    const thirdCallUrl = (fetch as any).mock.calls[2][0] as string
    expect(secondCallUrl).toContain('gemini-2.0-flash')
    expect(thirdCallUrl).toContain('gemini-2.0-flash')
  })

  it('throws on 503 without retry when already on fallback', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValueOnce({ ok: true, json: async () => makeCandidates('{"ok":true}') })
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'unavailable' })

    const adapter = makeAdapter()
    await adapter.generate('test', 'first')
    await expect(adapter.generate('test', 'second')).rejects.toThrow('Gemini 503')
  })
})

describe('GeminiAdapter.embed', () => {
  it('calls text-embedding-004 endpoint and returns values array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } }),
    })

    const result = await makeAdapter().embed('test text')

    expect(result).toEqual([0.1, 0.2, 0.3])
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('text-embedding-004'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    })

    await expect(makeAdapter().embed('text')).rejects.toThrow('Gemini embed 429')
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/api && npx vitest run src/gemini/gemini.adapter.spec.ts 2>&1 | tail -20
```

Expected: `Error: Cannot find module './gemini.adapter'`

- [ ] **Step 3: Create GeminiAdapter**

Create `apps/api/src/gemini/gemini.adapter.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { AiLogService } from '../ai-log/ai-log.service'

export type GenerateOptions = {
  schema?: Record<string, unknown>
  image?: { base64: string; mimeType: string }
}

const GENERATE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent'
const PRIMARY_MODEL = 'gemini-2.5-flash'
const FALLBACK_MODEL = 'gemini-2.0-flash'

class GeminiHttpError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`Gemini ${status}: ${body}`)
  }
}

function isRateLimit(err: unknown): boolean {
  return err instanceof GeminiHttpError && (err.status === 429 || err.status === 503)
}

@Injectable()
export class GeminiAdapter {
  private readonly logger = new Logger(GeminiAdapter.name)
  private readonly apiKey: string
  private activeModel = PRIMARY_MODEL

  constructor(
    config: ConfigService,
    private readonly aiLog: AiLogService,
  ) {
    this.apiKey = config.getOrThrow<string>('GEMINI_API_KEY')
  }

  async generate(logType: string, prompt: string, opts?: GenerateOptions): Promise<unknown> {
    const parts: unknown[] = []
    if (opts?.image) {
      parts.push({ inlineData: { mimeType: opts.image.mimeType, data: opts.image.base64 } })
    }
    parts.push({ text: prompt })

    const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json' }
    if (opts?.schema) generationConfig.responseSchema = opts.schema

    const body = JSON.stringify({ contents: [{ parts }], generationConfig })
    const t0 = Date.now()

    let text: string
    try {
      text = await this.callWithFallback(body)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.aiLog.add(logType, prompt, `ERROR: ${msg}`, Date.now() - t0)
      throw err
    }

    this.aiLog.add(logType, prompt, text, Date.now() - t0)
    return JSON.parse(text)
  }

  private async callWithFallback(body: string): Promise<string> {
    try {
      return await this.callModel(this.activeModel, body)
    } catch (err) {
      if (this.activeModel !== FALLBACK_MODEL && isRateLimit(err)) {
        this.logger.warn(`${PRIMARY_MODEL} rate-limited — switching to ${FALLBACK_MODEL}`)
        this.activeModel = FALLBACK_MODEL
        return this.callModel(this.activeModel, body)
      }
      throw err
    }
  }

  private async callModel(model: string, body: string): Promise<string> {
    const url = `${GENERATE_BASE}/${model}:generateContent?key=${this.apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '(unreadable)')
      throw new GeminiHttpError(res.status, errBody)
    }

    const json = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Gemini returned empty response')
    return text
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${EMBED_URL}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      }),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '(unreadable)')
      throw new Error(`Gemini embed ${res.status}: ${errBody}`)
    }

    const json = await res.json() as { embedding: { values: number[] } }
    return json.embedding.values
  }
}
```

- [ ] **Step 4: Create GeminiModule**

Create `apps/api/src/gemini/gemini.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common'

import { GeminiAdapter } from './gemini.adapter'

@Global()
@Module({
  providers: [GeminiAdapter],
  exports: [GeminiAdapter],
})
export class GeminiModule {}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd apps/api && npx vitest run src/gemini/gemini.adapter.spec.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Add GeminiModule to AppModule**

In `apps/api/src/app.module.ts`, add `GeminiModule` to imports (after `DrizzleModule`):

```typescript
import { GeminiModule } from './gemini/gemini.module'

// inside @Module imports array, add:
GeminiModule,
```

- [ ] **Step 7: Verify build**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/gemini/
git add apps/api/src/app.module.ts
git commit -m "feat: add GeminiAdapter with auto-fallback to gemini-2.0-flash on 429"
```

---

## Task 4: Create CoachingModule

**Files:**
- Create: `apps/api/src/coaching/coaching-knowledge.service.ts`
- Create: `apps/api/src/coaching/coaching-knowledge.ts`
- Create: `apps/api/src/coaching/coaching.module.ts`
- Create: `apps/api/src/coaching/coaching-knowledge.service.spec.ts`
- Modify: `apps/api/src/progression/progression.module.ts`
- Modify: `apps/api/src/program/program.module.ts`
- Modify: `apps/api/src/program/program.service.ts`
- Delete: `apps/api/src/progression/coaching-knowledge.service.ts`
- Delete: `apps/api/src/progression/coaching-knowledge.ts`
- Delete: `apps/api/src/progression/coaching-knowledge.service.spec.ts`

- [ ] **Step 1: Copy coaching-knowledge.ts to new location**

Create `apps/api/src/coaching/coaching-knowledge.ts` with identical content to `apps/api/src/progression/coaching-knowledge.ts` (just copy the file — no changes needed).

- [ ] **Step 2: Write the failing test for CoachingKnowledgeService with GeminiAdapter**

Create `apps/api/src/coaching/coaching-knowledge.service.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CoachingKnowledgeService } from './coaching-knowledge.service'

const mockGemini = {
  embed: vi.fn(),
}

const mockDb = {
  execute: vi.fn(),
  select: vi.fn(() => ({
    from: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([{ count: '0' }])) })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => Promise.resolve()) })),
  })),
}

describe('CoachingKnowledgeService.retrieveForSituation', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('uses GeminiAdapter.embed to build query vector and returns content strings', async () => {
    const vector = Array(768).fill(0.1)
    mockGemini.embed.mockResolvedValue(vector)
    mockDb.execute.mockResolvedValue({
      rows: [{ content: 'chunk one' }, { content: 'chunk two' }],
    })

    const svc = new CoachingKnowledgeService(mockDb as any, mockGemini as any)
    const result = await svc.retrieveForSituation('intermediate lifter bench plateau')

    expect(mockGemini.embed).toHaveBeenCalledWith('intermediate lifter bench plateau')
    expect(mockDb.execute).toHaveBeenCalledOnce()
    expect(result).toEqual(['chunk one', 'chunk two'])
  })

  it('propagates embed errors so callers can handle them', async () => {
    mockGemini.embed.mockRejectedValue(new Error('network error'))
    const svc = new CoachingKnowledgeService(mockDb as any, mockGemini as any)
    await expect(svc.retrieveForSituation('any situation')).rejects.toThrow('network error')
  })
})
```

- [ ] **Step 3: Run test — expect failure**

```bash
cd apps/api && npx vitest run src/coaching/coaching-knowledge.service.spec.ts 2>&1 | tail -10
```

Expected: `Error: Cannot find module './coaching-knowledge.service'`

- [ ] **Step 4: Create CoachingKnowledgeService using GeminiAdapter**

Create `apps/api/src/coaching/coaching-knowledge.service.ts`:

```typescript
import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { GeminiAdapter } from '../gemini/gemini.adapter'
import { COACHING_CHUNKS } from './coaching-knowledge'

@Injectable()
export class CoachingKnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(CoachingKnowledgeService.name)

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private readonly gemini: GeminiAdapter,
  ) {}

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
      const embedding = await this.gemini.embed(chunk.content)
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

  async retrieveForSituation(situationSummary: string): Promise<string[]> {
    const embedding = await this.gemini.embed(situationSummary)
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

- [ ] **Step 5: Run test — expect pass**

```bash
cd apps/api && npx vitest run src/coaching/coaching-knowledge.service.spec.ts 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Create CoachingModule**

Create `apps/api/src/coaching/coaching.module.ts`:

```typescript
import { Module } from '@nestjs/common'

import { CoachingKnowledgeService } from './coaching-knowledge.service'

@Module({
  providers: [CoachingKnowledgeService],
  exports: [CoachingKnowledgeService],
})
export class CoachingModule {}
```

Note: `GeminiModule` is `@Global()` so `CoachingModule` does not need to import it.

- [ ] **Step 7: Update ProgressionModule to use CoachingModule**

Replace `apps/api/src/progression/progression.module.ts`:

```typescript
import { Module } from '@nestjs/common'

import { CoachingModule } from '../coaching/coaching.module'
import { ProgressionController } from './progression.controller'
import { ProgressionService } from './progression.service'

@Module({
  imports: [CoachingModule],
  controllers: [ProgressionController],
  providers: [ProgressionService],
  exports: [ProgressionService],
})
export class ProgressionModule {}
```

- [ ] **Step 8: Update ProgressionService import path**

In `apps/api/src/progression/progression.service.ts`, update the `CoachingKnowledgeService` import:

Before:
```typescript
import { CoachingKnowledgeService } from './coaching-knowledge.service'
```

After:
```typescript
import { CoachingKnowledgeService } from '../coaching/coaching-knowledge.service'
```

- [ ] **Step 9: Update ProgramModule to use CoachingModule instead of ProgressionModule**

Replace `apps/api/src/program/program.module.ts`:

```typescript
import { Module } from '@nestjs/common'

import { CoachingModule } from '../coaching/coaching.module'
import { ProgramController } from './program.controller'
import { ProgramService } from './program.service'

@Module({
  imports: [CoachingModule],
  controllers: [ProgramController],
  providers: [ProgramService],
  exports: [ProgramService],
})
export class ProgramModule {}
```

- [ ] **Step 10: Update ProgramService import path**

In `apps/api/src/program/program.service.ts`, update:

Before:
```typescript
import { CoachingKnowledgeService } from '../progression/coaching-knowledge.service'
```

After:
```typescript
import { CoachingKnowledgeService } from '../coaching/coaching-knowledge.service'
```

- [ ] **Step 11: Add CoachingModule to AppModule**

In `apps/api/src/app.module.ts`, add the CoachingModule import:

```typescript
import { CoachingModule } from './coaching/coaching.module'

// inside @Module imports array, add:
CoachingModule,
```

- [ ] **Step 12: Delete old progression coaching files**

```bash
rm apps/api/src/progression/coaching-knowledge.service.ts
rm apps/api/src/progression/coaching-knowledge.ts
rm apps/api/src/progression/coaching-knowledge.service.spec.ts
```

- [ ] **Step 13: Verify build and tests**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -30
npx vitest run src/coaching/ src/progression/progression.service.spec.ts 2>&1 | tail -20
```

Expected: no errors, all tests pass.

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/coaching/ \
        apps/api/src/progression/progression.module.ts \
        apps/api/src/progression/progression.service.ts \
        apps/api/src/program/program.module.ts \
        apps/api/src/program/program.service.ts \
        apps/api/src/app.module.ts
git rm apps/api/src/progression/coaching-knowledge.service.ts \
       apps/api/src/progression/coaching-knowledge.ts \
       apps/api/src/progression/coaching-knowledge.service.spec.ts
git commit -m "refactor: move CoachingKnowledgeService to its own CoachingModule (candidate 3)"
```

---

## Task 5: Extract ExerciseHistoryService and ProgressionPromptBuilder

**Files:**
- Create: `apps/api/src/progression/exercise-history.service.ts`
- Create: `apps/api/src/progression/progression-prompt.builder.ts`
- Modify: `apps/api/src/progression/progression.service.ts`
- Modify: `apps/api/src/progression/progression.service.spec.ts`
- Modify: `apps/api/src/progression/progression.module.ts`

- [ ] **Step 1: Create ExerciseHistoryService**

Create `apps/api/src/progression/exercise-history.service.ts`:

```typescript
import { Injectable, Inject } from '@nestjs/common'
import { eq, and, sql, desc } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'

export type ExerciseContext = {
  exerciseId: string
  name: string
  category: string | null
  lastSets: { setNumber: number; weightKg: number | null; reps: number | null; rpe: number | null }[]
  prWeightKg: number | null
  prReps: number | null
  weeklyVolumes: { week: string; volume: number }[]
  weeklyFrequency: number
  sessionCount: number
  lastTwoSessions: { weightKg: number | null; reps: number | null }[]
  categoryWeeklySetCount: number
  hoursSinceCategorySession: number | null
  consecutiveWeeksActive: number
}

export type UserContext = {
  age: number | null
  heightCm: number | null
  experienceLevel: string | null
  latestBodyWeightKg: number | null
  goal: string | null
  trainingPhase: string | null
}

@Injectable()
export class ExerciseHistoryService {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  async buildExerciseContext(
    exerciseId: string,
    userId: string,
    sessionId: string,
  ): Promise<ExerciseContext | null> {
    const [exercise] = await this.db
      .select({ name: schema.exercises.name, category: schema.exercises.category })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, exerciseId))
      .limit(1)
    if (!exercise) return null

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

    const prResult = await this.db.execute(sql`
      SELECT s.weight_kg AS "weightKg", s.reps
      FROM sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId} AND s.done = 1
        AND ws.finished_at IS NOT NULL
      ORDER BY s.weight_kg DESC NULLS LAST
      LIMIT 1
    `)
    const pr = prResult.rows[0] as { weightKg: number | null; reps: number | null } | undefined

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

    const freqResult = await this.db.execute(sql`
      SELECT COUNT(DISTINCT to_char(to_timestamp(started_at), 'IYYY-"W"IW')) AS weeks_active
      FROM workout_sessions
      WHERE user_id = ${userId}
        AND finished_at IS NOT NULL
        AND started_at > extract(epoch from now() - interval '4 weeks')
    `)
    const weeklyFrequency = Number((freqResult.rows[0] as { weeks_active: string })?.weeks_active ?? 0)

    const sessionCountResult = await this.db.execute(sql`
      SELECT COUNT(DISTINCT s.session_id) AS cnt
      FROM sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId}
        AND s.done = 1 AND ws.finished_at IS NOT NULL
    `)
    const sessionCount = Number((sessionCountResult.rows[0] as { cnt: string })?.cnt ?? 0)

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
    const lastTwoSessions = lastTwoResult.rows as { weightKg: number | null; reps: number | null }[]

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
    const categoryWeeklySetCount = Math.round(
      Number((catSetsResult.rows[0] as { avg_sets: string })?.avg_sets ?? 0),
    )

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
    const consecutiveWeeksActive = Number(
      (consWeeksResult.rows[0] as { consecutive: string })?.consecutive ?? 1,
    )

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
  }

  async getUserContext(userId: string): Promise<UserContext> {
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
}
```

- [ ] **Step 2: Create ProgressionPromptBuilder**

Create `apps/api/src/progression/progression-prompt.builder.ts`:

```typescript
import { ExerciseContext, UserContext } from './exercise-history.service'

export class ProgressionPromptBuilder {
  static buildSituationSummary(
    exercises: ExerciseContext[],
    user: Pick<UserContext, 'experienceLevel' | 'latestBodyWeightKg' | 'goal' | 'trainingPhase'>,
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
        `${ex.consecutiveWeeksActive} weeks active, ` +
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

  static buildPrompt(
    exercises: ExerciseContext[],
    user: UserContext,
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
}
```

- [ ] **Step 3: Update progression.service.spec.ts**

Replace the entire content of `apps/api/src/progression/progression.service.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ProgressionPromptBuilder } from './progression-prompt.builder'

describe('ProgressionPromptBuilder.buildPrompt', () => {
  it('includes exercise block with id, name, and session sets', () => {
    const result = ProgressionPromptBuilder.buildPrompt(
      [{
        exerciseId: 'bench-id',
        name: 'Bench Press',
        category: 'push',
        lastSets: [{ setNumber: 1, weightKg: 80, reps: 8, rpe: null }],
        prWeightKg: 90,
        prReps: 3,
        weeklyVolumes: [{ week: '2026-W20', volume: 1920 }],
        weeklyFrequency: 2,
        sessionCount: 5,
        lastTwoSessions: [],
        categoryWeeklySetCount: 10,
        hoursSinceCategorySession: null,
        consecutiveWeeksActive: 4,
      }],
      { age: 32, heightCm: 180, experienceLevel: 'intermediate', latestBodyWeightKg: 82, goal: null, trainingPhase: null },
    )
    expect(result).toContain('[bench-id] Bench Press (push)')
    expect(result).toContain('set1 80kg×8')
    expect(result).toContain('PR: 90kg × 3 reps')
    expect(result).toContain('4-week volume: 1920kg')
    expect(result).toContain('Age: 32')
  })

  it('shows "insufficient data" when no weekly volumes', () => {
    const result = ProgressionPromptBuilder.buildPrompt(
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
    )
    expect(result).toContain('4-week volume: insufficient data')
    expect(result).toContain('PR: none recorded')
    expect(result).toContain('No profile data available')
  })
})

describe('ProgressionPromptBuilder.buildSituationSummary', () => {
  it('includes experience level, goal, training phase, and body weight', () => {
    const result = ProgressionPromptBuilder.buildSituationSummary(
      [],
      { experienceLevel: 'intermediate', latestBodyWeightKg: 82, goal: 'hypertrophy', trainingPhase: 'accumulation' },
    )
    expect(result).toContain('intermediate')
    expect(result).toContain('82kg')
    expect(result).toContain('hypertrophy')
    expect(result).toContain('accumulation')
  })

  it('includes exercise name, volume trend, session count, and category session gap', () => {
    const result = ProgressionPromptBuilder.buildSituationSummary(
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

describe('ProgressionPromptBuilder.buildPrompt with coaching chunks', () => {
  it('includes COACHING PRINCIPLES section when chunks are provided', () => {
    const result = ProgressionPromptBuilder.buildPrompt(
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
    const result = ProgressionPromptBuilder.buildPrompt(
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

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/api && npx vitest run src/progression/progression.service.spec.ts 2>&1 | tail -15
```

Expected: all tests pass (the logic is identical, only the import changed).

- [ ] **Step 5: Rewrite ProgressionService to use the new layers**

Replace the entire content of `apps/api/src/progression/progression.service.ts`:

```typescript
import { randomUUID } from 'crypto'

import { Injectable, Inject, Logger } from '@nestjs/common'
import { eq, and, isNotNull } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CoachingKnowledgeService } from '../coaching/coaching-knowledge.service'
import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { GeminiAdapter } from '../gemini/gemini.adapter'
import { ExerciseContext, ExerciseHistoryService } from './exercise-history.service'
import { ProgressionPromptBuilder } from './progression-prompt.builder'

type GeminiSuggestionRaw = {
  exerciseId: string
  suggestedSets: number
  suggestedReps: number
  suggestedWeightKg: number
  reason: string
  evidence: string[]
}

const SUGGESTION_SCHEMA = {
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
        required: ['exerciseId', 'suggestedSets', 'suggestedReps', 'suggestedWeightKg', 'reason', 'evidence'],
      },
    },
  },
  required: ['suggestions'],
}

@Injectable()
export class ProgressionService {
  private readonly logger = new Logger(ProgressionService.name)

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private readonly history: ExerciseHistoryService,
    private readonly coachingKnowledge: CoachingKnowledgeService,
    private readonly gemini: GeminiAdapter,
  ) {}

  async generateForSession(sessionId: string, userId: string): Promise<void> {
    const doneRows = await this.db
      .selectDistinct({ exerciseId: schema.sets.exerciseId })
      .from(schema.sets)
      .where(and(eq(schema.sets.sessionId, sessionId), eq(schema.sets.done, 1), isNotNull(schema.sets.exerciseId)))

    if (doneRows.length === 0) return

    const [userCtx, ...exerciseContexts] = await Promise.all([
      this.history.getUserContext(userId),
      ...doneRows.map(r => this.history.buildExerciseContext(r.exerciseId!, userId, sessionId)),
    ])

    const validContexts = exerciseContexts.filter((c): c is ExerciseContext => c !== null)
    if (validContexts.length === 0) return

    const situationSummary = ProgressionPromptBuilder.buildSituationSummary(validContexts, userCtx)
    let coachingChunks: string[] = []
    try {
      coachingChunks = await this.coachingKnowledge.retrieveForSituation(situationSummary)
    } catch (err) {
      this.logger.warn('Coaching knowledge retrieval failed, proceeding without coaching context', err)
    }

    const prompt = ProgressionPromptBuilder.buildPrompt(validContexts, userCtx, coachingChunks)

    let result: { suggestions: GeminiSuggestionRaw[] }
    try {
      result = (await this.gemini.generate('progression', prompt, { schema: SUGGESTION_SCHEMA })) as {
        suggestions: GeminiSuggestionRaw[]
      }
    } catch (err) {
      this.logger.error(`Gemini call failed for session ${sessionId}`, err)
      return
    }

    const now = Math.floor(Date.now() / 1000)
    for (const s of result.suggestions ?? []) {
      if (!s.exerciseId || !s.suggestedSets || !s.suggestedReps || !s.suggestedWeightKg || !s.evidence) continue
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
            suggestedSets: s.suggestedSets,
            suggestedReps: s.suggestedReps,
            suggestedWeightKg: s.suggestedWeightKg,
            reason: s.reason,
            evidence: JSON.stringify(s.evidence),
            createdAt: now,
          },
        })
    }

    this.logger.log(`Generated ${result.suggestions.length} progression suggestions for session ${sessionId}`)
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
}
```

- [ ] **Step 6: Update ProgressionModule**

Replace `apps/api/src/progression/progression.module.ts`:

```typescript
import { Module } from '@nestjs/common'

import { CoachingModule } from '../coaching/coaching.module'
import { ExerciseHistoryService } from './exercise-history.service'
import { ProgressionController } from './progression.controller'
import { ProgressionService } from './progression.service'

@Module({
  imports: [CoachingModule],
  controllers: [ProgressionController],
  providers: [ProgressionService, ExerciseHistoryService],
  exports: [ProgressionService],
})
export class ProgressionModule {}
```

- [ ] **Step 7: Verify build and run all tests**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -30
npx vitest run src/progression/ 2>&1 | tail -20
```

Expected: no build errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/progression/
git commit -m "refactor: split ProgressionService into ExerciseHistoryService + ProgressionPromptBuilder (candidate 2)"
```

---

## Task 6: Wire ProgramService to GeminiAdapter

**Files:**
- Modify: `apps/api/src/program/program.service.ts`

- [ ] **Step 1: Update ProgramService to inject and use GeminiAdapter**

In `apps/api/src/program/program.service.ts`:

Remove: `import { ConfigService } from '@nestjs/config'`
Remove: `private readonly geminiApiKey: string` field
Remove: `config: ConfigService` constructor parameter and the `this.geminiApiKey = config.getOrThrow(...)` line

Add import: `import { GeminiAdapter } from '../gemini/gemini.adapter'`

Add injection in constructor:
```typescript
private readonly gemini: GeminiAdapter,
```

Replace the private `callGemini` method. The current method:
```typescript
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
```

Replace with a one-liner:
```typescript
private callGemini(prompt: string): Promise<unknown> {
  return this.gemini.generate('program', prompt)
}
```

Remove the `GEMINI_URL` constant at the top of the file.

- [ ] **Step 2: Verify build**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/program/program.service.ts \
        apps/api/src/program/program.module.ts
git commit -m "refactor: wire ProgramService to GeminiAdapter (candidate 1)"
```

---

## Task 7: Wire EquipmentService to GeminiAdapter

**Files:**
- Modify: `apps/api/src/equipment/equipment.service.ts`
- Modify: `apps/api/src/equipment/equipment.module.ts`

- [ ] **Step 1: Update EquipmentService to inject GeminiAdapter**

In `apps/api/src/equipment/equipment.service.ts`:

Remove: `import { ConfigService } from '@nestjs/config'`
Remove: `private readonly geminiApiKey: string` field
Remove: `config: ConfigService` from constructor params and `this.geminiApiKey = config.getOrThrow(...)` from constructor body

Add import: `import { GeminiAdapter, GenerateOptions } from '../gemini/gemini.adapter'`

Add to constructor:
```typescript
private readonly gemini: GeminiAdapter,
```

Replace the `analyze()` method body. Find the section that does `const response = await fetch(...)` through `return { equipment: parsed.equipment, exercises }`.

The new `analyze()` method:

```typescript
async analyze(
  userId: string,
  buffer: Buffer,
  mimeType: string,
  equipmentType: string,
  description: string,
): Promise<AnalyzeSuggestion> {
  const base64 = buffer.toString('base64')
  const promptText =
    `Analyze this gym equipment photo. Equipment type: ${equipmentType}. User description: ${description}.\n\n` +
    `List all exercises that can be performed with this equipment. ` +
    `Describe each exercise's body position accurately based on what the equipment shows (e.g. seated, lying, standing, incline) — do not assume a default position if the equipment clearly shows otherwise. ` +
    `Also suggest a concise name for this specific equipment instance (e.g. "Left Cable Tower", "Adjustable Incline Bench").`

  const schema = {
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
            category: { type: 'STRING', enum: ['push', 'pull', 'legs', 'core', 'cardio', 'other'] },
            equipmentType: { type: 'STRING', enum: ['barbell', 'dumbbell', 'machine', 'bodyweight', 'cable', 'other'] },
            tags: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['name', 'category', 'equipmentType', 'tags'],
        },
      },
    },
    required: ['equipment', 'exercises'],
  }

  let parsed: GeminiParsed
  try {
    parsed = (await this.gemini.generate('equipment', promptText, {
      schema,
      image: { base64, mimeType },
    })) as GeminiParsed
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
```

Also remove the now-unused `AiLogService` import and constructor injection from `EquipmentService` (since GeminiAdapter handles logging internally). Remove `private readonly aiLog: AiLogService` from the constructor.

Also remove the `GEMINI_URL` constant and the `GeminiRaw` type at the top.

The constructor after changes:
```typescript
constructor(
  @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
  private config: ConfigService,
  private readonly gemini: GeminiAdapter,
) {
  this.photosDir = config.getOrThrow<string>('PHOTOS_DIR')
}
```

- [ ] **Step 2: Update EquipmentModule**

In `apps/api/src/equipment/equipment.module.ts` — `GeminiModule` is `@Global()` so no import needed. Just confirm the file looks like:

```typescript
import { Module } from '@nestjs/common'

import { EquipmentController } from './equipment.controller'
import { EquipmentService } from './equipment.service'

@Module({
  controllers: [EquipmentController],
  providers: [EquipmentService],
})
export class EquipmentModule {}
```

- [ ] **Step 3: Verify build**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/equipment/equipment.service.ts \
        apps/api/src/equipment/equipment.module.ts
git commit -m "refactor: wire EquipmentService to GeminiAdapter, separate Analysis Suggestion surface (candidates 1 + 5)"
```

---

## Task 8: Create SessionEventService

**Files:**
- Create: `apps/api/src/workouts/session-event.service.ts`
- Modify: `apps/api/src/workouts/workouts.service.ts`
- Modify: `apps/api/src/workouts/workouts.module.ts`

- [ ] **Step 1: Create SessionEventService**

Create `apps/api/src/workouts/session-event.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common'

import { ProgressionService } from '../progression/progression.service'
import { ProgramService } from '../program/program.service'

@Injectable()
export class SessionEventService {
  private readonly logger = new Logger(SessionEventService.name)

  constructor(
    private readonly progression: ProgressionService,
    private readonly program: ProgramService,
  ) {}

  onSessionFinished(sessionId: string, userId: string): void {
    this.progression.generateForSession(sessionId, userId).catch(err => {
      this.logger.error(`Progression generation failed for session ${sessionId}`, err)
    })

    this.program.evaluateAfterSession(sessionId, userId).catch(err => {
      this.logger.error(`Program adaptation evaluation failed for session ${sessionId}`, err)
    })
  }
}
```

- [ ] **Step 2: Update WorkoutsService to use SessionEventService**

In `apps/api/src/workouts/workouts.service.ts`:

Remove imports: `ProgressionService`, `ProgramService`
Add import: `import { SessionEventService } from './session-event.service'`

Replace constructor injection:
```typescript
constructor(
  @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
  private readonly sessionEvents: SessionEventService,
) {}
```

Update `finishSession()`. Replace the fire-and-forget block:

Before:
```typescript
this.progressionService.generateForSession(id, userId).catch(err => {
  this.logger.error(`Progression generation failed for session ${id}`, err)
})

this.programService.evaluateAfterSession(id, userId).catch(err => {
  this.logger.error(`Program adaptation evaluation failed for session ${id}`, err)
})
```

After:
```typescript
this.sessionEvents.onSessionFinished(id, userId)
```

- [ ] **Step 3: Update WorkoutsModule**

Replace `apps/api/src/workouts/workouts.module.ts`:

```typescript
import { Module } from '@nestjs/common'

import { ProgressionModule } from '../progression/progression.module'
import { ProgramModule } from '../program/program.module'
import { WorkoutsController } from './workouts.controller'
import { WorkoutsService } from './workouts.service'
import { SessionEventService } from './session-event.service'

@Module({
  imports: [ProgressionModule, ProgramModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService, SessionEventService],
})
export class WorkoutsModule {}
```

- [ ] **Step 4: Verify build**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
cd apps/api && npx vitest run 2>&1 | tail -20
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/workouts/
git commit -m "refactor: extract SessionEventService to own post-session hook dispatcher (candidate 4)"
```

---

## Self-Review

**Spec coverage check:**

| Candidate | Coverage |
|-----------|----------|
| 1. GeminiAdapter with 429 fallback + AiLog | Task 3 (adapter), Tasks 6+7 (wiring). Logger preserved. |
| 2. ProgressionService split | Task 5 (ExerciseHistoryService + ProgressionPromptBuilder + slimmed ProgressionService). |
| 3. CoachingModule | Task 4 (new module, moved files, updated imports). |
| 4. SessionEventService | Task 8 (service created, WorkoutsService updated). |
| 5. Equipment analysis separation | Task 7 (analyze() uses GeminiAdapter; create() unchanged). |
| 6a. GymService fold | Task 1. |
| 6b. SessionRepository fold | Task 2. |

**Placeholder scan:** No TBDs, no "fill in details" steps. All code is complete.

**Type consistency:**
- `ExerciseContext` and `UserContext` are defined in `exercise-history.service.ts` and imported by `progression-prompt.builder.ts` and `progression.service.ts` — consistent.
- `GeminiAdapter.generate()` returns `Promise<unknown>` — callers cast with `as` — consistent across Tasks 5, 6, 7.
- `GenerateOptions` exported from `gemini.adapter.ts` — imported by `equipment.service.ts` in Task 7 — consistent.
- `SessionEventService.onSessionFinished` is `void` (fire-and-forget by design) — consistent with usage in `workouts.service.ts`.
