import { Injectable } from '@nestjs/common'

export type AiLogEntry = {
  id: number
  type: string
  prompt: string
  response: string
  durationMs: number
  createdAt: string
  /** Owning user, or null for system/seed-time calls (e.g. coaching embeds). */
  userId: string | null
}

@Injectable()
export class AiLogService {
  private readonly logs: AiLogEntry[] = []
  private counter = 0
  private readonly maxLogs = 200

  /** `userId` is null for system/seed-time calls that belong to no user. */
  add(type: string, prompt: string, response: string, durationMs: number, userId: string | null = null) {
    this.logs.push({
      id: ++this.counter,
      type,
      prompt,
      response,
      durationMs,
      createdAt: new Date().toISOString(),
      userId,
    })
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
  }

  /** The requesting user's entries, newest first. System/seed entries are excluded. */
  getForUser(userId: string): AiLogEntry[] {
    return this.logs.filter(e => e.userId === userId).reverse()
  }
}
