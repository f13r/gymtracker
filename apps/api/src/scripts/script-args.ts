import type { Pool } from 'pg'

/** The User a per-User script acts on: `--user <id>` or `--user=<id>`. Throws when missing. */
export function requireUserArg(args: string[]): string {
  const i = args.findIndex(a => a === '--user' || a.startsWith('--user='))
  const arg = args[i]
  const value = arg?.startsWith('--user=') ? arg.slice('--user='.length) : args[i + 1]
  if (i === -1 || !value || value.startsWith('--')) {
    throw new Error('Missing --user <id>: name the User this script acts on (select id from users)')
  }
  return value
}

/** Refuse to write for a User that does not exist (Users are provisioned by migration/SQL only). */
export async function assertUserExists(pool: Pool, userId: string): Promise<void> {
  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId])
  if (!rowCount) {
    throw new Error(`No User '${userId}' (select id from users)`)
  }
}
