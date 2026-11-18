import { describe, expect, it } from 'vitest'

import enTrainer from '@/locales/en/trainer.json'
import ukTrainer from '@/locales/uk/trainer.json'

describe('trainer namespace parity', () => {
  it('uk and en trainer.json have identical key sets', () => {
    expect(Object.keys(ukTrainer).sort()).toEqual(Object.keys(enTrainer).sort())
  })
})
