import { describe, expect, it } from 'vitest'

import { isBlockedWhileActing, shouldRunOnboardingGate } from './acting-policy'

describe('isBlockedWhileActing', () => {
  it.each(['/workout/abc', '/photos', '/gym', '/ai-log', '/onboarding'])('blocks %s', path => {
    expect(isBlockedWhileActing(path)).toBe(true)
  })

  it.each(['/workout/start', '/workout/template/t1', '/workout/template/new', '/dashboard', '/history/abc', '/'])(
    'allows %s',
    path => {
      expect(isBlockedWhileActing(path)).toBe(false)
    },
  )

  it('ignores a trailing slash', () => {
    expect(isBlockedWhileActing('/photos/')).toBe(true)
  })
})

describe('shouldRunOnboardingGate', () => {
  it('runs for a User acting as themselves', () => {
    expect(shouldRunOnboardingGate({ acting: false, pathname: '/dashboard' })).toBe(true)
  })

  it('is skipped while acting, whatever the athlete profile holds', () => {
    expect(shouldRunOnboardingGate({ acting: true, pathname: '/dashboard' })).toBe(false)
  })

  it('is skipped on the onboarding page itself', () => {
    expect(shouldRunOnboardingGate({ acting: false, pathname: '/onboarding' })).toBe(false)
  })
})
