// Shared display rules for Supersets so the template editor and the active-workout
// overview stay visually consistent (same accent per group, same letter labels).

// Distinct accents per Superset, cycled by order of first appearance. Standalone rows stay neutral.
export const SUPERSET_PALETTE = ['#818cf8', '#2dd4bf', '#fbbf24', '#f472b6', '#34d399', '#c084fc']

/**
 * Assign each Superset an accent + letter label by order of first appearance in
 * `groups`, so distinct groups are visually separable and stable across re-renders.
 * Pass the supersetGroup ids in display order; null entries (standalone) are skipped.
 */
export function buildSupersetMeta(groups: (string | null)[]): Map<string, { color: string; label: string }> {
  const meta = new Map<string, { color: string; label: string }>()
  for (const group of groups) {
    if (group != null && !meta.has(group)) {
      meta.set(group, {
        color: SUPERSET_PALETTE[meta.size % SUPERSET_PALETTE.length],
        label: String.fromCharCode(65 + meta.size),
      })
    }
  }
  return meta
}
