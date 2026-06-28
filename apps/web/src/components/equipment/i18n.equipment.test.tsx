import { describe, expect, it } from 'vitest'

import enEquipment from '@/locales/en/equipment.json'
import ukEquipment from '@/locales/uk/equipment.json'

// Recursive key-set extraction for parity comparison.
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return v && typeof v === 'object' && !Array.isArray(v) ? collectKeys(v as Record<string, unknown>, path) : [path]
  })
}

describe('equipment namespace parity', () => {
  it('uk and en equipment.json have identical key sets (both directions)', () => {
    const ukKeys = collectKeys(ukEquipment as Record<string, unknown>).sort()
    const enKeys = collectKeys(enEquipment as Record<string, unknown>).sort()
    expect(ukKeys).toEqual(enKeys)
  })
})
