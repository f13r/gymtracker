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
 * Last-Done Comparison aggregate for one Exercise: the Done-Set figures from the
 * most recent finished Session **strictly earlier** than `beforeStartedAt` in
 * which the Exercise was done. Returns at most one row; no row means "first time"
 * (no earlier occurrence). topSetKg/volume are null when that occurrence carried
 * no weight — bodyweight Sets store weight 0, so NULLIF(..., 0) collapses a
 * weightless top set / volume to null. Done Sets only (`done = 1 AND removed_at
 * IS NULL`). See CONTEXT.md (Last-Done Comparison).
 */
export function lastDoneAggregateSql(exerciseId: string, userId: string, beforeStartedAt: number): SQL {
  return sql`
    SELECT ws.started_at AS "comparedToStartedAt",
           NULLIF(MAX(s.weight_kg), 0) AS "topSetKg",
           COUNT(*)::int AS "doneSets",
           NULLIF(SUM(s.reps * s.weight_kg), 0) AS "volume"
    FROM sets s
    INNER JOIN workout_sessions ws ON ws.id = s.session_id
    WHERE ws.id = (
      SELECT ws2.id FROM workout_sessions ws2
      INNER JOIN sets s2 ON s2.session_id = ws2.id
      WHERE ws2.user_id = ${userId} AND s2.exercise_id = ${exerciseId}
        AND s2.done = 1 AND s2.removed_at IS NULL
        AND ws2.finished_at IS NOT NULL AND ws2.started_at < ${beforeStartedAt}
      ORDER BY ws2.started_at DESC LIMIT 1
    )
    AND s.exercise_id = ${exerciseId} AND s.done = 1 AND s.removed_at IS NULL
    GROUP BY ws.started_at
  `
}

/**
 * Canonical query for the **Done** Sets of the last finished Session in which a
 * given Exercise was done — the (2) tier of the Set Pre-population Hierarchy and
 * the source of the logger's "last time" reference. Returns every Set that was
 * actually performed then, ordered by set number, however many there were: the
 * count comes from history, never from the current Template.
 *
 * Planned-but-not-done and Removed Sets are excluded on both sides — the session
 * picked (a Session where the Exercise was merely planned and skipped is not the
 * last-done occurrence) and the rows returned. Used by exercises.getLastSets.
 */
export function lastFinishedSessionSetsSql(exerciseId: string, userId: string): SQL {
  return sql`
    SELECT s.id, s.session_id AS "sessionId", s.exercise_id AS "exerciseId",
           s.set_number AS "setNumber", s.reps, s.weight_kg AS "weightKg",
           s.duration_sec AS "durationSec", s.rpe,
           s.completed_at AS "completedAt", s.done, s.removed_at AS "removedAt",
           s.notes
    FROM sets s
    WHERE s.session_id = (
      SELECT ws.id FROM workout_sessions ws
      INNER JOIN sets s2 ON s2.session_id = ws.id
      WHERE ws.user_id = ${userId} AND s2.exercise_id = ${exerciseId}
        AND s2.done = 1 AND s2.removed_at IS NULL
        AND ws.finished_at IS NOT NULL
      ORDER BY ws.finished_at DESC LIMIT 1
    ) AND s.exercise_id = ${exerciseId} AND s.done = 1 AND s.removed_at IS NULL
    ORDER BY s.set_number ASC
  `
}
