import type { Program } from '@gymtracker/shared'

import { api } from './client'

export const programApi = {
  getActive: () => api.get<Program | null>('/program'),
  generate: () => api.post<Program>('/program/generate', {}),
  remove: () => api.delete('/program'),
  evaluate: () => api.post<void>('/program/evaluate', {}),
  acknowledgeUpdate: (id: string, action: 'accept' | 'dismiss') =>
    api.post<void>(`/program/updates/${id}/acknowledge`, { action }),
}
