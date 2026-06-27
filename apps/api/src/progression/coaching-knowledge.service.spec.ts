import { describe, it, expect, vi } from 'vitest'

import { CoachingKnowledgeService } from './coaching-knowledge.service'

const mockDb = {
  execute: vi.fn(),
  select: vi.fn(() => ({ from: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([{ count: '0' }])) })) })),
  insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => Promise.resolve()) })) })),
}

describe('CoachingKnowledgeService.retrieveForSituation', () => {
  it('embeds the situation via GeminiService and returns top content strings from DB', async () => {
    const mockGemini = { embed: vi.fn().mockResolvedValue(Array(768).fill(0.1)), generateStructured: vi.fn() }

    const mockDbWithExecute = {
      ...mockDb,
      execute: vi.fn().mockResolvedValue({
        rows: [{ content: 'chunk one' }, { content: 'chunk two' }],
      }),
    }

    const svc = new CoachingKnowledgeService(mockDbWithExecute as any, mockGemini as any)
    const result = await svc.retrieveForSituation('intermediate lifter, bench press plateau', 'alice')

    expect(result).toEqual(['chunk one', 'chunk two'])
    // the retrieval embed is attributed to the requesting user
    expect(mockGemini.embed).toHaveBeenCalledWith('intermediate lifter, bench press plateau', 'alice')
    expect(mockDbWithExecute.execute).toHaveBeenCalledOnce()
  })
})
