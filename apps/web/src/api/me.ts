import type { AuthUser } from '@gymtracker/shared'

import { api } from './client'

export const meApi = {
  get: () => api.get<AuthUser>('/me'),
}
