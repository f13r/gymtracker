# GymTracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a self-hosted gym tracking web app — mobile-first logger + desktop stats — running locally on macOS (no Docker).

**Architecture:** NestJS 11 + Fastify API (port 3000) + Vite React 19 frontend (port 5173) in an npm monorepo. SQLite via Drizzle ORM. Vite proxies `/api/*` to the NestJS server.

**Tech Stack:** React 19, Vite 6, TanStack Query v5, TanStack Router v1, Zustand v5, Tailwind v4, shadcn/ui, NestJS 11, Drizzle ORM, better-sqlite3, nestjs-zod, Sharp, Recharts, vaul, react-wheel-picker

---

## Phase 1 — Repo Scaffold

### Task 1: Root monorepo setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

**Step 1: Create root package.json**

```json
{
  "name": "gymtracker",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "concurrently -n api,web -c blue,green \"npm run dev --workspace=apps/api\" \"npm run dev --workspace=apps/web\"",
    "build": "npm run build --workspaces",
    "db:migrate": "npm run db:migrate --workspace=apps/api",
    "db:studio": "npm run db:studio --workspace=apps/api"
  },
  "devDependencies": {
    "concurrently": "^9.x",
    "typescript": "^5.6.0"
  }
}
```

**Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Step 3: Create `.gitignore`**

```
node_modules/
dist/
.env
data/sqlite/
data/photos/
*.db
*.db-wal
*.db-shm
```

**Step 4: Install root deps**

```bash
npm install
```

**Step 5: Commit**

```bash
git init
git add package.json tsconfig.base.json .gitignore
git commit -m "chore: init monorepo root"
```

---

### Task 2: packages/shared scaffold

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

**Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@gymtracker/shared",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "*"
  },
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

**Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["src"]
}
```

**Step 3: Create `packages/shared/src/index.ts`** (empty barrel for now)

```typescript
export * from './exercise.schema.js';
export * from './workout.schema.js';
export * from './set.schema.js';
export * from './body.schema.js';
```

**Step 4: Create stub schema files** (will be filled in Phase 2):

```bash
touch packages/shared/src/exercise.schema.ts
touch packages/shared/src/workout.schema.ts
touch packages/shared/src/set.schema.ts
touch packages/shared/src/body.schema.ts
```

**Step 5: Commit**

```bash
git add packages/
git commit -m "chore: add packages/shared scaffold"
```

---

### Task 3: apps/api NestJS scaffold

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`

**Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@gymtracker/api",
  "version": "0.0.1",
  "type": "commonjs",
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-fastify": "^11.0.0",
    "@nestjs/serve-static": "^5.0.0",
    "@nestjs/config": "^4.0.0",
    "nestjs-zod": "^3.0.0",
    "zod": "^3.23.0",
    "drizzle-orm": "^0.36.0",
    "better-sqlite3": "^12.0.0",
    "sharp": "^0.33.0",
    "@fastify/multipart": "^9.0.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0",
    "@gymtracker/shared": "*"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "drizzle-kit": "^0.28.0",
    "typescript": "*"
  }
}
```

**Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "./dist",
    "rootDir": "./src",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false
  },
  "include": ["src"]
}
```

**Step 3: Create `apps/api/src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import multipart from '@fastify/multipart';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });
  app.useGlobalPipes(new ZodValidationPipe());
  app.setGlobalPrefix('api');

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`API running on http://localhost:${port}`);
}

bootstrap();
```

**Step 4: Create `apps/api/src/app.module.ts`** (minimal for now)

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
  ],
})
export class AppModule {}
```

**Step 5: Create `apps/api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

**Step 6: Create `apps/api/.env`**

```
DATABASE_URL=../../data/sqlite/app.db
PHOTOS_DIR=../../data/photos
PORT=3000
```

**Step 7: Create data directories**

```bash
mkdir -p data/sqlite data/photos
```

**Step 8: Install API deps**

```bash
npm install --workspace=apps/api
```

**Step 9: Commit**

```bash
git add apps/api/ data/
git commit -m "chore: scaffold NestJS API"
```

---

### Task 4: apps/web Vite React scaffold

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`

**Step 1: Scaffold with create-vite**

```bash
cd apps/web
npm create vite@latest . -- --template react-ts
cd ../..
```

**Step 2: Replace `apps/web/package.json`**

```json
{
  "name": "@gymtracker/web",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@gymtracker/shared": "*",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-query-persist-client": "^5.0.0",
    "@tanstack/query-sync-storage-persister": "^5.0.0",
    "@tanstack/react-router": "^1.0.0",
    "@tanstack/router-devtools": "^1.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.0.0",
    "zod": "^3.23.0",
    "@hookform/resolvers": "^3.0.0",
    "zustand": "^5.0.0",
    "vaul": "^1.0.0",
    "react-wheel-picker": "latest",
    "recharts": "^3.0.0",
    "lucide-react": "^0.400.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "typescript": "*",
    "vite": "^6.0.0"
  }
}
```

**Step 3: Create `apps/web/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

**Step 4: Create `apps/web/src/main.tsx`** (minimal)

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div>GymTracker</div>
  </StrictMode>,
);
```

**Step 5: Create `apps/web/src/index.css`**

```css
@import "tailwindcss";
```

**Step 6: Install web deps**

```bash
npm install --workspace=apps/web
```

**Step 7: Verify dev server starts**

```bash
npm run dev --workspace=apps/web
```
Expected: Vite dev server at http://localhost:5173

**Step 8: Commit**

```bash
git add apps/web/
git commit -m "chore: scaffold Vite React frontend"
```

---

### Task 5: shadcn/ui init

**Step 1: Run shadcn init from apps/web**

```bash
cd apps/web && npx shadcn@latest init
```

Choose: TypeScript, default style, slate base color, `src/components/ui`, yes to CSS variables, `@/` alias.

**Step 2: Install core components**

```bash
npx shadcn@latest add button card dialog drawer input label select sheet tabs badge toast sonner
```

**Step 3: Commit**

```bash
git add apps/web/src/components/ui/ apps/web/components.json apps/web/src/lib/
git commit -m "feat: init shadcn/ui with core components"
```

---

## Phase 2 — Database & Drizzle

### Task 6: Drizzle schema

**Files:**
- Create: `apps/api/src/drizzle/schema.ts`
- Create: `apps/api/src/drizzle/drizzle.config.ts`

**Step 1: Create `apps/api/src/drizzle/schema.ts`**

```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const exercises = sqliteTable('exercises', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  category: text('category'),
  equipment: text('equipment'),
  notes: text('notes'),
  isDefault: integer('is_default').default(0),
  createdAt: integer('created_at').notNull(),
});

export const workoutTemplates = sqliteTable('workout_templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
});

export const templateExercises = sqliteTable('template_exercises', {
  id: text('id').primaryKey(),
  templateId: text('template_id').references(() => workoutTemplates.id),
  exerciseId: text('exercise_id').references(() => exercises.id),
  orderIndex: integer('order_index').notNull(),
  defaultSets: integer('default_sets'),
  defaultReps: integer('default_reps'),
  defaultWeightKg: real('default_weight_kg'),
});

export const workoutSessions = sqliteTable('workout_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  templateId: text('template_id').references(() => workoutTemplates.id),
  name: text('name').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  notes: text('notes'),
});

export const sets = sqliteTable('sets', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => workoutSessions.id),
  exerciseId: text('exercise_id').references(() => exercises.id),
  setNumber: integer('set_number').notNull(),
  reps: integer('reps'),
  weightKg: real('weight_kg'),
  durationSec: integer('duration_sec'),
  rpe: real('rpe'),
  isWarmup: integer('is_warmup').default(0),
  completedAt: integer('completed_at').notNull(),
});

export const bodyWeights = sqliteTable('body_weights', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  weightKg: real('weight_kg').notNull(),
  recordedAt: integer('recorded_at').notNull(),
  notes: text('notes'),
});

export const bodyMeasurements = sqliteTable('body_measurements', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  recordedAt: integer('recorded_at').notNull(),
  chest: real('chest'),
  waist: real('waist'),
  hips: real('hips'),
  leftBicep: real('left_bicep'),
  rightBicep: real('right_bicep'),
  leftThigh: real('left_thigh'),
  rightThigh: real('right_thigh'),
  shoulders: real('shoulders'),
  neck: real('neck'),
  notes: text('notes'),
});

export const progressPhotos = sqliteTable('progress_photos', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  recordedAt: integer('recorded_at').notNull(),
  filePath: text('file_path').notNull(),
  thumbPath: text('thumb_path').notNull(),
  bodyWeight: real('body_weight'),
  tags: text('tags'),
  notes: text('notes'),
});
```

**Step 2: Create `apps/api/drizzle.config.ts`** (note: at apps/api root, not src)

```typescript
import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

export default {
  schema: './src/drizzle/schema.ts',
  out: './src/drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '../../data/sqlite/app.db',
  },
} satisfies Config;
```

**Step 3: Commit**

```bash
git add apps/api/src/drizzle/ apps/api/drizzle.config.ts
git commit -m "feat: add Drizzle schema for all tables"
```

---

### Task 7: DrizzleModule + migrations

**Files:**
- Create: `apps/api/src/drizzle/drizzle.module.ts`
- Create: `apps/api/src/drizzle/drizzle.constants.ts`

**Step 1: Create `apps/api/src/drizzle/drizzle.constants.ts`**

```typescript
export const DATABASE = 'DATABASE' as const;
```

**Step 2: Create `apps/api/src/drizzle/drizzle.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { DATABASE } from './drizzle.constants';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('DATABASE_URL');
        const sqlite = new Database(url);
        sqlite.pragma('journal_mode = WAL');
        sqlite.pragma('synchronous = NORMAL');
        sqlite.pragma('foreign_keys = ON');
        sqlite.pragma('busy_timeout = 5000');
        sqlite.pragma('cache_size = -64000');
        sqlite.pragma('temp_store = MEMORY');
        return drizzle(sqlite, { schema });
      },
    },
  ],
  exports: [DATABASE],
})
export class DrizzleModule {}
```

**Step 3: Add DrizzleModule to AppModule**

Edit `apps/api/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from './drizzle/drizzle.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
  ],
})
export class AppModule {}
```

**Step 4: Generate initial migration**

```bash
npm run db:migrate --workspace=apps/api
```

Expected: creates `apps/api/src/drizzle/migrations/0000_*.sql`

**Step 5: Commit**

```bash
git add apps/api/src/drizzle/ apps/api/src/app.module.ts
git commit -m "feat: add DrizzleModule with SQLite pragmas"
```

---

### Task 8: Auth stub + seed default user

**Files:**
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/mock-auth.guard.ts`
- Create: `apps/api/src/seed/seed.service.ts`

**Step 1: Create `apps/api/src/auth/mock-auth.guard.ts`**

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    req.user = { id: 'default-user', displayName: 'Viktor' };
    return true;
  }
}
```

**Step 2: Create `apps/api/src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './mock-auth.guard';

@Module({
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
```

**Step 3: Create `apps/api/src/seed/seed.service.ts`**

```typescript
import { Injectable, Inject, OnApplicationBootstrap } from '@nestjs/common';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../drizzle/drizzle.constants';
import * as schema from '../drizzle/schema';
import { randomUUID } from 'crypto';

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
];

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(@Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>) {}

  async onApplicationBootstrap() {
    await this.seedUser();
    await this.seedExercises();
  }

  private async seedUser() {
    const existing = this.db.select().from(schema.users)
      .where(eq(schema.users.id, 'default-user')).get();
    if (existing) return;
    this.db.insert(schema.users).values({
      id: 'default-user',
      displayName: 'Viktor',
      createdAt: Math.floor(Date.now() / 1000),
    }).run();
  }

  private async seedExercises() {
    const existing = this.db.select().from(schema.exercises).limit(1).get();
    if (existing) return;
    const now = Math.floor(Date.now() / 1000);
    for (const ex of DEFAULT_EXERCISES) {
      this.db.insert(schema.exercises).values({
        id: randomUUID(),
        userId: 'default-user',
        name: ex.name,
        category: ex.category,
        equipment: ex.equipment,
        isDefault: 1,
        createdAt: now,
      }).run();
    }
  }
}
```

**Step 4: Create `apps/api/src/seed/seed.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';

@Module({ providers: [SeedService] })
export class SeedModule {}
```

**Step 5: Update AppModule to include AuthModule and SeedModule**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from './drizzle/drizzle.module';
import { AuthModule } from './auth/auth.module';
import { SeedModule } from './seed/seed.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    AuthModule,
    SeedModule,
  ],
})
export class AppModule {}
```

**Step 6: Add health endpoint to verify API works**

Create `apps/api/src/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() { return { status: 'ok' }; }
}
```

Add to AppModule controllers: `controllers: [HealthController]`

**Step 7: Start API and verify**

```bash
npm run dev --workspace=apps/api
curl http://localhost:3000/api/health
```
Expected: `{"status":"ok"}`

**Step 8: Commit**

```bash
git add apps/api/src/auth/ apps/api/src/seed/ apps/api/src/health.controller.ts apps/api/src/app.module.ts
git commit -m "feat: add auth stub, seed user, seed exercises, health endpoint"
```

---

## Phase 3 — Shared Zod Schemas

### Task 9: Write shared Zod schemas

**Files:**
- Modify: `packages/shared/src/exercise.schema.ts`
- Modify: `packages/shared/src/workout.schema.ts`
- Modify: `packages/shared/src/set.schema.ts`
- Modify: `packages/shared/src/body.schema.ts`

**Step 1: `packages/shared/src/exercise.schema.ts`**

```typescript
import { z } from 'zod';

export const ExerciseCategorySchema = z.enum(['push', 'pull', 'legs', 'core', 'cardio', 'other']);
export const ExerciseEquipmentSchema = z.enum(['barbell', 'dumbbell', 'machine', 'bodyweight', 'cable', 'other']);

export const CreateExerciseSchema = z.object({
  name: z.string().min(1).max(100),
  category: ExerciseCategorySchema.optional(),
  equipment: ExerciseEquipmentSchema.optional(),
  notes: z.string().max(500).optional(),
});

export const UpdateExerciseSchema = CreateExerciseSchema.partial();

export type CreateExerciseDto = z.infer<typeof CreateExerciseSchema>;
export type UpdateExerciseDto = z.infer<typeof UpdateExerciseSchema>;
```

**Step 2: `packages/shared/src/workout.schema.ts`**

```typescript
import { z } from 'zod';

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  notes: z.string().max(500).optional(),
  exercises: z.array(z.object({
    exerciseId: z.string().uuid(),
    orderIndex: z.number().int().min(0),
    defaultSets: z.number().int().min(1).optional(),
    defaultReps: z.number().int().min(1).optional(),
    defaultWeightKg: z.number().min(0).optional(),
  })),
});

export const StartSessionSchema = z.object({
  templateId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
});

export const FinishSessionSchema = z.object({
  notes: z.string().max(500).optional(),
});

export type CreateTemplateDto = z.infer<typeof CreateTemplateSchema>;
export type StartSessionDto = z.infer<typeof StartSessionSchema>;
```

**Step 3: `packages/shared/src/set.schema.ts`**

```typescript
import { z } from 'zod';

export const CreateSetSchema = z.object({
  exerciseId: z.string().uuid(),
  setNumber: z.number().int().min(1),
  reps: z.number().int().min(0).optional(),
  weightKg: z.number().min(0).optional(),
  durationSec: z.number().int().min(0).optional(),
  rpe: z.number().min(1).max(10).optional(),
  isWarmup: z.boolean().default(false),
});

export const UpdateSetSchema = CreateSetSchema.omit({ exerciseId: true, setNumber: true }).partial();

export type CreateSetDto = z.infer<typeof CreateSetSchema>;
export type UpdateSetDto = z.infer<typeof UpdateSetSchema>;
```

**Step 4: `packages/shared/src/body.schema.ts`**

```typescript
import { z } from 'zod';

export const CreateBodyWeightSchema = z.object({
  weightKg: z.number().min(20).max(500),
  recordedAt: z.number().int().optional(),
  notes: z.string().max(200).optional(),
});

export const CreateMeasurementSchema = z.object({
  recordedAt: z.number().int().optional(),
  chest: z.number().min(0).optional(),
  waist: z.number().min(0).optional(),
  hips: z.number().min(0).optional(),
  leftBicep: z.number().min(0).optional(),
  rightBicep: z.number().min(0).optional(),
  leftThigh: z.number().min(0).optional(),
  rightThigh: z.number().min(0).optional(),
  shoulders: z.number().min(0).optional(),
  neck: z.number().min(0).optional(),
  notes: z.string().max(200).optional(),
});

export type CreateBodyWeightDto = z.infer<typeof CreateBodyWeightSchema>;
export type CreateMeasurementDto = z.infer<typeof CreateMeasurementSchema>;
```

**Step 5: Build shared package**

```bash
npm run build --workspace=packages/shared
```

**Step 6: Commit**

```bash
git add packages/shared/src/
git commit -m "feat: add shared Zod schemas"
```

---

## Phase 4 — Exercises API

### Task 10: ExercisesModule (CRUD)

**Files:**
- Create: `apps/api/src/exercises/exercises.module.ts`
- Create: `apps/api/src/exercises/exercises.controller.ts`
- Create: `apps/api/src/exercises/exercises.service.ts`

**Step 1: Create `apps/api/src/exercises/exercises.service.ts`**

```typescript
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DATABASE } from '../drizzle/drizzle.constants';
import * as schema from '../drizzle/schema';
import { CreateExerciseDto, UpdateExerciseDto } from '@gymtracker/shared';

@Injectable()
export class ExercisesService {
  constructor(@Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>) {}

  findAll(userId: string) {
    return this.db.select().from(schema.exercises)
      .where(or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1)))
      .all();
  }

  findOne(id: string, userId: string) {
    const ex = this.db.select().from(schema.exercises)
      .where(and(eq(schema.exercises.id, id),
        or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1))))
      .get();
    if (!ex) throw new NotFoundException('Exercise not found');
    return ex;
  }

  create(userId: string, dto: CreateExerciseDto) {
    const id = randomUUID();
    this.db.insert(schema.exercises).values({
      id,
      userId,
      name: dto.name,
      category: dto.category ?? null,
      equipment: dto.equipment ?? null,
      notes: dto.notes ?? null,
      isDefault: 0,
      createdAt: Math.floor(Date.now() / 1000),
    }).run();
    return this.db.select().from(schema.exercises).where(eq(schema.exercises.id, id)).get()!;
  }

  update(id: string, userId: string, dto: UpdateExerciseDto) {
    this.findOne(id, userId);
    this.db.update(schema.exercises).set(dto).where(
      and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId))
    ).run();
    return this.db.select().from(schema.exercises).where(eq(schema.exercises.id, id)).get()!;
  }

  remove(id: string, userId: string) {
    this.findOne(id, userId);
    this.db.delete(schema.exercises).where(
      and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 0))
    ).run();
  }
}
```

**Step 2: Create `apps/api/src/exercises/exercises.controller.ts`**

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, Req } from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { createZodDto } from 'nestjs-zod';
import { CreateExerciseSchema, UpdateExerciseSchema } from '@gymtracker/shared';

class CreateExerciseDto extends createZodDto(CreateExerciseSchema) {}
class UpdateExerciseDto extends createZodDto(UpdateExerciseSchema) {}

@Controller('exercises')
export class ExercisesController {
  constructor(private readonly svc: ExercisesService) {}

  @Get() findAll(@Req() req: any) { return this.svc.findAll(req.user.id); }
  @Get(':id') findOne(@Param('id') id: string, @Req() req: any) { return this.svc.findOne(id, req.user.id); }
  @Post() create(@Body() dto: CreateExerciseDto, @Req() req: any) { return this.svc.create(req.user.id, dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateExerciseDto, @Req() req: any) { return this.svc.update(id, req.user.id, dto); }
  @Delete(':id') remove(@Param('id') id: string, @Req() req: any) { return this.svc.remove(id, req.user.id); }
}
```

**Step 3: Create `apps/api/src/exercises/exercises.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';

@Module({ controllers: [ExercisesController], providers: [ExercisesService] })
export class ExercisesModule {}
```

**Step 4: Add ExercisesModule to AppModule**

**Step 5: Verify API**

```bash
curl http://localhost:3000/api/exercises | jq length
```
Expected: 32 (seeded exercises)

**Step 6: Commit**

```bash
git add apps/api/src/exercises/ apps/api/src/app.module.ts
git commit -m "feat: add ExercisesModule CRUD API"
```

---

## Phase 5 — Workouts API

### Task 11: WorkoutsModule (templates + sessions)

**Files:**
- Create: `apps/api/src/workouts/workouts.module.ts`
- Create: `apps/api/src/workouts/workouts.controller.ts`
- Create: `apps/api/src/workouts/workouts.service.ts`

**Step 1: Create `apps/api/src/workouts/workouts.service.ts`**

```typescript
import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DATABASE } from '../drizzle/drizzle.constants';
import * as schema from '../drizzle/schema';
import { CreateTemplateDto, StartSessionDto, FinishSessionSchema } from '@gymtracker/shared';
import { z } from 'zod';

@Injectable()
export class WorkoutsService {
  constructor(@Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>) {}

  // Templates
  getTemplates(userId: string) {
    return this.db.select().from(schema.workoutTemplates)
      .where(eq(schema.workoutTemplates.userId, userId))
      .orderBy(desc(schema.workoutTemplates.createdAt)).all();
  }

  getTemplate(id: string, userId: string) {
    const t = this.db.select().from(schema.workoutTemplates)
      .where(and(eq(schema.workoutTemplates.id, id), eq(schema.workoutTemplates.userId, userId))).get();
    if (!t) throw new NotFoundException('Template not found');
    const exercises = this.db.select().from(schema.templateExercises)
      .where(eq(schema.templateExercises.templateId, id)).all();
    return { ...t, exercises };
  }

  createTemplate(userId: string, dto: CreateTemplateDto) {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    this.db.insert(schema.workoutTemplates).values({ id, userId, name: dto.name, notes: dto.notes ?? null, createdAt: now }).run();
    for (const ex of dto.exercises) {
      this.db.insert(schema.templateExercises).values({ id: randomUUID(), templateId: id, ...ex, defaultWeightKg: ex.defaultWeightKg ?? null, defaultSets: ex.defaultSets ?? null, defaultReps: ex.defaultReps ?? null }).run();
    }
    return this.getTemplate(id, userId);
  }

  deleteTemplate(id: string, userId: string) {
    this.getTemplate(id, userId);
    this.db.delete(schema.templateExercises).where(eq(schema.templateExercises.templateId, id)).run();
    this.db.delete(schema.workoutTemplates).where(and(eq(schema.workoutTemplates.id, id), eq(schema.workoutTemplates.userId, userId))).run();
  }

  // Sessions
  getSessions(userId: string) {
    return this.db.select().from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.userId, userId))
      .orderBy(desc(schema.workoutSessions.startedAt)).all();
  }

  getSession(id: string, userId: string) {
    const s = this.db.select().from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId))).get();
    if (!s) throw new NotFoundException('Session not found');
    const sessionSets = this.db.select().from(schema.sets).where(eq(schema.sets.sessionId, id)).all();
    return { ...s, sets: sessionSets };
  }

  getActiveSession(userId: string) {
    return this.db.select().from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, userId), isNull(schema.workoutSessions.finishedAt))).get() ?? null;
  }

  startSession(userId: string, dto: StartSessionDto) {
    const active = this.getActiveSession(userId);
    if (active) throw new BadRequestException('A session is already active');
    const id = randomUUID();
    this.db.insert(schema.workoutSessions).values({ id, userId, templateId: dto.templateId ?? null, name: dto.name, startedAt: Math.floor(Date.now() / 1000), finishedAt: null, notes: null }).run();
    return this.getSession(id, userId);
  }

  finishSession(id: string, userId: string, dto: z.infer<typeof FinishSessionSchema>) {
    this.getSession(id, userId);
    this.db.update(schema.workoutSessions).set({ finishedAt: Math.floor(Date.now() / 1000), notes: dto.notes ?? null })
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId))).run();
    return this.getSession(id, userId);
  }
}
```

**Step 2: Create `apps/api/src/workouts/workouts.controller.ts`**

```typescript
import { Controller, Get, Post, Delete, Param, Body, Req } from '@nestjs/common';
import { WorkoutsService } from './workouts.service';
import { createZodDto } from 'nestjs-zod';
import { CreateTemplateSchema, StartSessionSchema, FinishSessionSchema } from '@gymtracker/shared';

class CreateTemplateDto extends createZodDto(CreateTemplateSchema) {}
class StartSessionDto extends createZodDto(StartSessionSchema) {}
class FinishSessionDto extends createZodDto(FinishSessionSchema) {}

@Controller()
export class WorkoutsController {
  constructor(private readonly svc: WorkoutsService) {}

  @Get('templates') getTemplates(@Req() req: any) { return this.svc.getTemplates(req.user.id); }
  @Get('templates/:id') getTemplate(@Param('id') id: string, @Req() req: any) { return this.svc.getTemplate(id, req.user.id); }
  @Post('templates') createTemplate(@Body() dto: CreateTemplateDto, @Req() req: any) { return this.svc.createTemplate(req.user.id, dto); }
  @Delete('templates/:id') deleteTemplate(@Param('id') id: string, @Req() req: any) { return this.svc.deleteTemplate(id, req.user.id); }

  @Get('sessions') getSessions(@Req() req: any) { return this.svc.getSessions(req.user.id); }
  @Get('sessions/active') getActive(@Req() req: any) { return this.svc.getActiveSession(req.user.id); }
  @Get('sessions/:id') getSession(@Param('id') id: string, @Req() req: any) { return this.svc.getSession(id, req.user.id); }
  @Post('sessions') startSession(@Body() dto: StartSessionDto, @Req() req: any) { return this.svc.startSession(req.user.id, dto); }
  @Post('sessions/:id/finish') finishSession(@Param('id') id: string, @Body() dto: FinishSessionDto, @Req() req: any) { return this.svc.finishSession(id, req.user.id, dto); }
}
```

**Step 3: Wire up WorkoutsModule and add to AppModule**

**Step 4: Commit**

```bash
git add apps/api/src/workouts/
git commit -m "feat: add WorkoutsModule (templates + sessions API)"
```

---

## Phase 6 — Sets API

### Task 12: SetsModule

**Files:**
- Create: `apps/api/src/sets/sets.module.ts`
- Create: `apps/api/src/sets/sets.controller.ts`
- Create: `apps/api/src/sets/sets.service.ts`

**Step 1: Create `apps/api/src/sets/sets.service.ts`**

```typescript
import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DATABASE } from '../drizzle/drizzle.constants';
import * as schema from '../drizzle/schema';
import { CreateSetDto, UpdateSetDto } from '@gymtracker/shared';

@Injectable()
export class SetsService {
  constructor(@Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>) {}

  private getActiveSession(sessionId: string, userId: string) {
    const s = this.db.select().from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, sessionId), eq(schema.workoutSessions.userId, userId))).get();
    if (!s) throw new NotFoundException('Session not found');
    if (s.finishedAt) throw new BadRequestException('Session is already finished');
    return s;
  }

  getSessionSets(sessionId: string, userId: string) {
    this.getActiveSession(sessionId, userId);
    return this.db.select().from(schema.sets).where(eq(schema.sets.sessionId, sessionId)).all();
  }

  logSet(sessionId: string, userId: string, dto: CreateSetDto) {
    this.getActiveSession(sessionId, userId);
    const id = randomUUID();
    this.db.insert(schema.sets).values({
      id, sessionId,
      exerciseId: dto.exerciseId,
      setNumber: dto.setNumber,
      reps: dto.reps ?? null,
      weightKg: dto.weightKg ?? null,
      durationSec: dto.durationSec ?? null,
      rpe: dto.rpe ?? null,
      isWarmup: dto.isWarmup ? 1 : 0,
      completedAt: Math.floor(Date.now() / 1000),
    }).run();
    return this.db.select().from(schema.sets).where(eq(schema.sets.id, id)).get()!;
  }

  updateSet(sessionId: string, setId: string, userId: string, dto: UpdateSetDto) {
    this.getActiveSession(sessionId, userId);
    const set = this.db.select().from(schema.sets)
      .where(and(eq(schema.sets.id, setId), eq(schema.sets.sessionId, sessionId))).get();
    if (!set) throw new NotFoundException('Set not found');
    this.db.update(schema.sets).set(dto).where(eq(schema.sets.id, setId)).run();
    return this.db.select().from(schema.sets).where(eq(schema.sets.id, setId)).get()!;
  }

  deleteSet(sessionId: string, setId: string, userId: string) {
    this.getActiveSession(sessionId, userId);
    const set = this.db.select().from(schema.sets)
      .where(and(eq(schema.sets.id, setId), eq(schema.sets.sessionId, sessionId))).get();
    if (!set) throw new NotFoundException('Set not found');
    this.db.delete(schema.sets).where(eq(schema.sets.id, setId)).run();
  }
}
```

**Step 2: Create `apps/api/src/sets/sets.controller.ts`**

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, Req } from '@nestjs/common';
import { SetsService } from './sets.service';
import { createZodDto } from 'nestjs-zod';
import { CreateSetSchema, UpdateSetSchema } from '@gymtracker/shared';

class CreateSetDto extends createZodDto(CreateSetSchema) {}
class UpdateSetDto extends createZodDto(UpdateSetSchema) {}

@Controller('sessions/:sessionId/sets')
export class SetsController {
  constructor(private readonly svc: SetsService) {}

  @Get() getSets(@Param('sessionId') sessionId: string, @Req() req: any) {
    return this.svc.getSessionSets(sessionId, req.user.id);
  }
  @Post() logSet(@Param('sessionId') sessionId: string, @Body() dto: CreateSetDto, @Req() req: any) {
    return this.svc.logSet(sessionId, req.user.id, dto);
  }
  @Patch(':setId') updateSet(@Param('sessionId') sessionId: string, @Param('setId') setId: string, @Body() dto: UpdateSetDto, @Req() req: any) {
    return this.svc.updateSet(sessionId, setId, req.user.id, dto);
  }
  @Delete(':setId') deleteSet(@Param('sessionId') sessionId: string, @Param('setId') setId: string, @Req() req: any) {
    return this.svc.deleteSet(sessionId, setId, req.user.id);
  }
}
```

**Step 3: Wire up SetsModule and add to AppModule**

**Step 4: Commit**

```bash
git add apps/api/src/sets/
git commit -m "feat: add SetsModule for logging sets in active sessions"
```

---

## Phase 7 — Body & Stats API

### Task 13: BodyModule

**Files:**
- Create: `apps/api/src/body/body.module.ts`
- Create: `apps/api/src/body/body.controller.ts`
- Create: `apps/api/src/body/body.service.ts`

**Step 1: Create `apps/api/src/body/body.service.ts`**

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DATABASE } from '../drizzle/drizzle.constants';
import * as schema from '../drizzle/schema';
import { CreateBodyWeightDto, CreateMeasurementDto } from '@gymtracker/shared';

@Injectable()
export class BodyService {
  constructor(@Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>) {}

  getWeights(userId: string) {
    return this.db.select().from(schema.bodyWeights)
      .where(eq(schema.bodyWeights.userId, userId))
      .orderBy(desc(schema.bodyWeights.recordedAt)).all();
  }

  addWeight(userId: string, dto: CreateBodyWeightDto) {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    this.db.insert(schema.bodyWeights).values({
      id, userId, weightKg: dto.weightKg,
      recordedAt: dto.recordedAt ?? now,
      notes: dto.notes ?? null,
    }).run();
    return this.db.select().from(schema.bodyWeights).where(eq(schema.bodyWeights.id, id)).get()!;
  }

  getMeasurements(userId: string) {
    return this.db.select().from(schema.bodyMeasurements)
      .where(eq(schema.bodyMeasurements.userId, userId))
      .orderBy(desc(schema.bodyMeasurements.recordedAt)).all();
  }

  addMeasurement(userId: string, dto: CreateMeasurementDto) {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    this.db.insert(schema.bodyMeasurements).values({
      id, userId,
      recordedAt: dto.recordedAt ?? now,
      chest: dto.chest ?? null, waist: dto.waist ?? null, hips: dto.hips ?? null,
      leftBicep: dto.leftBicep ?? null, rightBicep: dto.rightBicep ?? null,
      leftThigh: dto.leftThigh ?? null, rightThigh: dto.rightThigh ?? null,
      shoulders: dto.shoulders ?? null, neck: dto.neck ?? null,
      notes: dto.notes ?? null,
    }).run();
    return this.db.select().from(schema.bodyMeasurements).where(eq(schema.bodyMeasurements.id, id)).get()!;
  }
}
```

**Step 2: Create controller and module (follow the exercises pattern)**

Controller routes:
- `GET /body/weight` → getWeights
- `POST /body/weight` → addWeight
- `GET /body/measurements` → getMeasurements
- `POST /body/measurements` → addMeasurement

**Step 3: Wire up and commit**

```bash
git add apps/api/src/body/
git commit -m "feat: add BodyModule (weight + measurements)"
```

---

### Task 14: StatsModule

**Files:**
- Create: `apps/api/src/stats/stats.module.ts`
- Create: `apps/api/src/stats/stats.controller.ts`
- Create: `apps/api/src/stats/stats.service.ts`

**Step 1: Create `apps/api/src/stats/stats.service.ts`**

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { DATABASE } from '../drizzle/drizzle.constants';
import * as schema from '../drizzle/schema';

@Injectable()
export class StatsService {
  constructor(@Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>) {}

  getPRs(userId: string, exerciseId?: string, limit = 10) {
    // Raw SQL for max weight grouped by exercise
    const db = (this.db as any).session.client as import('better-sqlite3').Database;
    const where = exerciseId ? `AND s.exercise_id = '${exerciseId}'` : '';
    return db.prepare(`
      SELECT s.exercise_id, e.name, MAX(s.weight_kg) as maxWeightKg,
             s.reps as repsAtMax, s.completed_at as achievedAt
      FROM sets s
      JOIN workout_sessions ws ON s.session_id = ws.id
      JOIN exercises e ON s.exercise_id = e.id
      WHERE ws.user_id = ? AND s.is_warmup = 0 ${where}
      GROUP BY s.exercise_id
      ORDER BY maxWeightKg DESC
      LIMIT ?
    `).all(userId, limit);
  }

  getVolume(userId: string, exerciseId?: string, from?: number, to?: number) {
    const db = (this.db as any).session.client as import('better-sqlite3').Database;
    const conditions: string[] = ['ws.user_id = ?'];
    const params: unknown[] = [userId];
    if (exerciseId) { conditions.push(`s.exercise_id = ?`); params.push(exerciseId); }
    if (from) { conditions.push(`s.completed_at >= ?`); params.push(from); }
    if (to) { conditions.push(`s.completed_at <= ?`); params.push(to); }
    const where = conditions.join(' AND ');
    return db.prepare(`
      SELECT date(s.completed_at, 'unixepoch') as date,
             SUM(s.reps * s.weight_kg) as volume
      FROM sets s
      JOIN workout_sessions ws ON s.session_id = ws.id
      WHERE ${where} AND s.reps IS NOT NULL AND s.weight_kg IS NOT NULL
      GROUP BY date ORDER BY date ASC
    `).all(...params);
  }

  getStreak(userId: string) {
    const db = (this.db as any).session.client as import('better-sqlite3').Database;
    const days = db.prepare(`
      SELECT DISTINCT date(started_at, 'unixepoch') as day
      FROM workout_sessions WHERE user_id = ? AND finished_at IS NOT NULL
      ORDER BY day DESC
    `).all(userId) as { day: string }[];

    let current = 0, longest = 0, streak = 0;
    const today = new Date().toISOString().split('T')[0]!;
    let prev: string | null = null;

    for (const { day } of days) {
      if (!prev) {
        streak = (day === today || day === new Date(Date.now() - 86400000).toISOString().split('T')[0]) ? 1 : 0;
      } else {
        const diff = (new Date(prev).getTime() - new Date(day).getTime()) / 86400000;
        streak = diff === 1 ? streak + 1 : 1;
      }
      longest = Math.max(longest, streak);
      if (!current) current = streak;
      prev = day;
    }
    return { current, longest };
  }

  getBodyWeight(userId: string, from?: number, to?: number) {
    const conditions = [eq(schema.bodyWeights.userId, userId)];
    if (from) conditions.push(gte(schema.bodyWeights.recordedAt, from));
    if (to) conditions.push(lte(schema.bodyWeights.recordedAt, to));
    return this.db.select().from(schema.bodyWeights)
      .where(and(...conditions)).orderBy(schema.bodyWeights.recordedAt).all();
  }

  getMeasurements(userId: string, from?: number, to?: number) {
    const conditions = [eq(schema.bodyMeasurements.userId, userId)];
    if (from) conditions.push(gte(schema.bodyMeasurements.recordedAt, from));
    if (to) conditions.push(lte(schema.bodyMeasurements.recordedAt, to));
    return this.db.select().from(schema.bodyMeasurements)
      .where(and(...conditions)).orderBy(schema.bodyMeasurements.recordedAt).all();
  }

  getFrequency(userId: string, from?: number, to?: number) {
    const db = (this.db as any).session.client as import('better-sqlite3').Database;
    const params: unknown[] = [userId];
    let extra = '';
    if (from) { extra += ' AND started_at >= ?'; params.push(from); }
    if (to) { extra += ' AND started_at <= ?'; params.push(to); }
    return db.prepare(`
      SELECT strftime('%Y-W%W', started_at, 'unixepoch') as week, COUNT(*) as count
      FROM workout_sessions WHERE user_id = ? AND finished_at IS NOT NULL ${extra}
      GROUP BY week ORDER BY week ASC
    `).all(...params);
  }
}
```

**Step 2: Create controller**

```typescript
@Controller('stats')
export class StatsController {
  constructor(private readonly svc: StatsService) {}

  @Get('prs') getPRs(@Req() req: any, @Query('exerciseId') exerciseId?: string, @Query('limit') limit?: string) {
    return this.svc.getPRs(req.user.id, exerciseId, limit ? parseInt(limit) : 10);
  }
  @Get('volume') getVolume(@Req() req: any, @Query('exerciseId') exerciseId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getVolume(req.user.id, exerciseId, from ? parseInt(from) : undefined, to ? parseInt(to) : undefined);
  }
  @Get('streak') getStreak(@Req() req: any) { return this.svc.getStreak(req.user.id); }
  @Get('bodyweight') getBodyWeight(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getBodyWeight(req.user.id, from ? parseInt(from) : undefined, to ? parseInt(to) : undefined);
  }
  @Get('measurements') getMeasurements(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getMeasurements(req.user.id, from ? parseInt(from) : undefined, to ? parseInt(to) : undefined);
  }
  @Get('frequency') getFrequency(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getFrequency(req.user.id, from ? parseInt(from) : undefined, to ? parseInt(to) : undefined);
  }
}
```

**Step 3: Commit**

```bash
git add apps/api/src/stats/
git commit -m "feat: add StatsModule (PRs, volume, streak, body, frequency)"
```

---

## Phase 8 — Photos API

### Task 15: PhotosModule

**Files:**
- Create: `apps/api/src/photos/photos.module.ts`
- Create: `apps/api/src/photos/photos.controller.ts`
- Create: `apps/api/src/photos/photos.service.ts`

**Step 1: Create `apps/api/src/photos/photos.service.ts`**

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { mkdirSync } from 'fs';
import sharp from 'sharp';
import { DATABASE } from '../drizzle/drizzle.constants';
import * as schema from '../drizzle/schema';

@Injectable()
export class PhotosService {
  private readonly photosDir: string;

  constructor(
    @Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>,
    private config: ConfigService,
  ) {
    this.photosDir = config.getOrThrow<string>('PHOTOS_DIR');
  }

  getPhotos(userId: string) {
    return this.db.select().from(schema.progressPhotos)
      .where(eq(schema.progressPhotos.userId, userId))
      .orderBy(desc(schema.progressPhotos.recordedAt)).all();
  }

  async uploadPhoto(userId: string, buffer: Buffer, bodyWeight?: number, tags?: string[], notes?: string) {
    const id = randomUUID();
    const userDir = join(this.photosDir, userId);
    mkdirSync(userDir, { recursive: true });

    const origPath = join(userDir, `${id}-orig.webp`);
    const thumbPath = join(userDir, `${id}-thumb.webp`);
    const relOrig = `${userId}/${id}-orig.webp`;
    const relThumb = `${userId}/${id}-thumb.webp`;

    await sharp(buffer).rotate().webp({ quality: 85 }).toFile(origPath);
    await sharp(buffer).rotate().resize({ width: 400 }).webp({ quality: 75 }).toFile(thumbPath);

    const now = Math.floor(Date.now() / 1000);
    this.db.insert(schema.progressPhotos).values({
      id, userId,
      recordedAt: now,
      filePath: relOrig,
      thumbPath: relThumb,
      bodyWeight: bodyWeight ?? null,
      tags: tags ? JSON.stringify(tags) : null,
      notes: notes ?? null,
    }).run();

    return this.db.select().from(schema.progressPhotos).where(eq(schema.progressPhotos.id, id)).get()!;
  }

  getPhotoPath(userId: string, filename: string) {
    return join(this.photosDir, userId, filename);
  }
}
```

**Step 2: Create `apps/api/src/photos/photos.controller.ts`**

```typescript
import { Controller, Get, Post, Param, Req, Res, PayloadTooLargeException } from '@nestjs/common';
import { createReadStream } from 'fs';
import { PhotosService } from './photos.service';

@Controller('photos')
export class PhotosController {
  constructor(private readonly svc: PhotosService) {}

  @Get() getPhotos(@Req() req: any) { return this.svc.getPhotos(req.user.id); }

  @Post()
  async upload(@Req() req: any, @Res() res: any) {
    const data = await req.file();
    if (!data) return res.code(400).send({ message: 'No file provided' });

    const buffer = await data.toBuffer();
    if (buffer.byteLength > 15 * 1024 * 1024) {
      throw new PayloadTooLargeException('File exceeds 15 MB limit');
    }

    const fields = data.fields as Record<string, any>;
    const bodyWeight = fields.bodyWeight?.value ? parseFloat(fields.bodyWeight.value) : undefined;
    const tags = fields.tags?.value ? JSON.parse(fields.tags.value) : undefined;
    const notes = fields.notes?.value ?? undefined;

    const photo = await this.svc.uploadPhoto(req.user.id, buffer, bodyWeight, tags, notes);
    return res.send(photo);
  }

  @Get('file/:filename')
  serveFile(@Param('filename') filename: string, @Req() req: any, @Res() res: any) {
    const filePath = this.svc.getPhotoPath(req.user.id, filename);
    const stream = createReadStream(filePath);
    return res.type('image/webp').send(stream);
  }
}
```

**Step 3: Commit**

```bash
git add apps/api/src/photos/
git commit -m "feat: add PhotosModule (upload, thumbnail via Sharp, serve)"
```

---

## Phase 9 — Frontend Foundation

### Task 16: API client + TanStack Query setup

**Files:**
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/lib/query.ts`
- Modify: `apps/web/src/main.tsx`

**Step 1: Create `apps/web/src/api/client.ts`**

```typescript
const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? 'Request failed');
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
};
```

**Step 2: Create `apps/web/src/lib/query.ts`**

```typescript
import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { persistQueryClient } from '@tanstack/react-query-persist-client';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
});

const persister = createSyncStoragePersister({ storage: localStorage });
persistQueryClient({ queryClient, persister });
```

**Step 3: Create TanStack Router root route `apps/web/src/router.tsx`**

```typescript
import { createRouter, createRootRoute, createRoute, Outlet, redirect } from '@tanstack/react-router';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => { throw redirect({ to: '/dashboard' }); },
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: () => <div className="p-4">Dashboard (coming soon)</div>,
});

const routeTree = rootRoute.addChildren([indexRoute, dashboardRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router; }
}
```

**Step 4: Update `apps/web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { queryClient } from './lib/query';
import { router } from './router';
import './index.css';

queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

**Step 5: Verify web app boots**

```bash
npm run dev --workspace=apps/web
```
Expected: Browser shows "Dashboard (coming soon)"

**Step 6: Commit**

```bash
git add apps/web/src/
git commit -m "feat: add API client, TanStack Query, and TanStack Router"
```

---

### Task 17: Zustand stores

**Files:**
- Create: `apps/web/src/stores/workout.store.ts`
- Create: `apps/web/src/stores/preferences.store.ts`

**Step 1: Create `apps/web/src/stores/workout.store.ts`**

```typescript
import { create } from 'zustand';

interface WorkoutStore {
  activeSessionId: string | null;
  activeExerciseIndex: number;
  setActiveSession: (id: string | null) => void;
  nextExercise: () => void;
  prevExercise: () => void;
  resetExerciseIndex: () => void;
}

export const useWorkoutStore = create<WorkoutStore>((set) => ({
  activeSessionId: null,
  activeExerciseIndex: 0,
  setActiveSession: (id) => set({ activeSessionId: id, activeExerciseIndex: 0 }),
  nextExercise: () => set((s) => ({ activeExerciseIndex: s.activeExerciseIndex + 1 })),
  prevExercise: () => set((s) => ({ activeExerciseIndex: Math.max(0, s.activeExerciseIndex - 1) })),
  resetExerciseIndex: () => set({ activeExerciseIndex: 0 }),
}));
```

**Step 2: Create `apps/web/src/stores/preferences.store.ts`**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreferencesStore {
  unit: 'kg' | 'lb';
  inputModes: Record<string, 'wheel' | 'buttons'>;
  restTimerSeconds: number;
  setUnit: (unit: 'kg' | 'lb') => void;
  setInputMode: (fieldKey: string, mode: 'wheel' | 'buttons') => void;
  setRestTimer: (seconds: number) => void;
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      unit: 'kg',
      inputModes: {},
      restTimerSeconds: 90,
      setUnit: (unit) => set({ unit }),
      setInputMode: (fieldKey, mode) =>
        set((s) => ({ inputModes: { ...s.inputModes, [fieldKey]: mode } })),
      setRestTimer: (restTimerSeconds) => set({ restTimerSeconds }),
    }),
    { name: 'gymtracker-preferences' },
  ),
);
```

**Step 3: Commit**

```bash
git add apps/web/src/stores/
git commit -m "feat: add Zustand workout and preferences stores"
```

---

## Phase 10 — NumericInput Component

### Task 18: NumericInput (wheel + buttons modes)

**Files:**
- Create: `apps/web/src/components/inputs/NumericInput.tsx`
- Create: `apps/web/src/components/inputs/useLongPress.ts`

**Step 1: Create `apps/web/src/components/inputs/useLongPress.ts`**

```typescript
import { useRef, useCallback } from 'react';

export function useLongPress(callback: () => void, interval = 125) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    callback();
    timerRef.current = setInterval(callback, interval);
  }, [callback, interval]);

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop, onTouchStart: start, onTouchEnd: stop };
}
```

**Step 2: Create `apps/web/src/components/inputs/NumericInput.tsx`**

```tsx
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { usePreferencesStore } from '@/stores/preferences.store';
import { useLongPress } from './useLongPress';
import { cn } from '@/lib/utils';

interface NumericInputProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  bigStep?: number;
  unit?: string;
  fieldKey: string;
  label?: string;
}

function ButtonMode({ value, onChange, min, max, step, bigStep, unit, fieldKey }: NumericInputProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const decBig = useLongPress(() => onChange(clamp(value - (bigStep ?? step))));
  const dec = useLongPress(() => onChange(clamp(value - step)));
  const inc = useLongPress(() => onChange(clamp(value + step)));
  const incBig = useLongPress(() => onChange(clamp(value + (bigStep ?? step))));

  if (editing) return (
    <input
      ref={inputRef}
      type="number"
      defaultValue={value}
      autoFocus
      className="w-full text-center text-2xl font-bold border rounded-lg p-3"
      onBlur={(e) => { onChange(clamp(parseFloat(e.target.value) || value)); setEditing(false); }}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.blur()}
    />
  );

  return (
    <div className="flex items-center gap-1">
      {bigStep && <Button variant="outline" className="min-w-14 min-h-14 text-lg" {...decBig}>−{bigStep}</Button>}
      <Button variant="outline" className="min-w-14 min-h-14 text-lg" {...dec}>−{step}</Button>
      <button
        onClick={() => setEditing(true)}
        className="flex-1 min-h-14 text-center font-bold text-xl px-3 rounded-lg bg-muted hover:bg-muted/80"
      >
        {value}{unit ? ` ${unit}` : ''}
      </button>
      <Button variant="outline" className="min-w-14 min-h-14 text-lg" {...inc}>+{step}</Button>
      {bigStep && <Button variant="outline" className="min-w-14 min-h-14 text-lg" {...incBig}>+{bigStep}</Button>}
    </div>
  );
}

function WheelMode({ value, onChange, min, max, step, unit }: NumericInputProps) {
  const items = [];
  for (let v = min; v <= max; v = Math.round((v + step) * 100) / 100) {
    items.push(v);
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full text-center text-xl font-bold border rounded-lg p-3 bg-background"
    >
      {items.map((v) => (
        <option key={v} value={v}>{v}{unit ? ` ${unit}` : ''}</option>
      ))}
    </select>
  );
}

export function NumericInput(props: NumericInputProps) {
  const { inputModes, setInputMode } = usePreferencesStore();
  const mode = inputModes[props.fieldKey] ?? 'buttons';

  return (
    <div className="relative">
      {props.label && <label className="text-sm text-muted-foreground mb-1 block">{props.label}</label>}
      {mode === 'buttons' ? <ButtonMode {...props} /> : <WheelMode {...props} />}
      <button
        onClick={() => setInputMode(props.fieldKey, mode === 'buttons' ? 'wheel' : 'buttons')}
        className="absolute top-0 right-0 text-xs text-muted-foreground p-1"
        title="Toggle input mode"
      >
        {mode === 'buttons' ? '≡' : '⟳'}
      </button>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/components/inputs/
git commit -m "feat: add NumericInput with buttons/wheel modes and long-press"
```

---

## Phase 11 — Workout Logger Screen

### Task 19: WorkoutLogger route + component

**Files:**
- Create: `apps/web/src/routes/workout.$sessionId.tsx`
- Create: `apps/web/src/components/workout/WorkoutLogger.tsx`
- Create: `apps/web/src/api/workouts.ts`
- Create: `apps/web/src/api/sets.ts`

**Step 1: Create `apps/web/src/api/workouts.ts`**

```typescript
import { api } from './client';

export const workoutsApi = {
  getTemplates: () => api.get<any[]>('/templates'),
  startSession: (data: { name: string; templateId?: string }) => api.post<any>('/sessions', data),
  getSession: (id: string) => api.get<any>(`/sessions/${id}`),
  getActiveSession: () => api.get<any | null>('/sessions/active'),
  finishSession: (id: string, notes?: string) => api.post<any>(`/sessions/${id}/finish`, { notes }),
};
```

**Step 2: Create `apps/web/src/api/sets.ts`**

```typescript
import { api } from './client';

export const setsApi = {
  logSet: (sessionId: string, data: object) => api.post<any>(`/sessions/${sessionId}/sets`, data),
  updateSet: (sessionId: string, setId: string, data: object) => api.patch<any>(`/sessions/${sessionId}/sets/${setId}`, data),
  deleteSet: (sessionId: string, setId: string) => api.delete(`/sessions/${sessionId}/sets/${setId}`),
};
```

**Step 3: Create `apps/web/src/components/workout/WorkoutLogger.tsx`**

This is the main mobile logger screen. Use the layout from the spec:

```tsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { NumericInput } from '@/components/inputs/NumericInput';
import { Button } from '@/components/ui/button';
import { setsApi } from '@/api/sets';
import { workoutsApi } from '@/api/workouts';
import { useWorkoutStore } from '@/stores/workout.store';
import { usePreferencesStore } from '@/stores/preferences.store';
import { cn } from '@/lib/utils';

interface WorkoutLoggerProps { sessionId: string; }

export function WorkoutLogger({ sessionId }: WorkoutLoggerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeExerciseIndex, nextExercise, prevExercise } = useWorkoutStore();
  const { restTimerSeconds } = usePreferencesStore();

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(8);
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => workoutsApi.getSession(sessionId),
  });

  const exercises = session?.sets
    ? [...new Set(session.sets.map((s: any) => s.exerciseId))].map((id) => ({
        id,
        sets: session.sets.filter((s: any) => s.exerciseId === id),
      }))
    : [];

  const currentExercise = exercises[activeExerciseIndex];

  useEffect(() => {
    if (!currentExercise?.sets?.length) return;
    const last = currentExercise.sets.at(-1);
    if (last?.weightKg) setWeight(last.weightKg);
    if (last?.reps) setReps(last.reps);
  }, [activeExerciseIndex, currentExercise]);

  useEffect(() => {
    if (restTimer === null) return;
    const id = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, [restTimer]);

  const logSet = useMutation({
    mutationFn: () => setsApi.logSet(sessionId, {
      exerciseId: currentExercise?.id ?? exercises[0]?.id,
      setNumber: (currentExercise?.sets?.length ?? 0) + 1,
      reps,
      weightKg: weight,
    }),
    networkMode: 'offlineFirst',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      if ('vibrate' in navigator) navigator.vibrate(50);
      setRestTimer(Date.now());
      setElapsed(0);
    },
  });

  const sessionDuration = session
    ? Math.floor((Date.now() / 1000) - session.startedAt)
    : 0;
  const mm = String(Math.floor(sessionDuration / 60)).padStart(2, '0');
  const ss = String(sessionDuration % 60).padStart(2, '0');

  const restProgress = restTimer !== null ? Math.min(elapsed / restTimerSeconds, 1) : 0;

  return (
    <div className="flex flex-col h-svh bg-background">
      {/* Rest timer progress bar */}
      {restTimer !== null && (
        <div className="h-1 bg-muted">
          <div className="h-1 bg-green-500 transition-all" style={{ width: `${restProgress * 100}%` }} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/dashboard' })}>← Back</Button>
        <span className="font-semibold truncate max-w-[200px]">{session?.name ?? 'Workout'}</span>
        <span className="text-muted-foreground tabular-nums">{mm}:{ss}</span>
      </div>

      {/* Previous sets */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {currentExercise?.sets?.map((s: any, i: number) => (
          <div key={s.id} className="flex items-center justify-between py-2 border-b text-sm">
            <span className="text-muted-foreground">Set {i + 1}</span>
            <span>{s.weightKg} kg × {s.reps} ✓</span>
          </div>
        ))}
        {!currentExercise && (
          <p className="text-center text-muted-foreground py-8">Start logging sets!</p>
        )}
      </div>

      {/* Inputs */}
      <div className="px-4 pb-2 grid grid-cols-2 gap-3">
        <NumericInput value={weight} onChange={setWeight} min={0} max={300} step={2.5} bigStep={10} unit="kg" fieldKey="weight" label="Weight" />
        <NumericInput value={reps} onChange={setReps} min={1} max={50} step={1} fieldKey="reps" label="Reps" />
      </div>

      {/* Log Set */}
      <div className="px-4 pb-3">
        <Button
          className="w-full h-[72px] text-xl bg-green-600 hover:bg-green-700 text-white"
          onClick={() => logSet.mutate()}
          disabled={logSet.isPending}
        >
          LOG SET
        </Button>
      </div>

      {/* Navigation */}
      <div className="grid grid-cols-2 gap-2 px-4 pb-safe pb-4">
        <Button variant="outline" onClick={prevExercise} disabled={activeExerciseIndex === 0}>
          ← Prev Exercise
        </Button>
        <Button variant="outline" onClick={nextExercise} disabled={activeExerciseIndex >= exercises.length - 1}>
          Next Exercise →
        </Button>
      </div>
    </div>
  );
}
```

**Step 4: Update the TanStack Router in `apps/web/src/router.tsx`** to add all routes per the spec:

```typescript
// Add routes for: /dashboard, /workout/start, /workout/:sessionId, /workout/:sessionId/finish,
// /history, /history/:sessionId, /exercises, /exercises/new,
// /stats, /stats/exercise/:id, /body, /body/measure, /photos, /photos/add, /settings
```

For each new route, create a corresponding route file in `apps/web/src/routes/`.

**Step 5: Test end-to-end**

```bash
# Terminal 1
npm run dev --workspace=apps/api

# Terminal 2
npm run dev --workspace=apps/web

# Open http://localhost:5173
```

**Step 6: Commit**

```bash
git add apps/web/src/
git commit -m "feat: add WorkoutLogger screen with NumericInput, rest timer, haptics"
```

---

## Phase 12 — Remaining Frontend Screens

### Task 20: Dashboard screen

**File:** `apps/web/src/routes/dashboard.tsx`

Show: active session banner (if any), recent sessions list, "Start Workout" button, quick stats.

```tsx
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from '@tanstack/react-router';
import { workoutsApi } from '@/api/workouts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: active } = useQuery({ queryKey: ['activeSession'], queryFn: workoutsApi.getActiveSession });
  const { data: sessions = [] } = useQuery({ queryKey: ['sessions'], queryFn: () => workoutsApi.getSessions() as Promise<any[]> });

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">GymTracker</h1>
      {active && (
        <Card className="border-green-500">
          <CardHeader><CardTitle>Active: {active.name}</CardTitle></CardHeader>
          <CardContent>
            <Button onClick={() => navigate({ to: '/workout/$sessionId', params: { sessionId: active.id } })}>
              Resume Workout
            </Button>
          </CardContent>
        </Card>
      )}
      <Button className="w-full" asChild>
        <Link to="/workout/start">Start New Workout</Link>
      </Button>
      <div className="space-y-2">
        <h2 className="font-semibold">Recent Workouts</h2>
        {sessions.slice(0, 5).map((s: any) => (
          <Card key={s.id}>
            <CardContent className="py-3 flex justify-between">
              <span>{s.name}</span>
              <span className="text-muted-foreground text-sm">{new Date(s.startedAt * 1000).toLocaleDateString()}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

Commit: `feat: add dashboard screen`

---

### Task 21: Exercise Library screen

**File:** `apps/web/src/routes/exercises.tsx`

Show exercises grouped by category, search bar, "New Exercise" link.

Commit: `feat: add exercise library screen`

---

### Task 22: Workout Start screen

**File:** `apps/web/src/routes/workout.start.tsx`

Show templates list + "Start Ad-hoc" option. On click: call `startSession`, redirect to `/workout/:sessionId`.

Commit: `feat: add workout start screen`

---

### Task 23: History screen

**File:** `apps/web/src/routes/history.tsx`

List past sessions (finished only), click to go to `/history/:sessionId` which shows all sets.

Commit: `feat: add history and session detail screens`

---

### Task 24: Stats Dashboard

**File:** `apps/web/src/routes/stats.tsx`

6 sections as per spec. Use shadcn Chart (Recharts wrapper) for all charts.

```
npm run --workspace=apps/web exec -- npx shadcn@latest add chart
```

Each chart section:
1. PR cards — `useQuery` → `GET /api/stats/prs`
2. Volume area chart — `GET /api/stats/volume`
3. Body weight line chart — `GET /api/stats/bodyweight`
4. Body measurements multi-line — `GET /api/stats/measurements`
5. Frequency bar chart — `GET /api/stats/frequency`
6. Streak heatmap — `GET /api/stats/streak` + CSS grid

Commit: `feat: add stats dashboard with charts`

---

### Task 25: Body Tracking screen

**File:** `apps/web/src/routes/body.tsx`

- Body weight log + add form
- Measurements list + add form
- Link to photos

Commit: `feat: add body tracking screen`

---

### Task 26: Photos screen

**File:** `apps/web/src/routes/photos.tsx`

- Gallery grid of thumbnails (served from `/api/photos/file/:filename`)
- Upload page: file input + body weight + tags

Commit: `feat: add progress photos gallery and upload`

---

### Task 27: Settings screen

**File:** `apps/web/src/routes/settings.tsx`

```tsx
import { usePreferencesStore } from '@/stores/preferences.store';

export function SettingsPage() {
  const { unit, setUnit, restTimerSeconds, setRestTimer, inputModes, setInputMode } = usePreferencesStore();
  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div>
        <label className="font-medium">Units</label>
        <div className="flex gap-2 mt-2">
          <button onClick={() => setUnit('kg')} className={cn('px-4 py-2 rounded border', unit === 'kg' && 'bg-primary text-primary-foreground')}>kg</button>
          <button onClick={() => setUnit('lb')} className={cn('px-4 py-2 rounded border', unit === 'lb' && 'bg-primary text-primary-foreground')}>lb</button>
        </div>
      </div>
      <div>
        <label className="font-medium">Rest Timer (seconds)</label>
        <input type="number" value={restTimerSeconds} onChange={(e) => setRestTimer(parseInt(e.target.value))} className="mt-2 block w-32 border rounded p-2" />
      </div>
    </div>
  );
}
```

Commit: `feat: add settings screen`

---

## Phase 13 — Navigation Shell

### Task 28: Bottom nav + layout

**File:** `apps/web/src/components/layout/AppLayout.tsx`

Mobile bottom nav with tabs: Dashboard, Workout, Stats, Body, Settings.
Desktop: sidebar or top nav.

```tsx
import { Link, useRouterState } from '@tanstack/react-router';
import { Home, Dumbbell, BarChart2, Activity, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/dashboard', label: 'Home', Icon: Home },
  { to: '/workout/start', label: 'Workout', Icon: Dumbbell },
  { to: '/stats', label: 'Stats', Icon: BarChart2 },
  { to: '/body', label: 'Body', Icon: Activity },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { location } = useRouterState();
  return (
    <div className="flex flex-col h-svh">
      <main className="flex-1 overflow-y-auto">{children}</main>
      <nav className="border-t bg-background grid grid-cols-5 pb-safe">
        {NAV.map(({ to, label, Icon }) => (
          <Link key={to} to={to} className={cn('flex flex-col items-center py-2 text-xs gap-1', location.pathname.startsWith(to) ? 'text-primary' : 'text-muted-foreground')}>
            <Icon size={22} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
```

Wrap all routes (except workout logger) in AppLayout in the root route.

Commit: `feat: add bottom navigation shell`

---

## Phase 14 — PWA + Polish

### Task 29: PWA manifest

**File:** `apps/web/public/manifest.json`

```json
{
  "name": "GymTracker",
  "short_name": "GymTracker",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Add to `index.html`: `<link rel="manifest" href="/manifest.json">`

Add placeholder icons at `apps/web/public/icon-192.png` and `icon-512.png`.

Commit: `feat: add PWA manifest for add-to-home-screen`

---

### Task 30: Cache-Control interceptor

**File:** `apps/api/src/cache-control.interceptor.ts`

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const res = ctx.switchToHttp().getResponse();
    res.header('Cache-Control', 'private, no-store');
    return next.handle();
  }
}
```

Register globally in AppModule: `{ provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor }`

Commit: `feat: add Cache-Control: private, no-store to all API responses`

---

## Final Verification

### Task 31: End-to-end smoke test

**Step 1: Start everything**

```bash
npm run dev
```

**Step 2: Verify API health**

```bash
curl http://localhost:3000/api/health
```

**Step 3: Open http://localhost:5173 and test:**
- [ ] Dashboard loads with "Start New Workout"
- [ ] Start an ad-hoc workout → WorkoutLogger opens
- [ ] Log 3 sets on an exercise
- [ ] Rest timer appears after each set
- [ ] Finish workout → redirect to history
- [ ] Stats page shows data
- [ ] Settings saves preferences (reload to verify persistence)
- [ ] NumericInput wheel/buttons toggle works
- [ ] Add body weight entry
- [ ] Upload a photo (test 15 MB limit)

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete GymTracker v1 implementation"
```

---

## Local Dev Reference

| Command | What it does |
|---|---|
| `npm run dev` | Start both API (3000) and web (5173) |
| `npm run dev --workspace=apps/api` | API only |
| `npm run dev --workspace=apps/web` | Web only |
| `npm run db:migrate` | Run Drizzle migrations |
| `npm run db:studio` | Open Drizzle Studio at http://local.drizzle.studio |
| `npm run build` | Build all workspaces |

API base: `http://localhost:3000/api`
Web dev server: `http://localhost:5173` (proxies `/api` to API)
SQLite file: `data/sqlite/app.db`
Photos dir: `data/photos/`

---

> **Note on Docker:** Docker Compose, Dockerfile, Litestream, and Cloudflare Tunnel steps are intentionally omitted. Add them once the app is verified locally. See the original spec for the full docker-compose.yml and Dockerfile.
