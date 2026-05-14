import { useMemo } from 'react'

import type { WorkoutSet } from '@gymtracker/shared'
import { calculateVolume, getDoneSets } from '@gymtracker/shared'

export function useSessionVolume(sets: WorkoutSet[], prevSets: WorkoutSet[]) {
  return useMemo(() => {
    const current = calculateVolume(getDoneSets(sets))
    const prev = calculateVolume(getDoneSets(prevSets))
    return { current, prev, delta: current - prev }
  }, [sets, prevSets])
}
