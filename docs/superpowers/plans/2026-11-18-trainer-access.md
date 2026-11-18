# Trainer Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Trainer (a User linked to athletes in server config) can act as an athlete in the web app: write their plan, read their logs, nothing else.

**Architecture:** `TRAINER_LINKS` env is parsed into `AuthConfig`. The `AuthGuard` reads an `X-Act-As` header, checks the link and the route's `@TrainerAccess` marking, then sets `req.user` to the **athlete** and `req.actor` to the Trainer — so every existing service, which scopes by `req.user.id`, works unchanged. The web app keeps the acting athlete in a sessionStorage zustand store, the API client adds the header, a banner shows it, and pages hide what the access list forbids.

**Tech Stack:** NestJS 11 + Fastify, drizzle (Postgres), vitest; React + TanStack Router/Query, zustand, react-i18next, sonner.

**Spec:** `docs/adr/0013-trainer-access-by-acting-as.md` and CONTEXT.md terms **Trainer**, **Acting as**.

## Global Constraints

- Env format: `TRAINER_LINKS=trainerId:athleteId,trainerId:athleteId` (e.g. `default-user:inna`). Empty/unset = no Trainers.
- Header: `X-Act-As: <athleteId>`. Ignored on `@Public()` routes and when equal to the caller's own id.
- Deny by default: a route works while acting only with `@TrainerAccess('read' | 'write')`. `'read'` only on GET routes.
- 403 bodies while acting: `{ statusCode: 403, message: 'Not authorised', reason: 'trainer-access' }` (route not allowed) and `{ ..., reason: 'not-your-athlete' }` (no link). Never include an email.
- Never log emails or tokens (existing guard rule).
- i18n: every new string in both `uk` and `en`, new namespace `trainer` (see `docs/agents/i18n.md`).
- Commit messages: Conventional Commits, **no** `Co-Authored-By` line (repo CLAUDE.md).

## Review Focus

1. **A refused route while acting must not blank the app.** Today any 403 calls `handleForbidden` → full-screen "not authorised". A `reason: 'trainer-access'` 403 must show a toast instead. → Task 5 test.
2. **Link removed while a tab is still acting.** Next request answers `not-your-athlete`; the app must leave acting mode, clear the cache, and carry on as the Trainer. → Task 5 test.
3. **Athlete without a finished onboarding.** The onboarding gate would redirect the Trainer to `/onboarding` and make them onboard the athlete. While acting, the gate must not redirect. → Task 7 test.
4. **Stale data across switches.** Query keys carry no User; entering, switching and exiting acting must each clear the query cache before the next fetch. → Task 5 test.
5. **A new route added later.** It must be refused while acting until classified. → Task 3 route-table test fails on any unclassified route.

---

### Task 1: Parse `TRAINER_LINKS` and check it at boot

**Files:**
- Modify: `apps/api/src/auth/auth.config.ts`, `apps/api/src/auth/auth.module.ts` (add `'TRAINER_LINKS'` to `ENV_KEYS`)
- Create: `apps/api/src/seed/trainer-links.ts`
- Modify: `apps/api/src/seed/seed.service.ts` (call after `applyHouseholdEmails`)
- Test: `apps/api/src/auth/auth.config.spec.ts`, `apps/api/src/seed/trainer-links.spec.ts`

**Interfaces:**
- Produces: `export type TrainerLink = { trainerId: string; athleteId: string }`; both `AuthConfig` variants gain `trainerLinks: TrainerLink[]`.
- Produces: `export function athletesOf(config: AuthConfig, userId: string): string[]` and `trainersOf(config, userId): string[]` in `auth.config.ts`.
- Produces: `export async function assertTrainerLinks(db: NodePgDatabase<typeof schema>, links: TrainerLink[]): Promise<void>` — throws `Error('TRAINER_LINKS names unknown User "<id>"')` for the first id not in `users`.

- [ ] **Step 1: Write failing tests** in `auth.config.spec.ts`:
  - `parses TRAINER_LINKS in both modes` — `' default-user : inna ,a:b'` → `[{trainerId:'default-user',athleteId:'inna'},{trainerId:'a',athleteId:'b'}]`; unset → `[]`.
  - `drops duplicate links` — `'a:b,a:b'` → one link.
  - `refuses a malformed entry` — `'a'`, `'a:'`, `':b'` each throw `/TRAINER_LINKS/`.
  - `refuses a self-link` — `'a:a'` throws `/TRAINER_LINKS/`.
  - `athletesOf / trainersOf` — links `a:b,a:c,d:b` → `athletesOf(cfg,'a')` = `['b','c']`, `trainersOf(cfg,'b')` = `['a','d']`.
  In `trainer-links.spec.ts` (fake db from `../testing/fake-db`): resolves when all ids exist; rejects with `/unknown User "ghost"/` for `a:ghost`.
- [ ] **Step 2:** Run `cd apps/api && npx vitest run src/auth/auth.config.spec.ts src/seed/trainer-links.spec.ts` — FAIL.
- [ ] **Step 3:** Implement. Ids are trimmed, case-sensitive (they are User ids).
- [ ] **Step 4:** Re-run — PASS. Run whole API suite `cd apps/api && npx vitest run` — PASS (existing tests building `AuthConfig` literals need `trainerLinks: []`; `testing/access-tokens.ts` `cloudflareTestConfig` too).
- [ ] **Step 5:** Commit `feat(auth): TRAINER_LINKS config`.

### Task 2: Acting in the guard

**Files:**
- Create: `apps/api/src/auth/trainer-access.decorator.ts`
- Modify: `apps/api/src/auth/access.guard.ts`, `apps/api/src/auth/request.types.ts`
- Test: `apps/api/src/auth/acting.spec.ts` (pattern: `two-users.spec.ts` — fake db, `createAuthedApp`, signed tokens, `WorkoutsController`)

**Interfaces:**
- Consumes: `trainerLinks` from Task 1.
- Produces: `export const TRAINER_ACCESS = 'auth:trainerAccess'`; `export type TrainerAccessLevel = 'read' | 'write'`; `export const TrainerAccess = (level: TrainerAccessLevel) => SetMetadata(TRAINER_ACCESS, level)` (method or class level, method wins — `getAllAndOverride`).
- Produces: `AuthenticatedRequest = FastifyRequest & { user: AuthUser; actor?: AuthUser }` — `actor` set only while acting.

Guard, after resolving the signed-in User (not for Agent or `@Public`):
1. header `x-act-as` trimmed; absent/empty or equal to own id → done as today.
2. not in `athletesOf(config, user.id)` → 403 `reason: 'not-your-athlete'`.
3. route has no `TRAINER_ACCESS` metadata → 403 `reason: 'trainer-access'`.
4. load the athlete (`findUser`), set `req.actor = user`, `req.user = athlete`. Log `Acting: <trainerId> as <athleteId> <METHOD> <route>` at debug, ids only.

- [ ] **Step 1: Write failing tests** (links `u1:u2`, mark `getTemplates` with `@TrainerAccess('read')` via a tiny test controller rather than touching real controllers — Task 3 marks those):
  - `u1 acting as u2 lists u2's templates` — `GET /api/templates` with `x-act-as: u2` → `['Legs (u2)']`.
  - `refuses acting as a non-athlete` — u2 with `x-act-as: u1` → 403, body `reason: 'not-your-athlete'`.
  - `refuses an unmarked route while acting` — u1 `x-act-as: u2` on an unmarked route → 403 `reason: 'trainer-access'`.
  - `ignores x-act-as naming yourself` — u1 `x-act-as: u1` → u1's data, 200.
  - `the Agent's routes ignore x-act-as` — unchanged 200 on an `@AgentOnly` route with the header.
  - `works in dev mode` — `x-dev-user: u1` + `x-act-as: u2`.
- [ ] **Step 2:** `npx vitest run src/auth/acting.spec.ts` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run, then full API suite — PASS.
- [ ] **Step 5:** Commit `feat(auth): act as an athlete with X-Act-As`.

### Task 3: Classify every route

**Files:**
- Modify: every `*.controller.ts` listed below (add `@TrainerAccess`)
- Test: `apps/api/src/auth/trainer-routes.spec.ts`
- Modify: `docs/adr/0013-trainer-access-by-acting-as.md`, `CONTEXT.md` — "the weekly Schedule" → "Schedules (weekly and one-off)", since `POST /schedules` creates both.

**Interfaces:** Consumes `TRAINER_ACCESS` from Task 2.

The table (anything not listed = unmarked = denied):

| Level | Routes |
|---|---|
| write | `POST/PATCH/DELETE templates…`, `POST templates/:id/exercises`; `POST/DELETE schedules…`; `PATCH profile`; `POST/PATCH exercises`, `POST exercises/:id/restore`, `DELETE exercises/:id` (shared library + per-User notes) |
| read | `GET templates`, `templates/:id`; `GET sessions`, `sessions/active`, `sessions/:id`, `sessions/:id/comparison`; `GET sessions/:sessionId/sets`; `GET schedules`, `schedules/today`; `GET profile`; `GET program`; `GET exercises`, `exercises/:id`, `:id/last-sets`, `:id/image`, `:id/thumb`; `GET equipment`, `equipment/:id/photo`, `equipment/:id/thumb`; `GET stats/prs`, `volume`, `streak`, `bodyweight`, `frequency`; `GET body/weight`; `GET me` |
| denied | sessions start/finish/delete, all set writes, all `program` POST/DELETE incl. `updates/:id/acknowledge` and `generate/preview`, all `photos`, `body/measurements` (GET+POST), `POST body/weight`, `stats/measurements`, all equipment writes and `analyze`, `progression-suggestion`, `ai-log`, `agent/*`, `health` |

- [ ] **Step 1: Write failing test** `every route is classified for Trainers`: load all controllers with `import.meta.glob('../**/*.controller.ts', { eager: true })`, collect each handler's `"METHOD /path"` (Nest `PATH_METADATA` + `METHOD_METADATA` from `@nestjs/common/constants`, controller prefix + method path) and its `TRAINER_ACCESS` level or `'denied'`. `expect(actual).toEqual(EXPECTED)` where `EXPECTED` is the table above written out as a literal map. Second test: `no 'read' marking on a non-GET route`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Add the decorators.
- [ ] **Step 4:** Run, then full API suite — PASS.
- [ ] **Step 5:** Commit `feat(api): mark what a Trainer may read and write` (incl. the ADR/CONTEXT wording).

### Task 4: `/me` names athletes and Trainers

**Files:**
- Modify: `packages/shared/src/models.ts`, `apps/api/src/auth/me.controller.ts`
- Test: extend `apps/api/src/auth/acting.spec.ts`

**Interfaces:**
- Produces: `export type Me = AuthUser & { athletes: AuthUser[]; trainers: AuthUser[] }` in shared.
- `GET /api/me` → `Me` for `req.actor ?? req.user` (always the signed-in person, even while acting). Names come from `users`, sorted by `displayName`.

- [ ] **Step 1: Failing tests:** u1 (links `u1:u2`) → `{ id:'u1', displayName:'User One', athletes:[{id:'u2',displayName:'User Two'}], trainers:[] }`; u2 → `athletes: [], trainers: [u1]`; u1 with `x-act-as: u2` → still u1's `Me`. Update the existing `/api/me` expectation in `two-users.spec.ts`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement (inject `AUTH_CONFIG` + `DATABASE` into the controller; no new service needed). **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(auth): /me lists athletes and Trainers`.

### Task 5: Web — acting state, header, cache, 403s

**Files:**
- Create: `apps/web/src/stores/acting.store.ts`, `apps/web/src/stores/acting.store.test.ts`
- Modify: `apps/web/src/api/client.ts`, `apps/web/src/api/client.test.ts`, `apps/web/src/api/me.ts` (`get` returns `Me`), `apps/web/src/lib/identity.ts`

**Interfaces:**
- Produces: `useActingStore` — zustand with `persist` on **sessionStorage** (key `gymtracker-acting`), state `{ athlete: AuthUser | null }`.
- Produces: `startActing(queryClient: QueryClient, athlete: AuthUser): void` and `stopActing(queryClient: QueryClient): void` — each sets the store, calls `queryClient.clear()`, then the caller navigates to `/dashboard`.
- Produces: `useActing(): { athlete: AuthUser | null; acting: boolean }`.
- Client: when `athlete` is set, every request adds `X-Act-As: athlete.id`. On 403 with `body.reason === 'trainer-access'` → `toast.error(t('trainer:notWhileActing', { name }))`, no `handleForbidden`. On 403 `reason === 'not-your-athlete'` → `stopActing(queryClient)` (import the app's `queryClient` singleton) and `toast`; no `handleForbidden`. Other 403s as today.
- `syncIdentity`: if the store holds an athlete not in `me.athletes`, `stopActing`.

- [ ] **Step 1: Failing tests:**
  - `client.test.ts`: `adds X-Act-As while acting`; `no X-Act-As when not acting`; `a trainer-access 403 toasts and leaves auth status ok`; `a not-your-athlete 403 stops acting and clears the cache`.
  - `acting.store.test.ts`: `startActing and stopActing each clear the query cache` (seed a query, assert gone); `state is kept in sessionStorage, not localStorage`.
- [ ] **Step 2:** `cd apps/web && npx vitest run src/api/client.test.ts src/stores/acting.store.test.ts` — FAIL.
- [ ] **Step 3:** Implement; add `trainer` namespace (uk + en) with `notWhileActing`, `linkGone`.
- [ ] **Step 4:** Re-run, then `npm test --workspace=apps/web` — PASS.
- [ ] **Step 5:** Commit `feat(web): acting state and X-Act-As`.

### Task 6: Web — banner, "Act as…", "Your Trainer"

**Files:**
- Create: `apps/web/src/components/trainer/ActingBanner.tsx`, `apps/web/src/components/trainer/AthletePicker.tsx`, tests beside them
- Modify: `apps/web/src/components/layout/AppLayout.tsx` (banner above `<main>`), `apps/web/src/routes/settings.tsx`
- Modify: `apps/web/src/locales/{uk,en}/trainer.json`

**Interfaces:** Consumes `useActing`, `startActing`, `stopActing` (Task 5), `Me` (Task 4) via `useQuery({ queryKey: queryKeys.me(), queryFn: meApi.get })` — add `me` to `queryKeys.ts`.

- Banner: shown only while acting; text `t('trainer:banner', { name })` ("Viewing Inna" / "Перегляд: Inna"), button `t('trainer:exit')` → `stopActing` + navigate `/dashboard`. Visually distinct (primary background), always visible, does not scroll away.
- Settings, top: section `t('trainer:athletes')` listing `me.athletes`, each a button → `startActing`; rendered only when `athletes.length > 0` and not acting. Section `t('trainer:yourTrainers')` with names, only when `trainers.length > 0`.

- [ ] **Step 1: Failing tests:** `banner hidden when not acting`; `banner names the athlete and Exit stops acting`; `Settings shows athletes only for a Trainer`; `Settings shows "Your Trainer" for an athlete`; `uk and en trainer.json have identical key sets`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run web suite — PASS.
- [ ] **Step 5:** Commit `feat(web): act-as banner and athlete picker`.

### Task 7: Web — hide what a Trainer may not do

**Files:**
- Create: `apps/web/src/lib/acting-policy.ts`, `apps/web/src/lib/acting-policy.test.ts`
- Modify: `apps/web/src/router.tsx`, `apps/web/src/components/layout/AppLayout.tsx`, `apps/web/src/routes/{dashboard,workout.start,history,history.$sessionId,program,body,calendar}.tsx`

**Interfaces:**
- Produces: `export const ROUTES_BLOCKED_WHILE_ACTING = ['/photos', '/gym', '/ai-log', '/onboarding', '/workout/$sessionId'] as const` and `export function isBlockedWhileActing(pathname: string): boolean` (`/workout/start` and `/workout/template/*` are **not** blocked).
- Router: in `layoutRoute.beforeLoad`, while acting: blocked path → `redirect({ to: '/dashboard' })`; skip the onboarding-gate redirect entirely.
- AppLayout: nav items unchanged (none of the 6 is blocked).
- Pages, while acting (`useActing().acting`), hide:
  - dashboard / workout.start: every Start / Resume Session control and the active-Session card's link into the logger;
  - history, history.$sessionId: delete Session;
  - program: generate, abandon, evaluate, accept/dismiss of Program Updates;
  - body: add Body Weight, the measurements section, the link to Photos;
  - calendar: Session Repeat start (creating a Schedule stays).

- [ ] **Step 1: Failing tests:** `acting-policy.test.ts` — `isBlockedWhileActing('/workout/abc')` true, `('/workout/start')` false, `('/workout/template/t1')` false, `('/photos')` true, `('/dashboard')` false. Plus one render test per touched page family where a test file exists today (e.g. extend or add `dashboard.test.tsx`: `no Start Session button while acting`).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run web suite, `npm run lint`, `npm run format:check`, `npm run build` — all PASS.
- [ ] **Step 5:** Commit `feat(web): hide what a Trainer may not do while acting`.

### Task 8: Ship config

**Files:**
- Modify: `apps/api/.env.example` (or wherever env vars are documented — grep `HOUSEHOLD_EMAILS`), `DEPLOY.md`

- [ ] **Step 1:** Document `TRAINER_LINKS` next to `HOUSEHOLD_EMAILS`, with the format and that a restart applies changes.
- [ ] **Step 2:** Manual check in dev: `TRAINER_LINKS=default-user:inna npm run dev`; in Settings pick Inna → banner; edit one of Inna's Templates; open History (no delete); open `/photos` directly → back on dashboard; Exit → own data.
- [ ] **Step 3:** Commit `docs: TRAINER_LINKS`.
- Deploy (setting `TRAINER_LINKS=default-user:inna` on the server and restarting) is a separate step, done only on Viktor's go.
