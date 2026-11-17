import { describe, it, expect } from 'vitest'

import { requireUserArg } from './script-args'

describe('requireUserArg', () => {
  it('reads --user <id>', () => {
    expect(requireUserArg(['file.csv', '--user', 'u2', '--commit'])).toBe('u2')
  })

  it('reads --user=<id>', () => {
    expect(requireUserArg(['--user=u2'])).toBe('u2')
  })

  it('refuses to run without a User', () => {
    expect(() => requireUserArg(['file.csv'])).toThrow(/--user/)
  })

  it('refuses an empty User', () => {
    expect(() => requireUserArg(['--user='])).toThrow(/--user/)
    expect(() => requireUserArg(['--user', '--commit'])).toThrow(/--user/)
  })
})
