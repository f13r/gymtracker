import { create } from 'zustand'

/**
 * Auth failures the API client reports, rendered full-screen by `AuthGate`.
 * - `session-failed`: a 401 came back right after we already reloaded into the
 *   login, so reloading again would loop.
 * - `forbidden`: signed in, but the email is not an allowed User (403).
 */
export type AuthStatus = { kind: 'ok' } | { kind: 'session-failed' } | { kind: 'forbidden'; email: string | null }

export const useAuthStatus = create<{ status: AuthStatus }>(() => ({ status: { kind: 'ok' } }))

// Browser side effects, kept on an object so tests can stand in for them.
export const browser = {
  reload: () => window.location.reload(),
  replace: (url: string) => window.location.replace(url),
}

const RELOAD_KEY = 'gymtracker-auth-reload-at'
const RELOAD_LOOP_WINDOW_MS = 60_000

function readLastReload(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY)) || 0
  } catch {
    return 0
  }
}

/**
 * 401 → reload once so Cloudflare Access sends the browser to Google login.
 * A second 401 within a minute of that reload means login did not help, so
 * show an error instead of looping.
 */
export function handleUnauthorized(): void {
  const now = Date.now()
  if (now - readLastReload() < RELOAD_LOOP_WINDOW_MS) {
    useAuthStatus.setState({ status: { kind: 'session-failed' } })
    return
  }
  try {
    sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    // No sessionStorage → no loop guard; still better than a dead app.
  }
  browser.reload()
}

/** The user asked to try again: drop the loop guard and reload into the login. */
export function retryLogin(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY)
  } catch {
    // ignore
  }
  browser.reload()
}

export function handleForbidden(email: string | null): void {
  useAuthStatus.setState({ status: { kind: 'forbidden', email } })
}
