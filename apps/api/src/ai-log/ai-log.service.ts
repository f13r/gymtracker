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
  /** One ring per owner (null = system/seed), so one User's traffic never evicts another's. */
  private readonly logs = new Map<string | null, AiLogEntry[]>()
  private counter = 0
  private readonly maxLogsPerUser = 200

  /** `userId` is null for system/seed-time calls that belong to no user. */
  add(type: string, prompt: string, response: string, durationMs: number, userId: string | null = null) {
    let ring = this.logs.get(userId)
    if (!ring) {
      ring = []
      this.logs.set(userId, ring)
    }
    ring.push({
      id: ++this.counter,
      type,
      prompt,
      response,
      durationMs,
      createdAt: new Date().toISOString(),
      userId,
    })
    if (ring.length > this.maxLogsPerUser) {
      ring.shift()
    }
  }

  /** The requesting user's entries, newest first. System/seed entries are excluded. */
  getForUser(userId: string): AiLogEntry[] {
    return [...(this.logs.get(userId) ?? [])].reverse()
  }
}
