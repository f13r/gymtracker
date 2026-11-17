import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { AgentApplyError, AgentApplyResult, AgentDocument } from '@gymtracker/shared'

import {
  IMAGE_CLIENT,
  ImageFetchError,
  discardStagedImage,
  downloadImage,
  stageExerciseImage,
  type ImageClient,
  type StagedImage,
} from './agent-images'
import { planDocument, type Plan } from './agent-plan'
import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'

/** Thrown inside the transaction to undo it while handing back the diff (dry-run or invalid). */
class Rollback extends Error {
  constructor(readonly result: AgentApplyResult) {
    super('rollback')
  }
}

function toResult(plan: Plan): AgentApplyResult {
  const summary: AgentApplyResult['summary'] = {}
  for (const change of plan.changes) {
    summary[change.action] = (summary[change.action] ?? 0) + 1
  }
  return { applied: false, changeId: null, user: plan.user, changes: plan.changes, errors: plan.errors, summary }
}

/**
 * Applies the Agent's document: plan, then run every write in one transaction. A dry-run runs the
 * same writes and rolls them back, so its diff is exactly what an apply would do (archive vs
 * delete included). Images are downloaded only on confirm, before the transaction; their files are
 * moved into place only after it commits.
 */
@Injectable()
export class AgentApplyService {
  private readonly logger = new Logger('Agent')
  private readonly photosDir: string

  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(ConfigService) config: ConfigService,
    @Inject(IMAGE_CLIENT) private readonly imageClient: ImageClient,
  ) {
    this.photosDir = config.getOrThrow<string>('PHOTOS_DIR')
  }

  async apply(doc: AgentDocument, confirm: boolean): Promise<AgentApplyResult> {
    const dryRun = await this.run(doc)
    if (!confirm || dryRun.errors.length > 0) {
      return dryRun
    }
    const images = new Map<number, StagedImage>()
    try {
      const errors = await this.downloadImages(doc, images)
      if (errors.length > 0) {
        return { ...dryRun, errors }
      }
      return await this.run(doc, images)
    } finally {
      // Committed images were renamed away already; this drops the rest.
      images.forEach(discardStagedImage)
    }
  }

  /** Plan and write in one transaction; commits only with `images` given (the confirmed apply). */
  private async run(doc: AgentDocument, images?: Map<number, StagedImage>): Promise<AgentApplyResult> {
    const commit = images !== undefined
    let afterCommit: (() => void)[] = []
    let result: AgentApplyResult
    try {
      result = await this.db.transaction(async tx => {
        const plan = await planDocument(tx, doc, { photosDir: this.photosDir, ...(images ? { images } : {}) })
        if (plan.errors.length > 0) {
          throw new Rollback(toResult(plan))
        }
        for (const op of plan.ops) {
          await op(tx)
        }
        const diff = toResult(plan)
        if (!commit) {
          throw new Rollback(diff)
        }
        const changeId = randomUUID()
        await tx.insert(schema.agentChanges).values({
          id: changeId,
          createdAt: Math.floor(Date.now() / 1000),
          targetUserId: plan.user?.id ?? null,
          document: doc,
          diff,
        })
        afterCommit = plan.afterCommit
        return { ...diff, applied: true, changeId }
      })
    } catch (err) {
      if (err instanceof Rollback) {
        return err.result
      }
      throw err
    }
    for (const step of afterCommit) {
      try {
        step()
      } catch (err) {
        this.logger.error(`Agent change ${result.changeId}: an image file step failed (${(err as Error).name})`)
      }
    }
    this.logger.log(
      `Applied agent change ${result.changeId} for ${result.user?.id ?? 'library only'}: ${JSON.stringify(result.summary)}`,
    )
    return result
  }

  private async downloadImages(doc: AgentDocument, images: Map<number, StagedImage>): Promise<AgentApplyError[]> {
    const errors: AgentApplyError[] = []
    for (const [i, item] of (doc.exercises ?? []).entries()) {
      if (!item.imageUrl) {
        continue
      }
      try {
        images.set(i, await stageExerciseImage(this.photosDir, await downloadImage(this.imageClient, item.imageUrl)))
      } catch (err) {
        const message = err instanceof ImageFetchError ? err.message : 'Image could not be processed'
        errors.push({ path: `exercises.${i}.imageUrl`, message })
      }
    }
    return errors
  }
}
