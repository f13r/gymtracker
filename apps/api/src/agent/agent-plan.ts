import { and, eq } from 'drizzle-orm'

import {
  AGENT_WEEKDAYS,
  type AgentApplyError,
  type AgentChange,
  type AgentDocument,
  type AgentExerciseInput,
  type AgentTemplateInput,
  type AgentWeekday,
} from '@gymtracker/shared'

import { supersetLabels } from './agent-export.service'
import { commitStagedImage, type StagedImage } from './agent-images'
import type { DbExercise } from '../drizzle/mappers'
import * as schema from '../drizzle/schema'
import { exerciseImagePaths } from '../exercises/exercise-images'
import { removeExercise } from '../exercises/exercise-library'
import { deleteTemplateCascade, replaceTemplateExercises, type TemplateExerciseInput } from '../workouts/template-writes'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { randomUUID } from 'crypto'
import { unlinkSync } from 'fs'
import { join } from 'path'

type Db = NodePgDatabase<typeof schema>
type TemplateRow = typeof schema.workoutTemplates.$inferSelect

/** One write, run in order inside the apply's transaction. */
type Op = (tx: Db) => Promise<unknown>

export type Plan = {
  user: { id: string; displayName: string } | null
  changes: AgentChange[]
  errors: AgentApplyError[]
  ops: Op[]
  /** File work that must wait until the transaction has committed (image moves and deletions). */
  afterCommit: (() => void)[]
}

type ExerciseState = { id: string; name: string; archived: boolean; row?: DbExercise }
type TemplateState = { id: string; name: string; row?: TemplateRow }

const key = (name: string) => name.trim().toLowerCase()
const blankToNull = (text: string | null | undefined) => (text?.trim() ? text.trim() : null)

/** "Bench Press 3×8 @60kg [A]": one Template exercise as the diff shows it. */
function describeEntry(
  name: string,
  e: { sets: number | null; reps: number | null; weightKg: number | null },
  label?: string,
) {
  const weight = e.weightKg != null ? ` @${e.weightKg}kg` : ''
  return `${name} ${e.sets ?? '?'}×${e.reps ?? '?'}${weight}${label ? ` [${label}]` : ''}`
}

/**
 * Turn an apply document into the diff, the validation errors and the writes, reading the current
 * state through `db` (the apply's transaction). Pure planning: nothing is written until the caller
 * runs `ops`. `images` holds the downloaded image for each `exercises[i]` that has an `imageUrl`;
 * without it (a dry-run) the diff says the image will be fetched.
 */
export async function planDocument(
  db: Db,
  doc: AgentDocument,
  opts: { photosDir: string; images?: Map<number, StagedImage> },
): Promise<Plan> {
  const plan: Plan = { user: null, changes: [], errors: [], ops: [], afterCommit: [] }
  const error = (path: string, message: string) => plan.errors.push({ path, message })
  const now = Math.floor(Date.now() / 1000)

  if (doc.user) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, doc.user)).limit(1)
    if (user) {
      plan.user = { id: user.id, displayName: user.displayName }
    } else {
      error('user', `No User "${doc.user}"`)
    }
  }

  // ---- Exercises: the shared library, upserted by name --------------------------------------
  const library = new Map<string, ExerciseState>()
  for (const row of await db.select().from(schema.exercises)) {
    library.set(key(row.name), { id: row.id, name: row.name, archived: row.archivedAt != null, row })
  }
  const listedExercises = new Set<ExerciseState>()

  const planExercise = (item: AgentExerciseInput, i: number) => {
    const path = `exercises.${i}`
    let target = library.get(key(item.name))
    let renamedFrom: string | undefined
    if (item.renameFrom) {
      const source = library.get(key(item.renameFrom))
      if (source?.row) {
        if (target && target !== source) {
          return error(`${path}.name`, `An exercise named "${target.name}" already exists (409)`)
        }
        target = source
        renamedFrom = source.name !== item.name ? source.name : undefined
      } else if (!target) {
        return error(`${path}.renameFrom`, `No Exercise named "${item.renameFrom}"`)
      }
      // Source gone but the new name exists: already renamed earlier, so this is a plain update.
    }

    const changes: Record<string, { old: unknown; new: unknown }> = {}
    const entry: AgentChange = { entity: 'exercise', name: item.name, action: 'unchanged' }
    const staged = opts.images?.get(i)
    const imagePatch = (id: string) => (staged ? exerciseImagePaths(id) : {})
    if (item.imageUrl) {
      changes.image = { old: target?.row?.imagePath ? '(current image)' : null, new: item.imageUrl }
      if (!staged) {
        entry.note = 'image will be fetched on apply'
      }
    }

    if (!target) {
      const id = randomUUID()
      const values = {
        id,
        name: item.name,
        category: item.category ?? null,
        equipmentType: item.equipmentType ?? null,
        description: blankToNull(item.description),
        imagePath: null,
        thumbPath: null,
        archivedAt: null,
        createdAt: now,
        ...imagePatch(id),
      }
      for (const field of ['category', 'equipmentType', 'description'] as const) {
        if (values[field] != null) {
          changes[field] = { old: null, new: values[field] }
        }
      }
      const state = { id, name: item.name, archived: false }
      library.set(key(item.name), state)
      listedExercises.add(state)
      plan.ops.push(tx => tx.insert(schema.exercises).values(values))
      if (staged) {
        plan.afterCommit.push(() => commitStagedImage(opts.photosDir, staged, id))
      }
      plan.changes.push({ ...entry, action: 'created', ...(Object.keys(changes).length ? { changes } : {}) })
      return
    }

    const row = target.row!
    const patch: Partial<typeof schema.exercises.$inferInsert> = { ...imagePatch(row.id) }
    if (item.name !== row.name) {
      patch.name = item.name
      if (!renamedFrom) {
        changes.name = { old: row.name, new: item.name }
      }
    }
    for (const field of ['category', 'equipmentType'] as const) {
      if (item[field] !== undefined && (item[field] ?? null) !== row[field]) {
        patch[field] = item[field] ?? null
        changes[field] = { old: row[field], new: item[field] ?? null }
      }
    }
    if (item.description !== undefined && blankToNull(item.description) !== row.description) {
      patch.description = blankToNull(item.description)
      changes.description = { old: row.description, new: patch.description }
    }
    const restored = target.archived
    if (restored) {
      patch.archivedAt = null
      target.archived = false
    }
    library.delete(key(target.name))
    target.name = item.name
    library.set(key(item.name), target)
    listedExercises.add(target)

    if (Object.keys(patch).length > 0) {
      plan.ops.push(tx => tx.update(schema.exercises).set(patch).where(eq(schema.exercises.id, row.id)))
    }
    if (staged) {
      plan.afterCommit.push(() => {
        const paths = commitStagedImage(opts.photosDir, staged, row.id)
        unlinkStale(opts.photosDir, [row.imagePath, row.thumbPath], [paths.imagePath, paths.thumbPath])
      })
    }
    const action = restored ? 'restored' : renamedFrom ? 'renamed' : Object.keys(changes).length ? 'updated' : 'unchanged'
    plan.changes.push({
      ...entry,
      action,
      ...(renamedFrom ? { renamedFrom } : {}),
      ...(Object.keys(changes).length ? { changes } : {}),
    })
  }
  doc.exercises?.forEach(planExercise)

  // Exercises to remove, resolved against the library as this document leaves it.
  const removing = new Map<ExerciseState, number>()
  doc.remove?.exercises?.forEach((name, i) => {
    const target = library.get(key(name))
    if (!target) {
      error(`remove.exercises.${i}`, `No Exercise named "${name}"`)
    } else if (listedExercises.has(target)) {
      error(`remove.exercises.${i}`, `"${name}" is also listed under exercises`)
    } else {
      removing.set(target, i)
    }
  })

  // ---- Templates and the weekly Schedule of the named User ----------------------------------
  const user = plan.user
  if (user && (doc.templates || doc.weekly || doc.remove?.templates)) {
    const templateRows = await db
      .select()
      .from(schema.workoutTemplates)
      .where(eq(schema.workoutTemplates.userId, user.id))
    const templates = new Map<string, TemplateState>(templateRows.map(row => [key(row.name), { id: row.id, name: row.name, row }]))
    const templateName = new Map<string, TemplateState>(templateRows.map(row => [row.id, templates.get(key(row.name))!]))
    const schedules = await db.select().from(schema.workoutSchedules).where(eq(schema.workoutSchedules.userId, user.id))
    const exerciseName = new Map([...library.values()].map(e => [e.id, e.name]))

    doc.remove?.templates?.forEach((name, i) => {
      const target = templates.get(key(name))
      if (!target) {
        return error(`remove.templates.${i}`, `User has no Template "${name}"`)
      }
      if (doc.templates?.some(t => key(t.name) === key(name) || (t.renameFrom && key(t.renameFrom) === key(name)))) {
        return error(`remove.templates.${i}`, `"${name}" is also listed under templates`)
      }
      templates.delete(key(name))
      const scheduleCount = schedules.filter(s => s.templateId === target.id).length
      plan.changes.push({
        entity: 'template',
        name: target.name,
        action: 'deleted',
        ...(scheduleCount ? { note: `also deletes its ${scheduleCount} Schedule(s)` } : {}),
      })
      plan.ops.push(tx => deleteTemplateCascade(tx, target.id, user.id))
    })

    for (const [i, item] of (doc.templates ?? []).entries()) {
      await planTemplate(item, i)
    }

    async function planTemplate(item: AgentTemplateInput, i: number) {
      const path = `templates.${i}`
      let target = templates.get(key(item.name))
      let renamedFrom: string | undefined
      if (item.renameFrom) {
        const source = templates.get(key(item.renameFrom))
        if (source?.row) {
          if (target && target !== source) {
            return error(`${path}.name`, `A template named "${target.name}" already exists (409)`)
          }
          target = source
          renamedFrom = source.name !== item.name ? source.name : undefined
        } else if (!target) {
          return error(`${path}.renameFrom`, `User has no Template "${item.renameFrom}"`)
        }
      }

      let valid = true
      const resolved = item.exercises.map((e, j) => {
        const ex = library.get(key(e.exercise))
        const at = `${path}.exercises.${j}.exercise`
        if (!ex) {
          error(at, `No Exercise named "${e.exercise}"; add it under exercises`)
        } else if (ex.archived) {
          error(at, `Exercise "${ex.name}" is archived; list it under exercises to restore it`)
        } else if (removing.has(ex)) {
          error(at, `Exercise "${ex.name}" is also listed under remove.exercises`)
        } else {
          return ex
        }
        valid = false
        return undefined
      })
      if (!valid) {
        return
      }

      const oldRows = target?.row
        ? (
            await db.select().from(schema.templateExercises).where(eq(schema.templateExercises.templateId, target.id))
          ).sort((a, b) => a.orderIndex - b.orderIndex)
        : []
      const oldLabels = supersetLabels(oldRows.map(r => r.supersetGroup))
      const oldList = oldRows.map((r, j) =>
        describeEntry(
          exerciseName.get(r.exerciseId ?? '') ?? '?',
          { sets: r.defaultSets, reps: r.defaultReps, weightKg: r.defaultWeightKg },
          oldLabels[j],
        ),
      )
      const newLabels = supersetLabels(item.exercises.map(e => e.supersetGroup))
      const newList = item.exercises.map((e, j) =>
        describeEntry(resolved[j]!.name, { sets: e.sets, reps: e.reps, weightKg: e.weightKg ?? null }, newLabels[j]),
      )
      // A coach-set Equipment reference survives when its Exercise stays in the Template.
      const equipment = new Map(oldRows.filter(r => r.equipmentId).map(r => [r.exerciseId, r.equipmentId]))
      const groupIds = new Map<string, string>()
      const groupId = (label: string) => groupIds.get(label) ?? groupIds.set(label, randomUUID()).get(label)!
      const newRows: TemplateExerciseInput[] = item.exercises.map((e, j) => ({
        exerciseId: resolved[j]!.id,
        orderIndex: j,
        defaultSets: e.sets,
        defaultReps: e.reps,
        defaultWeightKg: e.weightKg ?? null,
        equipmentId: equipment.get(resolved[j]!.id) ?? null,
        supersetGroup: e.supersetGroup ? groupId(e.supersetGroup) : null,
      }))
      const listChanged = oldList.join('\n') !== newList.join('\n')

      const changes: Record<string, { old: unknown; new: unknown }> = {}
      if (!target) {
        const id = randomUUID()
        const notes = blankToNull(item.notes)
        const state = { id, name: item.name }
        templates.set(key(item.name), state)
        templateName.set(id, state)
        if (notes) {
          changes.notes = { old: null, new: notes }
        }
        changes.exercises = { old: [], new: newList }
        plan.ops.push(async tx => {
          await tx.insert(schema.workoutTemplates).values({ id, userId: user!.id, name: item.name, notes, createdAt: now })
          await replaceTemplateExercises(tx, id, newRows)
        })
        plan.changes.push({ entity: 'template', name: item.name, action: 'created', changes })
        return
      }

      const row = target.row!
      const patch: Partial<typeof schema.workoutTemplates.$inferInsert> = {}
      if (item.name !== row.name) {
        patch.name = item.name
        if (!renamedFrom) {
          changes.name = { old: row.name, new: item.name }
        }
      }
      if (item.notes !== undefined && blankToNull(item.notes) !== row.notes) {
        patch.notes = blankToNull(item.notes)
        changes.notes = { old: row.notes, new: patch.notes }
      }
      if (listChanged) {
        changes.exercises = { old: oldList, new: newList }
      }
      templates.delete(key(target.name))
      target.name = item.name
      templates.set(key(item.name), target)

      plan.ops.push(async tx => {
        if (Object.keys(patch).length > 0) {
          await tx
            .update(schema.workoutTemplates)
            .set(patch)
            .where(and(eq(schema.workoutTemplates.id, row.id), eq(schema.workoutTemplates.userId, user!.id)))
        }
        if (listChanged) {
          await replaceTemplateExercises(tx, row.id, newRows)
        }
      })
      const action = renamedFrom ? 'renamed' : Object.keys(changes).length ? 'updated' : 'unchanged'
      plan.changes.push({
        entity: 'template',
        name: item.name,
        action,
        ...(renamedFrom ? { renamedFrom } : {}),
        ...(Object.keys(changes).length ? { changes } : {}),
      })
    }

    // The weekly block replaces every weekly Schedule of the User; `once` Schedules stay.
    if (doc.weekly) {
      const weekly = doc.weekly
      const weeklyRows = schedules.filter(s => s.type === 'weekly')
      for (const [day, dow] of Object.entries(AGENT_WEEKDAYS) as [AgentWeekday, number][]) {
        const wanted = weekly[day] ?? null
        const template = wanted ? templates.get(key(wanted)) : undefined
        if (wanted && !template) {
          error(`weekly.${day}`, `User has no Template "${wanted}" (and this document creates none)`)
          continue
        }
        const current = weeklyRows.filter(s => s.dayOfWeek === dow)
        if (current.length === 0 && !template) {
          continue
        }
        const oldNames = current.map(s => templateName.get(s.templateId ?? '')?.name ?? '?').join(', ')
        if (current.length === 1 && template && current[0]!.templateId === template.id) {
          plan.changes.push({ entity: 'weekly', name: day, action: 'unchanged' })
          continue
        }
        plan.changes.push({
          entity: 'weekly',
          name: day,
          action: current.length === 0 ? 'created' : template ? 'updated' : 'deleted',
          changes: { template: { old: oldNames || null, new: template?.name ?? null } },
        })
        plan.ops.push(async tx => {
          for (const s of current) {
            await tx.delete(schema.workoutSchedules).where(eq(schema.workoutSchedules.id, s.id))
          }
          if (template) {
            await tx.insert(schema.workoutSchedules).values({
              id: randomUUID(),
              userId: user.id,
              templateId: template.id,
              type: 'weekly',
              scheduledDate: null,
              dayOfWeek: dow,
              createdAt: now,
            })
          }
        })
      }
    }
  }

  // ---- Exercise removals last, once the Templates no longer use them ------------------------
  for (const [target] of removing) {
    const entry: AgentChange = { entity: 'exercise', name: target.name, action: 'archived' }
    plan.changes.push(entry)
    plan.ops.push(async tx => {
      const row = target.row!
      const { archived } = await removeExercise(tx, row)
      entry.action = archived ? (row.archivedAt != null ? 'unchanged' : 'archived') : 'deleted'
      if (archived && row.archivedAt != null) {
        entry.note = 'already archived'
      }
      if (!archived) {
        plan.afterCommit.push(() => unlinkStale(opts.photosDir, [row.imagePath, row.thumbPath], []))
      }
    })
  }

  return plan
}

/** Delete superseded image files (relative to the photos dir), never one of `keep`. */
function unlinkStale(photosDir: string, paths: (string | null)[], keep: string[]) {
  for (const rel of paths) {
    if (rel && !keep.includes(rel)) {
      try {
        unlinkSync(join(photosDir, rel))
      } catch {} // eslint-disable-line no-empty
    }
  }
}
