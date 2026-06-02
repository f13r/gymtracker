import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { AiLogService } from '../ai-log/ai-log.service'

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
export const GEMINI_GENERATE_MODEL = 'gemini-2.5-flash'
export const GEMINI_EMBED_MODEL = 'gemini-embedding-001'
/** Must match the coaching_knowledge.embedding pgvector column dimension. */
export const GEMINI_EMBED_DIMENSIONS = 768

type GeminiGenerateRaw = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

type GeminiEmbedRaw = {
  embedding: { values: number[] }
}

export interface GenerateStructuredOptions {
  /** AiLog feature tag, e.g. 'equipment', 'progression', 'program'. */
  feature: string
  /** Text prompt. Always logged as the request prompt. */
  prompt: string
  /** Optional extra parts (e.g. inline image data) placed before the text part. */
  parts?: unknown[]
  /** Optional Gemini responseSchema for structured output. */
  responseSchema?: object
  /** Owning user for the Ai-log entry; omit for system/seed-time calls. */
  userId?: string | null
}

/**
 * Owns ALL Gemini HTTP interaction: base URL, model constants, the API key,
 * the request envelope, structured-output config, JSON parsing, and AiLog
 * logging on EVERY call (success, error status, empty response). AiLogService
 * is injected so that logging is guaranteed by construction — no AI feature can
 * call Gemini without being logged.
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name)
  private readonly apiKey: string

  constructor(
    config: ConfigService,
    private readonly aiLog: AiLogService,
  ) {
    this.apiKey = config.getOrThrow<string>('GEMINI_API_KEY')
  }

  /**
   * Calls the generate-content endpoint with structured-output config and
   * returns the parsed JSON. Logs the request/response (and elapsed ms) on
   * every outcome. Throws on non-OK status or empty response.
   */
  async generateStructured<T>(opts: GenerateStructuredOptions): Promise<T> {
    const { feature, prompt, parts, responseSchema, userId = null } = opts
    const t0 = Date.now()

    const contentParts: unknown[] = parts ? [...parts, { text: prompt }] : [{ text: prompt }]
    const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json' }
    if (responseSchema) {
      generationConfig.responseSchema = responseSchema
    }

    const response = await fetch(
      `${GEMINI_BASE_URL}/${GEMINI_GENERATE_MODEL}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: contentParts }],
          generationConfig,
        }),
      },
    )

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)')
      this.aiLog.add(feature, prompt, `ERROR ${response.status}: ${body}`, Date.now() - t0, userId)
      this.logger.error(`Gemini ${response.status}: ${body}`)
      throw new Error(`Gemini ${response.status}: ${body}`)
    }

    const json = (await response.json()) as GeminiGenerateRaw
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      this.aiLog.add(feature, prompt, '(empty response)', Date.now() - t0, userId)
      throw new Error('Gemini returned empty response')
    }

    this.aiLog.add(feature, prompt, text, Date.now() - t0, userId)

    return JSON.parse(text) as T
  }

  /**
   * Calls the embed-content endpoint and returns the embedding vector. Logs the
   * outcome under the 'embedding' feature tag. Throws on non-OK status.
   */
  async embed(text: string, userId: string | null = null): Promise<number[]> {
    const t0 = Date.now()
    const response = await fetch(
      `${GEMINI_BASE_URL}/${GEMINI_EMBED_MODEL}:embedContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${GEMINI_EMBED_MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: GEMINI_EMBED_DIMENSIONS,
        }),
      },
    )

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)')
      this.aiLog.add('embedding', text, `ERROR ${response.status}: ${body}`, Date.now() - t0, userId)
      this.logger.error(`Gemini embed ${response.status}: ${body}`)
      throw new Error(`Gemini embed ${response.status}: ${body}`)
    }

    const json = (await response.json()) as GeminiEmbedRaw
    this.aiLog.add('embedding', text, `(embedding: ${json.embedding.values.length} dims)`, Date.now() - t0, userId)
    return json.embedding.values
  }
}
