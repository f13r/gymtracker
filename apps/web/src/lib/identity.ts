import { meApi } from '@/api/me'
import { stopActing, useActingStore } from '@/stores/acting.store'
import type { QueryClient } from '@tanstack/react-query'

const LAST_USER_KEY = 'gymtracker-last-user-id'

function readLastUser(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY)
  } catch {
    return null
  }
}

/**
 * Query keys carry no User (`['profile']`, `['sessions']`, …), so cached data
 * from one User must never answer for another. Ask the API who is signed in and,
 * if it is not the User we last saw, clear the whole cache. Must run before the
 * onboarding gate reads the profile (it caches it with `staleTime: Infinity`).
 */
export async function syncIdentity(queryClient: QueryClient): Promise<void> {
  let user
  try {
    user = await meApi.get()
  } catch {
    // Fail open like the onboarding gate: a dropped request must not blank the
    // app. 401/403 are already handled by the API client.
    return
  }
  // A stored athlete the Trainer is no longer linked to (e.g. a stale tab).
  const acting = useActingStore.getState().athlete
  if (acting && !user.athletes.some(a => a.id === acting.id)) {
    stopActing(queryClient)
  }
  if (readLastUser() === user.id) {
    return
  }
  queryClient.clear()
  try {
    localStorage.setItem(LAST_USER_KEY, user.id)
  } catch {
    // Without storage we clear on every app load, which is safe.
  }
}
