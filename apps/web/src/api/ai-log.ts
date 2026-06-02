import { api } from './client'

export type AiLogEntry = {
  id: number
  type: string
  prompt: string
  response: string
  durationMs: number
  createdAt: string
}

export const aiLogApi = {
  getAll: () => api.get<AiLogEntry[]>('/ai-log'),
}
