import { describe, it, expect } from 'vitest'

import { AiLogService } from './ai-log.service'

describe('AiLogService.getForUser', () => {
  it('returns only the requesting user’s entries, newest first', () => {
    const log = new AiLogService()
    log.add('progression', 'p-alice', 'r1', 10, 'alice')
    log.add('progression', 'p-bob', 'r2', 10, 'bob')
    log.add('program', 'p-alice-2', 'r3', 10, 'alice')

    const alice = log.getForUser('alice')
    expect(alice.map(e => e.prompt)).toEqual(['p-alice-2', 'p-alice'])
    expect(alice.every(e => e.userId === 'alice')).toBe(true)
  })

  it('excludes system/seed entries (no user) from a user’s view', () => {
    const log = new AiLogService()
    log.add('embedding', 'seed-chunk', '(embedding)', 5) // no userId → system/seed
    log.add('progression', 'p-alice', 'r1', 10, 'alice')

    expect(log.getForUser('alice').map(e => e.prompt)).toEqual(['p-alice'])
  })
})
