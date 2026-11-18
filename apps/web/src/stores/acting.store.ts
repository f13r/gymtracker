import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { AuthUser } from '@gymtracker/shared'

import type { QueryClient } from '@tanstack/react-query'

interface ActingStore {
  /** The athlete a Trainer is acting as, or null when acting as themselves. */
  athlete: AuthUser | null
}

// sessionStorage, not localStorage: acting ends with the tab, so a Trainer never
// returns to the app still silently acting as someone else.
export const useActingStore = create<ActingStore>()(
  persist<ActingStore>(() => ({ athlete: null }), {
    name: 'gymtracker-acting',
    storage: createJSONStorage(() => sessionStorage),
  }),
)

// Query keys carry no User, so every switch must drop the cache. The caller
// navigates to /dashboard afterwards.
export function startActing(queryClient: QueryClient, athlete: AuthUser): void {
  useActingStore.setState({ athlete })
  queryClient.clear()
}

export function stopActing(queryClient: QueryClient): void {
  useActingStore.setState({ athlete: null })
  queryClient.clear()
}

export function useActing(): { athlete: AuthUser | null; acting: boolean } {
  const athlete = useActingStore(s => s.athlete)
  return { athlete, acting: athlete !== null }
}
