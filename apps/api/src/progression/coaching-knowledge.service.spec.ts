import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CoachingKnowledgeService } from './coaching-knowledge.service'

const mockDb = {
  execute: vi.fn(),
  select: vi.fn(() => ({ from: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([{ count: '0' }])) })) })),
  insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => Promise.resolve()) })) })),
}

const mockConfig = { getOrThrow: () => 'fake-key' }

describe('CoachingKnowledgeService.embedText', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('calls Gemini embedding API and returns number array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } }),
    } as any)

    const svc = new CoachingKnowledgeService(mockDb as any, mockConfig as any)
    const result = await (svc as any).embedText('test text')

    expect(result).toEqual([0.1, 0.2, 0.3])
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('text-embedding-004'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws when Gemini embedding API returns non-ok status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    } as any)

    const svc = new CoachingKnowledgeService(mockDb as any, mockConfig as any)
    await expect((svc as any).embedText('test')).rejects.toThrow('Gemini embed 429')
  })
})

describe('CoachingKnowledgeService.retrieveForSituation', () => {
  it('embeds the situation and returns top content strings from DB', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: Array(768).fill(0.1) } }),
    } as any)

    const mockDbWithExecute = {
      ...mockDb,
      execute: vi.fn().mockResolvedValue({
        rows: [
          { content: 'chunk one' },
          { content: 'chunk two' },
        ],
      }),
    }

    const svc = new CoachingKnowledgeService(mockDbWithExecute as any, mockConfig as any)
    const result = await svc.retrieveForSituation('intermediate lifter, bench press plateau')

    expect(result).toEqual(['chunk one', 'chunk two'])
    expect(mockDbWithExecute.execute).toHaveBeenCalledOnce()
  })
})
