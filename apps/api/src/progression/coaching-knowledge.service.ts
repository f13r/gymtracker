import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { GeminiService } from '../ai/gemini.service'
import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { COACHING_CHUNKS } from './coaching-knowledge'

@Injectable()
export class CoachingKnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(CoachingKnowledgeService.name)

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private readonly gemini: GeminiService,
  ) {}

  async onModuleInit() {
    try {
      await this.syncChunks()
    } catch (err) {
      this.logger.warn('Failed to sync coaching knowledge — suggestions will have no coaching context', err)
    }
  }

  /**
   * Reconciles the coaching_knowledge table with COACHING_CHUNKS. Only chunks
   * that are new or whose content has changed are re-embedded and upserted — so
   * editing the source text actually propagates to existing databases (the old
   * "seed only if empty" approach silently kept stale rows forever), while
   * unchanged chunks cost no Gemini embedding calls on boot.
   */
  private async syncChunks() {
    const existing = await this.db
      .select({ id: schema.coachingKnowledge.id, content: schema.coachingKnowledge.content })
      .from(schema.coachingKnowledge)
    const existingContentById = new Map(existing.map(r => [r.id, r.content]))

    const stale = COACHING_CHUNKS.filter(chunk => existingContentById.get(chunk.id) !== chunk.content)
    if (stale.length === 0) {
      this.logger.log(`Coaching knowledge up to date (${existing.length} rows), skipping`)
      return
    }

    this.logger.log(`Syncing ${stale.length} new/changed coaching knowledge chunk(s)...`)
    for (const chunk of stale) {
      const embedding = await this.gemini.embed(chunk.content)
      await this.db
        .insert(schema.coachingKnowledge)
        .values({ id: chunk.id, category: chunk.category, content: chunk.content, embedding })
        .onConflictDoUpdate({
          target: schema.coachingKnowledge.id,
          set: { content: chunk.content, embedding },
        })
    }
    this.logger.log('Coaching knowledge synced successfully')
  }

  async retrieveForSituation(situationSummary: string, userId: string): Promise<string[]> {
    const embedding = await this.gemini.embed(situationSummary, userId)
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
