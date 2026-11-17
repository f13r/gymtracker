import { eq } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import * as schema from '../drizzle/schema'
import type { LoggerService } from '@nestjs/common'

const EMAIL = /^[^\s@]+@[^\s@]+$/

/**
 * Sets each listed User's sign-in email from `HOUSEHOLD_EMAILS` (`userId:email,userId:email`).
 * Emails are personal data and the repo is public, so they live only in the server's env. Only
 * existing Users are updated; unknown ids and malformed entries are skipped with a warning.
 * Idempotent. Logs name User ids and entry positions, never an email.
 */
export async function applyHouseholdEmails(
  db: NodePgDatabase<typeof schema>,
  raw: string | undefined,
  logger: LoggerService,
): Promise<void> {
  const entries = (raw ?? '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)
  const updated: string[] = []

  for (const [i, entry] of entries.entries()) {
    const colon = entry.indexOf(':')
    const userId = colon === -1 ? '' : entry.slice(0, colon).trim()
    const email =
      colon === -1
        ? ''
        : entry
            .slice(colon + 1)
            .trim()
            .toLowerCase()
    if (!userId || !EMAIL.test(email)) {
      logger.warn(`HOUSEHOLD_EMAILS entry ${i + 1} is not "userId:email"; skipped`)
      continue
    }
    const byId = eq(schema.users.id, userId)
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(byId).limit(1)
    if (!user) {
      logger.warn(`HOUSEHOLD_EMAILS names unknown User '${userId}'; skipped`)
      continue
    }
    try {
      await db.update(schema.users).set({ email }).where(byId)
      updated.push(userId)
    } catch {
      // e.g. the same email listed for two Users (unique). The error text would carry the email.
      logger.warn(`HOUSEHOLD_EMAILS: could not set the email of User '${userId}'; skipped`)
    }
  }

  if (updated.length) {
    logger.log(`Household emails set for ${updated.length} User(s): ${updated.join(', ')}`)
  }
}
