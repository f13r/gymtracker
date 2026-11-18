/**
 * Pages a Trainer cannot use while acting as an athlete. The API refuses the
 * calls behind them anyway (403 reason 'trainer-access'); this keeps the UI from
 * leading there. `/workout/start` and `/workout/template/*` are deliberately
 * absent: only the Session logger lives at `/workout/$sessionId`.
 */
export const ROUTES_BLOCKED_WHILE_ACTING = ['/photos', '/gym', '/ai-log', '/onboarding', '/workout/$sessionId'] as const

const WORKOUT_PATH_RESERVED = new Set(['start', 'template'])

export function isBlockedWhileActing(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const [, first, second, ...rest] = path.split('/')
  if (first === 'workout') {
    // /workout/<id> is a Session; /workout/start and /workout/template/... are not.
    return !!second && rest.length === 0 && !WORKOUT_PATH_RESERVED.has(second)
  }
  return ROUTES_BLOCKED_WHILE_ACTING.includes(path as (typeof ROUTES_BLOCKED_WHILE_ACTING)[number])
}

/**
 * The onboarding gate checks the signed-in User's own profile. While acting the
 * Trainer is viewing the athlete, so the gate must not send them to onboarding.
 */
export function shouldRunOnboardingGate({ acting, pathname }: { acting: boolean; pathname: string }): boolean {
  return !acting && pathname !== '/onboarding'
}
