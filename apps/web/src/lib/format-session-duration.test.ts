import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@/lib/i18n'
import { formatSessionDuration } from '@/lib/utils'

describe('formatSessionDuration', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('speaks the active language', async () => {
    await i18n.changeLanguage('uk')
    expect(formatSessionDuration(0, 45 * 60)).toBe('45 хв')
    expect(formatSessionDuration(0, 118 * 60)).toBe('1 год 58 хв')
    await i18n.changeLanguage('en')
    expect(formatSessionDuration(0, 118 * 60)).toBe('1h 58m')
  })
})
