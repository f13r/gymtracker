import type { Me } from '@gymtracker/shared'

import { api } from './client'

export const meApi = {
  get: () => api.get<Me>('/me'),
}
