import { api } from './client'

export type UserProfile = {
  userId: string
  age: number | null
  heightCm: number | null
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | null
  goal: 'hypertrophy' | 'strength' | 'powerlifting' | 'general' | null
  trainingPhase: 'accumulation' | 'strength' | 'peaking' | 'maintenance' | null
  trainingDays: string[] | null
  sessionDurationMinutes: number | null
  updatedAt: number
}

export type UpdateProfilePayload = {
  age?: number | null
  heightCm?: number | null
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced' | null
  goal?: 'hypertrophy' | 'strength' | 'powerlifting' | 'general' | null
  trainingPhase?: 'accumulation' | 'strength' | 'peaking' | 'maintenance' | null
  trainingDays?: string[] | null
  sessionDurationMinutes?: number | null
}

export const profileApi = {
  get: () => api.get<UserProfile | null>('/profile'),
  update: (data: UpdateProfilePayload) => api.patch<UserProfile>('/profile', data),
}
