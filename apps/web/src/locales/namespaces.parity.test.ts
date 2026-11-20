import { describe, expect, it } from 'vitest'

import { resources } from '@/lib/i18n'

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

// uk has more plural categories than en (one/few/many/other vs one/other),
// so plural suffixes are folded before comparing.
const base = (k: string) => k.replace(/_(one|few|many|other)$/, '')
const keySet = (obj: object) => [...new Set(keys(obj).map(base))].sort()

describe('locale parity', () => {
  for (const ns of Object.keys(resources.en) as (keyof typeof resources.en)[]) {
    it(`uk and en "${ns}" have identical key sets`, () => {
      expect(keySet(resources.uk[ns])).toEqual(keySet(resources.en[ns]))
    })
  }
})
