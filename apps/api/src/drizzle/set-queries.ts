import { eq, sql, type SQL } from 'drizzle-orm'

import * as schema from './schema'

/**
 * Centralised Drizzle predicates and SQL fragments for Set queries.
 *
 * The `done = 1` predicate and the Volume formula (`reps * weight`) were
 * previously re-typed in many services. SQL cannot import the JS helpers from
 * `@gymtracker/shared` (those operate on in-memory WorkoutSet arrays), so these
 * fragments are the single source of truth for the query-side equivalents.
 * In-memory aggregation paths should use `getDoneSets` / `calculateVolume` from
 * `@gymtracker/shared` instead.
 */

/** Done-Set predicate for Drizzle query-builder `.where(...)` clauses. */
export const doneSetFilter: SQL = eq(schema.sets.done, 1)

/** Done-Set predicate as a raw fragment for hand-written `db.execute(sql\`...\`)` (table alias `s`). */
export const doneSetSql: SQL = sql`s.done = 1`

/**
 * Volume SUM expression for Drizzle query-builder selects, referencing the
 * `sets` schema columns. Equivalent to `calculateVolume` summed in SQL.
 */
export const volumeSumExpr = sql<number>`SUM(${schema.sets.reps} * ${schema.sets.weightKg})`

/** Volume SUM expression as a raw fragment for hand-written SQL (table alias `s`). */
export const volumeSumSql: SQL = sql`SUM(s.reps * s.weight_kg)`

/**
 * Canonical query for the Done + Planned Sets of the last finished Session that
 * contains a given Exercise — the (2) tier of the Set Pre-population Hierarchy.
 * Returns sets ordered by set number. Used by exercises.getLastSets.
 */
export function lastFinishedSessionSetsSql(exerciseId: string, userId: string): SQL {
  return sql`
    SELECT s.id, s.session_id AS "sessionId", s.exercise_id AS "exerciseId",
           s.set_number AS "setNumber", s.reps, s.weight_kg AS "weightKg",
           s.duration_sec AS "durationSec", s.rpe,
           s.completed_at AS "completedAt", s.done
    FROM sets s
    WHERE s.session_id = (
      SELECT ws.id FROM workout_sessions ws
      INNER JOIN sets s2 ON s2.session_id = ws.id
      WHERE ws.user_id = ${userId} AND s2.exercise_id = ${exerciseId} AND ws.finished_at IS NOT NULL
      ORDER BY ws.finished_at DESC LIMIT 1
    ) AND s.exercise_id = ${exerciseId}
    ORDER BY s.set_number ASC
  `
}
