import type { BodyWeight, FrequencyPoint, PersonalRecord, VolumePoint, WorkoutStreak } from '@gymtracker/shared'

import { api } from './client'

export const statsApi = {
  getPRs: (exerciseId?: string, limit = 10) => {
    const params = new URLSearchParams()
    if (exerciseId) {
      params.set('exerciseId', exerciseId)
    }
    params.set('limit', String(limit))
    return api.get<PersonalRecord[]>(`/stats/prs?${params}`)
  },
  getVolume: (exerciseId?: string, from?: number, to?: number) => {
    const params = new URLSearchParams()
    if (exerciseId) {
      params.set('exerciseId', exerciseId)
    }
    if (from) {
      params.set('from', String(from))
    }
    if (to) {
      params.set('to', String(to))
    }
    return api.get<VolumePoint[]>(`/stats/volume?${params}`)
  },
  getStreak: () => api.get<WorkoutStreak>('/stats/streak'),
  getBodyWeight: (from?: number, to?: number) => {
    const params = new URLSearchParams()
    if (from) {
      params.set('from', String(from))
    }
    if (to) {
      params.set('to', String(to))
    }
    return api.get<BodyWeight[]>(`/stats/bodyweight?${params}`)
  },
  getMeasurements: () => api.get<BodyWeight[]>('/stats/measurements'),
  getFrequency: () => api.get<FrequencyPoint[]>('/stats/frequency'),
}
