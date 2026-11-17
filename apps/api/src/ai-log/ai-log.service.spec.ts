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

describe('AiLogService cap', () => {
  it("keeps u2's entries when u1 fills the log", () => {
    const log = new AiLogService()
    log.add('progression', 'p-u2', 'r', 10, 'u2')
    for (let i = 0; i < 250; i++) {
      log.add('progression', `p-u1-${i}`, 'r', 10, 'u1')
    }

    expect(log.getForUser('u2').map(e => e.prompt)).toEqual(['p-u2'])
  })

  it("keeps each User's newest 200 entries", () => {
    const log = new AiLogService()
    for (let i = 0; i < 250; i++) {
      log.add('progression', `p-u1-${i}`, 'r', 10, 'u1')
    }

    const u1 = log.getForUser('u1')
    expect(u1).toHaveLength(200)
    expect(u1[0]?.prompt).toBe('p-u1-249')
    expect(u1[199]?.prompt).toBe('p-u1-50')
  })

  it("keeps u1's entries when system calls fill the log", () => {
    const log = new AiLogService()
    log.add('progression', 'p-u1', 'r', 10, 'u1')
    for (let i = 0; i < 250; i++) {
      log.add('embedding', `seed-${i}`, '(embedding)', 5)
    }

    expect(log.getForUser('u1').map(e => e.prompt)).toEqual(['p-u1'])
  })
})
