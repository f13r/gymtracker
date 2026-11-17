import { Column, getTableColumns, getTableName, type SQL, type Table } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * A tiny in-memory stand-in for the Drizzle query builder, for unit tests that
 * need to prove per-User scoping (two Users, `u1` / `u2`).
 *
 * Each stored row carries a `match` map keyed `"table.column"` (DB column
 * names). A query's WHERE clause is rendered to SQL, and every
 * `"table"."column" = $n` term in it filters the rows: a row is returned only if
 * each such term agrees with its `match` value. Terms on columns a row does not
 * know about, and non-equality terms (`>=`, `is not null`, …), are ignored.
 *
 * So a query that does *not* filter by owner returns another User's row — just
 * like the real database would — and a test can catch the leak.
 *
 * Rows for a joined query live under the FROM table; seed them with the joined
 * columns as `extraMatch`, e.g. `{ 'programs.user_id': 'u1' }`.
 */

type Row = { match: Record<string, unknown>; value: Record<string, unknown> }

const dialect = new PgDialect()
const EQ_TERM = /^"(\w+)"\."(\w+)" = \$(\d+)$/

/** Evaluates the rendered WHERE (`and` / `or` / parentheses) against one row. */
function matches(row: Row, where: SQL | undefined): boolean {
  if (!where) {
    return true
  }
  const { sql, params } = dialect.sqlToQuery(where)
  const tokens = sql
    .split(/(\(|\)|\band\b|\bor\b)/)
    .map(t => t.trim())
    .filter(Boolean)
  let i = 0

  const atom = (text: string) => {
    const m = EQ_TERM.exec(text)
    if (!m) {
      return true
    }
    const key = `${m[1]}.${m[2]}`
    return !(key in row.match) || row.match[key] === params[Number(m[3]) - 1]
  }
  const primary = (): boolean => {
    let result = true
    while (i < tokens.length && ![')', 'and', 'or'].includes(tokens[i] ?? '')) {
      if (tokens[i] === '(') {
        i++
        const inner = disjunction()
        i++ // ')'
        result = result && inner
      } else {
        result = atom(tokens[i++] ?? '') && result
      }
    }
    return result
  }
  const conjunction = (): boolean => {
    let result = primary()
    while (tokens[i] === 'and') {
      i++
      result = primary() && result
    }
    return result
  }
  const disjunction = (): boolean => {
    let result = conjunction()
    while (tokens[i] === 'or') {
      i++
      result = conjunction() || result
    }
    return result
  }
  return disjunction()
}

function matchFor(table: Table, value: Record<string, unknown>): Record<string, unknown> {
  const name = getTableName(table)
  const match: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (key in value) {
      match[`${name}.${column.name}`] = value[key]
    }
  }
  return match
}

export function createFakeDb() {
  const store = new Map<string, Row[]>()
  const rowsOf = (table: Table) => {
    const name = getTableName(table)
    if (!store.has(name)) {
      store.set(name, [])
    }
    return store.get(name)!
  }

  function select(fields?: Record<string, unknown>) {
    return {
      from(table: Table) {
        let where: SQL | undefined
        let limit: number | undefined
        const run = () => {
          const found = rowsOf(table)
            .filter(r => matches(r, where))
            .slice(0, limit)
          if (!fields) {
            return found.map(r => ({ ...r.value }))
          }
          // A non-column field (e.g. count()) can only be an aggregate here.
          const aggregate = Object.values(fields).some(f => !(f instanceof Column))
          if (aggregate) {
            return [
              Object.fromEntries(
                Object.entries(fields).map(([k, f]) => [k, f instanceof Column ? undefined : found.length]),
              ),
            ]
          }
          return found.map(r =>
            Object.fromEntries(
              Object.entries(fields).map(([k, f]) => {
                const col = f as Column
                return [k, r.match[`${getTableName(col.table)}.${col.name}`]]
              }),
            ),
          )
        }
        const query = {
          innerJoin: () => query,
          leftJoin: () => query,
          where(cond: SQL | undefined) {
            where = cond
            return query
          },
          orderBy: () => query,
          limit(n: number) {
            limit = n
            return query
          },
          then<T>(resolve: (rows: Record<string, unknown>[]) => T, reject?: (e: unknown) => T) {
            return Promise.resolve().then(run).then(resolve, reject)
          },
        }
        return query
      },
    }
  }

  const db = {
    select,
    selectDistinct: select,
    insert(table: Table) {
      return {
        values(value: Record<string, unknown> | Record<string, unknown>[]) {
          const values = Array.isArray(value) ? value : [value]
          for (const v of values) {
            rowsOf(table).push({ match: matchFor(table, v), value: { ...v } })
          }
          const done = Promise.resolve(values)
          return {
            returning: () => done,
            onConflictDoUpdate: () => done,
            onConflictDoNothing: () => done,
            then: done.then.bind(done),
          }
        },
      }
    },
    update(table: Table) {
      return {
        set(patch: Record<string, unknown>) {
          return {
            where(cond: SQL | undefined) {
              for (const r of rowsOf(table).filter(row => matches(row, cond))) {
                Object.assign(r.value, patch)
                Object.assign(r.match, matchFor(table, patch))
              }
              return Promise.resolve()
            },
          }
        },
      }
    },
    delete(table: Table) {
      return {
        where(cond: SQL | undefined) {
          const rows = rowsOf(table)
          const kept = rows.filter(r => !matches(r, cond))
          rows.splice(0, rows.length, ...kept)
          return Promise.resolve()
        },
      }
    },
    execute: () => Promise.resolve({ rows: [] }),
    transaction<T>(fn: (tx: unknown) => Promise<T>) {
      return fn(db)
    },

    /** Put a row in the fake. `extraMatch` adds joined columns (`"table.column"` keys). */
    seed(table: Table, value: Record<string, unknown>, extraMatch: Record<string, unknown> = {}) {
      rowsOf(table).push({ match: { ...matchFor(table, value), ...extraMatch }, value: { ...value } })
    },
    /** Current rows of a table, as stored. */
    rows(table: Table) {
      return rowsOf(table).map(r => r.value)
    },
  }
  return db
}

export type FakeDb = ReturnType<typeof createFakeDb>
