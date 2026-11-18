import { RequestMethod, type Type } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'

import { MeController } from './me.controller'
import { TRAINER_ACCESS, type TrainerAccessLevel } from './trainer-access.decorator'
import { AgentController } from '../agent/agent.controller'
import { AiLogController } from '../ai-log/ai-log.controller'
import { BodyController } from '../body/body.controller'
import { EquipmentController } from '../equipment/equipment.controller'
import { ExercisesController } from '../exercises/exercises.controller'
import { HealthController } from '../health.controller'
import { PhotosController } from '../photos/photos.controller'
import { ProfileController } from '../profile/profile.controller'
import { ProgramController } from '../program/program.controller'
import { ProgressionController } from '../progression/progression.controller'
import { SchedulesController } from '../schedules/schedules.controller'
import { SetsController } from '../sets/sets.controller'
import { StatsController } from '../stats/stats.controller'
import { WorkoutsController } from '../workouts/workouts.controller'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

type Level = TrainerAccessLevel | 'denied'

/** Everything a Trainer may do while acting (CONTEXT.md, "Acting as"). Any route not listed is denied. */
const EXPECTED: Record<string, Level> = {
  // templates
  'GET /templates': 'read',
  'GET /templates/:id': 'read',
  'POST /templates': 'write',
  'PATCH /templates/:id': 'write',
  'DELETE /templates/:id': 'write',
  'POST /templates/:id/exercises': 'write',
  // sessions and sets
  'GET /sessions': 'read',
  'GET /sessions/active': 'read',
  'GET /sessions/:id': 'read',
  'GET /sessions/:id/comparison': 'read',
  'POST /sessions': 'denied',
  'DELETE /sessions/:id': 'denied',
  'POST /sessions/:id/finish': 'denied',
  'GET /sessions/:sessionId/sets': 'read',
  'POST /sessions/:sessionId/sets': 'denied',
  'PATCH /sessions/:sessionId/sets/:setId': 'denied',
  'DELETE /sessions/:sessionId/sets/:setId': 'denied',
  // schedules
  'GET /schedules': 'read',
  'GET /schedules/today': 'read',
  'POST /schedules': 'write',
  'DELETE /schedules/:id': 'write',
  // profile
  'GET /profile': 'read',
  'PATCH /profile': 'write',
  // program
  'GET /program': 'read',
  'POST /program/generate': 'denied',
  'GET /program/generate/preview': 'denied',
  'DELETE /program': 'denied',
  'POST /program/evaluate': 'denied',
  'POST /program/updates/:id/acknowledge': 'denied',
  // exercises
  'GET /exercises': 'read',
  'GET /exercises/:id': 'read',
  'GET /exercises/:id/last-sets': 'read',
  'GET /exercises/:id/image': 'read',
  'GET /exercises/:id/thumb': 'read',
  'POST /exercises': 'write',
  'PATCH /exercises/:id': 'write',
  'POST /exercises/:id/restore': 'write',
  'DELETE /exercises/:id': 'write',
  'GET /exercises/:id/progression-suggestion': 'denied',
  // equipment
  'GET /equipment': 'read',
  'GET /equipment/:id/photo': 'read',
  'GET /equipment/:id/thumb': 'read',
  'POST /equipment': 'denied',
  'POST /equipment/analyze': 'denied',
  'DELETE /equipment/:id': 'denied',
  // stats
  'GET /stats/prs': 'read',
  'GET /stats/volume': 'read',
  'GET /stats/streak': 'read',
  'GET /stats/bodyweight': 'read',
  'GET /stats/frequency': 'read',
  'GET /stats/measurements': 'denied',
  // body
  'GET /body/weight': 'read',
  'POST /body/weight': 'denied',
  'GET /body/measurements': 'denied',
  'POST /body/measurements': 'denied',
  // photos
  'GET /photos': 'denied',
  'POST /photos': 'denied',
  'DELETE /photos/:id': 'denied',
  'GET /photos/:id/file': 'denied',
  'GET /photos/:id/thumb': 'denied',
  // misc
  'GET /me': 'read',
  'GET /ai-log': 'denied',
  'GET /health': 'denied',
  'GET /agent/schema': 'denied',
  'GET /agent/export': 'denied',
  'GET /agent/exercise-image': 'denied',
  'GET /agent/changes': 'denied',
  'POST /agent/apply': 'denied',
}

/** Keyed by file under src/. The disk test below fails when a controller file is not listed here. */
const CONTROLLERS: Record<string, Type> = {
  'agent/agent.controller.ts': AgentController,
  'ai-log/ai-log.controller.ts': AiLogController,
  'auth/me.controller.ts': MeController,
  'body/body.controller.ts': BodyController,
  'equipment/equipment.controller.ts': EquipmentController,
  'exercises/exercises.controller.ts': ExercisesController,
  'health.controller.ts': HealthController,
  'photos/photos.controller.ts': PhotosController,
  'profile/profile.controller.ts': ProfileController,
  'program/program.controller.ts': ProgramController,
  'progression/progression.controller.ts': ProgressionController,
  'schedules/schedules.controller.ts': SchedulesController,
  'sets/sets.controller.ts': SetsController,
  'stats/stats.controller.ts': StatsController,
  'workouts/workouts.controller.ts': WorkoutsController,
}

const SRC = join(__dirname, '..')

function controllerFilesOnDisk(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return controllerFilesOnDisk(path)
    }
    return entry.name.endsWith('.controller.ts') ? [relative(SRC, path)] : []
  })
}

/** "/a/" + "/b/:id" -> "a/b/:id": no global prefix, no empty segments. */
const joinPath = (...parts: string[]) =>
  '/' +
  parts
    .flatMap(p => p.split('/'))
    .filter(Boolean)
    .join('/')

function classify(): Record<string, Level> {
  const routes: Record<string, Level> = {}
  for (const controller of Object.values(CONTROLLERS)) {
    const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string
    const classLevel = Reflect.getMetadata(TRAINER_ACCESS, controller) as TrainerAccessLevel | undefined
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[name] as unknown
      if (name === 'constructor' || typeof handler !== 'function') {
        continue
      }
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined
      if (method === undefined) {
        continue
      }
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string
      const level = (Reflect.getMetadata(TRAINER_ACCESS, handler) as TrainerAccessLevel | undefined) ?? classLevel
      routes[`${RequestMethod[method]} ${joinPath(prefix, path)}`] = level ?? 'denied'
    }
  }
  return routes
}

describe('Trainer access by route', () => {
  it('every route is classified for Trainers', () => {
    expect(classify()).toEqual(EXPECTED)
  })

  it('lists every controller file on disk', () => {
    expect(controllerFilesOnDisk().sort()).toEqual(Object.keys(CONTROLLERS).sort())
  })

  it("no 'read' marking on a non-GET route", () => {
    const wrong = Object.entries(classify()).filter(([route, level]) => level === 'read' && !route.startsWith('GET '))
    expect(wrong).toEqual([])
  })
})
