import { eq } from 'drizzle-orm'

import * as schema from '../drizzle/schema'
import type { Logger } from '@nestjs/common'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from 'fs'
import { basename, join } from 'path'

/**
 * The one shared folder (relative to PHOTOS_DIR) that holds every Exercise Image (ADR 0012).
 * Per-User files (progress photos) stay under `<userId>/`.
 */
export const EXERCISE_IMAGE_DIR = 'exercises'

/** Relative paths of an Exercise's image and thumb in the shared folder. */
export function exerciseImagePaths(exerciseId: string) {
  return {
    imagePath: `${EXERCISE_IMAGE_DIR}/${exerciseId}-orig.webp`,
    thumbPath: `${EXERCISE_IMAGE_DIR}/${exerciseId}-thumb.webp`,
  }
}

type ImagePaths = { imagePath: string | null; thumbPath: string | null }

export type RelocateResult =
  | ({ status: 'unchanged' | 'moved' } & ImagePaths)
  | ({ status: 'skipped'; reason: string } & ImagePaths)

const inSharedDir = (rel: string) => rel.startsWith(`${EXERCISE_IMAGE_DIR}/`)

/**
 * Move one Exercise's image and thumb into the shared folder and return the paths to store.
 *
 * Idempotent and loss-free: a file already in place is left alone, a file already moved by an
 * interrupted earlier run is picked up, and when a file cannot be placed (missing, or a
 * different file already holds its shared name) nothing is moved and the result is `skipped`
 * with the old paths, so the row keeps pointing at the files it has.
 */
export function relocateExerciseImage(photosDir: string, paths: ImagePaths): RelocateResult {
  const plan: Array<{ from: string; to: string; action: 'rename' | 'drop-source' | 'none' }> = []
  for (const rel of [paths.imagePath, paths.thumbPath]) {
    if (!rel || inSharedDir(rel)) {
      continue
    }
    const to = `${EXERCISE_IMAGE_DIR}/${basename(rel)}`
    const src = join(photosDir, rel)
    const dst = join(photosDir, to)
    const srcExists = existsSync(src)
    const dstExists = existsSync(dst)
    if (srcExists && !dstExists) {
      plan.push({ from: rel, to, action: 'rename' })
    } else if (!srcExists && dstExists) {
      plan.push({ from: rel, to, action: 'none' }) // moved by an earlier, interrupted run
    } else if (srcExists && dstExists) {
      if (!readFileSync(src).equals(readFileSync(dst))) {
        return { status: 'skipped', reason: `${to} already exists with different content`, ...paths }
      }
      plan.push({ from: rel, to, action: 'drop-source' })
    } else {
      return { status: 'skipped', reason: `${rel} is missing`, ...paths }
    }
  }
  if (plan.length === 0) {
    return { status: 'unchanged', ...paths }
  }

  mkdirSync(join(photosDir, EXERCISE_IMAGE_DIR), { recursive: true })
  for (const step of plan) {
    if (step.action === 'rename') {
      renameSync(join(photosDir, step.from), join(photosDir, step.to))
    } else if (step.action === 'drop-source') {
      unlinkSync(join(photosDir, step.from)) // byte-identical copy already in place
    }
  }
  const moved = (rel: string | null) => plan.find(s => s.from === rel)?.to ?? rel
  return { status: 'moved', imagePath: moved(paths.imagePath), thumbPath: moved(paths.thumbPath) }
}

/**
 * Boot step: move every Exercise Image still outside the shared folder into it and rewrite the
 * row. Safe to run on every boot; once everything is in place it only reads.
 */
export async function relocateExerciseImages(
  db: NodePgDatabase<typeof schema>,
  photosDir: string,
  logger: Pick<Logger, 'log' | 'warn'>,
): Promise<void> {
  const rows = await db
    .select({ id: schema.exercises.id, imagePath: schema.exercises.imagePath, thumbPath: schema.exercises.thumbPath })
    .from(schema.exercises)
  let moved = 0
  for (const row of rows) {
    const result = relocateExerciseImage(photosDir, row)
    if (result.status === 'skipped') {
      logger.warn(`Exercise ${row.id}: image not moved to the shared folder: ${result.reason}`)
    } else if (result.status === 'moved') {
      await db
        .update(schema.exercises)
        .set({ imagePath: result.imagePath, thumbPath: result.thumbPath })
        .where(eq(schema.exercises.id, row.id))
      moved++
    }
  }
  if (moved > 0) {
    logger.log(`Moved ${moved} Exercise image(s) to ${EXERCISE_IMAGE_DIR}/`)
  }
}
