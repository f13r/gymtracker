import { afterEach, describe, expect, it, vi } from 'vitest'

import { exercisesApi } from './exercises'

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('exercisesApi.getAllWithArchived', () => {
  // History, the logger and the Template editor still name Exercises that were archived after use.
  it('returns live and Archived Exercises together', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('?archived=true')
          ? json([{ id: 'ex-fly', name: 'Old Fly', archived: true }])
          : json([{ id: 'ex-bench', name: 'Bench Press', archived: false }]),
      ),
    )

    const all = await exercisesApi.getAllWithArchived()

    expect(all.map(e => e.name).sort()).toEqual(['Bench Press', 'Old Fly'])
  })
})
