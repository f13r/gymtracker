import { describe, it, expect, vi, beforeEach } from 'vitest'

import { GeminiService } from './gemini.service'

const config = { getOrThrow: () => 'fake-key' }

function makeService() {
  const aiLog = { add: vi.fn() }
  const svc = new GeminiService(config as any, aiLog as any)
  return { svc, aiLog }
}

describe('GeminiService.generateStructured', () => {
  beforeEach(() => vi.resetAllMocks())

  it('parses JSON, logs success, and includes extra parts before the text prompt', async () => {
    let capturedBody: any
    const okResponse = (text: string) => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    })
    global.fetch = vi.fn().mockImplementation((_url, init: any) => {
      capturedBody = JSON.parse(init.body)
      return Promise.resolve(okResponse('{"ok":true}') as any)
    })
    const { svc, aiLog } = makeService()

    const result = await svc.generateStructured<{ ok: boolean }>({
      feature: 'equipment',
      prompt: 'analyse this',
      parts: [{ inlineData: { mimeType: 'image/webp', data: 'AAA' } }],
      userId: 'alice',
    })

    expect(result).toEqual({ ok: true })
    // parts come first, text prompt last
    expect(capturedBody.contents[0].parts[0]).toHaveProperty('inlineData')
    expect(capturedBody.contents[0].parts[1]).toEqual({ text: 'analyse this' })
    // the calling user is threaded into the log entry
    expect(aiLog.add).toHaveBeenCalledWith('equipment', 'analyse this', '{"ok":true}', expect.any(Number), 'alice')
  })

  it('logs the error and throws on non-OK status (the bug fix — no more silent failures)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' } as any)
    const { svc, aiLog } = makeService()

    await expect(svc.generateStructured({ feature: 'program', prompt: 'p' })).rejects.toThrow('Gemini 500')
    expect(aiLog.add).toHaveBeenCalledWith(
      'program',
      'p',
      expect.stringContaining('ERROR 500'),
      expect.any(Number),
      null,
    )
  })

  it('logs and throws on empty response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) } as any)
    const { svc, aiLog } = makeService()

    await expect(svc.generateStructured({ feature: 'program', prompt: 'p' })).rejects.toThrow('empty response')
    expect(aiLog.add).toHaveBeenCalledWith('program', 'p', '(empty response)', expect.any(Number), null)
  })

  it('omits responseSchema from generationConfig when none provided', async () => {
    let capturedBody: any
    const okResponse = (text: string) => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    })
    global.fetch = vi.fn().mockImplementation((_url, init: any) => {
      capturedBody = JSON.parse(init.body)
      return Promise.resolve(okResponse('{}') as any)
    })
    const { svc } = makeService()

    await svc.generateStructured({ feature: 'program', prompt: 'p' })
    expect(capturedBody.generationConfig).toEqual({ responseMimeType: 'application/json' })
  })
})

describe('GeminiService.embed', () => {
  beforeEach(() => vi.resetAllMocks())

  it('calls the embedding model and returns the vector, logging under "embedding"', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } }),
    } as any)
    const { svc, aiLog } = makeService()

    const result = await svc.embed('text', 'bob')
    expect(result).toEqual([0.1, 0.2, 0.3])
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('gemini-embedding-001'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(aiLog.add).toHaveBeenCalledWith(
      'embedding',
      'text',
      expect.stringContaining('3 dims'),
      expect.any(Number),
      'bob',
    )
  })

  it('defaults to a null (system) user when none is given — seed-time embeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } }),
    } as any)
    const { svc, aiLog } = makeService()

    await svc.embed('seed-chunk')
    expect(aiLog.add).toHaveBeenCalledWith(
      'embedding',
      'seed-chunk',
      expect.stringContaining('3 dims'),
      expect.any(Number),
      null,
    )
  })

  it('logs and throws on non-OK status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' } as any)
    const { svc, aiLog } = makeService()

    await expect(svc.embed('text')).rejects.toThrow('Gemini embed 429')
    expect(aiLog.add).toHaveBeenCalledWith(
      'embedding',
      'text',
      expect.stringContaining('ERROR 429'),
      expect.any(Number),
      null,
    )
  })
})
