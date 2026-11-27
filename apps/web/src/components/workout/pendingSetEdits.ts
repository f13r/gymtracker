/**
 * Registry of Set rows holding a typed-but-not-yet-saved edit (the row debounces
 * its PATCH). Anything that leaves the logger — Finish, Back, switching Exercise —
 * must flush these first, or the debounce timer dies with the row and the edit
 * is lost.
 */
const pending = new Set<() => Promise<unknown> | void>()

export function registerPendingSetEdit(flush: () => Promise<unknown> | void) {
  pending.add(flush)
  return () => {
    pending.delete(flush)
  }
}

export async function flushPendingSetEdits() {
  await Promise.all([...pending].map(flush => flush()))
}
