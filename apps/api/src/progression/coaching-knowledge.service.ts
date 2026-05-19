import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { sql } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { COACHING_CHUNKS } from './coaching-knowledge'

const GEMINI_EMBED_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent'

@Injectable()
export class CoachingKnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(CoachingKnowledgeService.name)
  private readonly geminiApiKey: string

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    config: ConfigService,
  ) {
    this.geminiApiKey = config.getOrThrow<string>('GEMINI_API_KEY')
  }

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
      const embedding = await this.embedText(chunk.content)
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

  private async embedText(text: string): Promise<number[]> {
    const response = await fetch(`${GEMINI_EMBED_URL}?key=${this.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)')
      throw new Error(`Gemini embed ${response.status}: ${body}`)
    }

    const json = await response.json() as { embedding: { values: number[] } }
    return json.embedding.values
  }

  async retrieveForSituation(situationSummary: string): Promise<string[]> {
    const embedding = await this.embedText(situationSummary)
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
