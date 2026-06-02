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
