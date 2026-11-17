/**
 * The Agent's apply document (`POST /api/agent/apply`) and what the Agent API answers.
 *
 * This is the single source of the document's shape: the API validates with it and serves it as JSON
 * Schema at `GET /api/agent/schema`, which the Agent's skill reads. It uses zod's v4 API (shipped in
 * the zod 3.25 package as `zod/v4`) for its built-in JSON Schema output; the rest of this package
 * stays on the classic v3 API.
 */
import { z } from 'zod/v4'

import { ExerciseCategorySchema, ExerciseEquipmentSchema } from './exercise.schema.js'

/** Weekday keys of the `weekly` block, mapped to `workout_schedules.day_of_week` (JS `getDay()`). */
export const AGENT_WEEKDAYS = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 } as const
export type AgentWeekday = keyof typeof AGENT_WEEKDAYS

const Name = z.string().trim().min(1).max(100)

const AgentExerciseSchema = z
  .object({
    name: Name.describe('Exercise name; matched case-insensitively against the shared library (upsert key).'),
    renameFrom: Name.optional().describe('Current name of an existing Exercise to rename to `name`.'),
    category: z.enum(ExerciseCategorySchema.options).nullable().optional(),
    equipmentType: z.enum(ExerciseEquipmentSchema.options).nullable().optional(),
    description: z
      .string()
      .max(4000)
      .nullable()
      .optional()
      .describe('Shared reference/how-to text. Omit to keep, null to clear.'),
    imageUrl: z
      .url()
      .refine(url => url.startsWith('https://'), 'Must be an https URL')
      .optional()
      .describe(
        'https URL of a JPEG/PNG/WebP/GIF/AVIF image (max 10 MB). Fetched on apply and stored as the Exercise Image, replacing any current one. Omit to keep the current image.',
      ),
  })
  .strict()
  .describe('Created when no Exercise has this name; otherwise its given fields are updated. Omitted fields are kept.')

const AgentTemplateExerciseSchema = z
  .object({
    exercise: Name.describe('Exercise name: in the library, or created/restored by this document.'),
    sets: z.number().int().min(1).max(20),
    reps: z.number().int().min(1).max(100),
    weightKg: z.number().min(0).max(1000).nullable().optional(),
    supersetGroup: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .optional()
      .describe('Label shared by the members of one Superset (e.g. "A"), unique within the Template.'),
  })
  .strict()

const AgentTemplateSchema = z
  .object({
    name: Name.describe('Template name, unique per User ignoring case (upsert key).'),
    renameFrom: Name.optional().describe("Current name of one of the User's Templates to rename to `name`."),
    notes: z.string().max(500).nullable().optional().describe('Omit to keep, null to clear.'),
    exercises: z
      .array(AgentTemplateExerciseSchema)
      .min(1)
      .max(40)
      .describe("The Template's whole exercise list, in order. Replaces the current list."),
  })
  .strict()

const weekdayShape = Object.fromEntries(
  Object.keys(AGENT_WEEKDAYS).map(day => [day, Name.nullable().optional()]),
) as Record<AgentWeekday, z.ZodOptional<z.ZodNullable<typeof Name>>>

const AgentWeeklySchema = z
  .object(weekdayShape)
  .strict()
  .describe(
    "Replaces the User's whole weekly Schedule: each day names a Template (of this User, or one in this document); null or omitted = no weekly workout that day. One-off (`once`) Schedules are never touched.",
  )

const AgentRemoveSchema = z
  .object({
    exercises: z
      .array(Name)
      .optional()
      .describe('Exercise names. Archived if anything still references them, deleted otherwise.'),
    templates: z.array(Name).optional().describe("Names of the User's Templates to delete."),
  })
  .strict()

export const AgentDocumentSchema = z
  .object({
    user: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Target User id. Required with `templates`, `weekly` or `remove.templates`.'),
    exercises: z.array(AgentExerciseSchema).optional(),
    templates: z.array(AgentTemplateSchema).optional(),
    weekly: AgentWeeklySchema.optional(),
    remove: AgentRemoveSchema.optional(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    if (!doc.user && (doc.templates || doc.weekly || doc.remove?.templates)) {
      ctx.addIssue({ code: 'custom', path: ['user'], message: 'Name the target User for templates and weekly' })
    }
    const once = (names: string[], path: string) => {
      const seen = new Set<string>()
      names.forEach((name, i) => {
        const key = name.toLowerCase()
        if (seen.has(key)) {
          ctx.addIssue({ code: 'custom', path: [path, i, 'name'], message: `"${name}" is listed twice` })
        }
        seen.add(key)
      })
    }
    once(doc.exercises?.map(e => e.name) ?? [], 'exercises')
    once(doc.templates?.map(t => t.name) ?? [], 'templates')
  })
  .describe(
    "Changes for the shared Exercise library and one User's Templates and weekly Schedule. Only listed items change; removals are explicit in `remove`. Applied all-or-nothing.",
  )

export type AgentDocument = z.infer<typeof AgentDocumentSchema>
export type AgentExerciseInput = z.infer<typeof AgentExerciseSchema>
export type AgentTemplateInput = z.infer<typeof AgentTemplateSchema>
export type AgentTemplateExerciseInput = z.infer<typeof AgentTemplateExerciseSchema>
export type AgentWeekly = z.infer<typeof AgentWeeklySchema>

/** The apply document as JSON Schema (draft 2020-12), describing the input the API accepts. */
export function agentDocumentJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(AgentDocumentSchema, { io: 'input' }) as Record<string, unknown>
}

// ---- What the Agent API answers -------------------------------------------------------------

export type AgentChangeAction = 'created' | 'updated' | 'renamed' | 'restored' | 'archived' | 'deleted' | 'unchanged'

/**
 * One entity in the diff. `name` is the entity's name after the change (a weekday key for `weekly`).
 * A `renamed` or `restored` entry may also list field `changes`; a restored entry that was also
 * renamed carries `renamedFrom`.
 */
export type AgentChange = {
  entity: 'exercise' | 'template' | 'weekly'
  name: string
  action: AgentChangeAction
  renamedFrom?: string
  changes?: Record<string, { old: unknown; new: unknown }>
  note?: string
}

export type AgentApplyError = { path: string; message: string }

export type AgentApplyResult = {
  /** True only when `confirm=true` and the whole document was written. */
  applied: boolean
  /** The `agent_changes` row of an applied document. */
  changeId: string | null
  user: { id: string; displayName: string } | null
  changes: AgentChange[]
  errors: AgentApplyError[]
  summary: Partial<Record<AgentChangeAction, number>>
}

export type AgentTemplateExport = {
  name: string
  notes: string | null
  exercises: {
    exercise: string
    sets: number | null
    reps: number | null
    weightKg: number | null
    supersetGroup?: string
  }[]
}

export type AgentExerciseSummary = {
  exercise: string
  sessions: number
  dates: string[]
  doneSets: number
  missedSets: number
  removedSets: number
  bestSet: { weightKg: number; reps: number | null; date: string } | null
  volumeKg: number
}

export type AgentExport = {
  generatedAt: string
  exercises: {
    name: string
    category: string | null
    equipmentType: string | null
    description: string | null
    hasImage: boolean
    archived: boolean
  }[]
  user?: {
    id: string
    displayName: string
    profile: Record<string, unknown> | null
    templates: AgentTemplateExport[]
    weekly: Record<AgentWeekday, string | null>
    history: { weeks: number; from: string; to: string; exercises: AgentExerciseSummary[] }
  }
  recentChanges: { id: string; createdAt: string; targetUserId: string | null; summary: AgentApplyResult['summary'] }[]
}
