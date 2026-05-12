import type { CreateScheduleDto, TodaySchedule, WorkoutSchedule } from '@gymtracker/shared'

import { api } from './client'

export const schedulesApi = {
  getSchedules: () => api.get<WorkoutSchedule[]>('/schedules'),
  getToday: () => api.get<TodaySchedule | null>('/schedules/today'),
  createSchedule: (data: CreateScheduleDto) => api.post<WorkoutSchedule>('/schedules', data),
  deleteSchedule: (id: string) => api.delete(`/schedules/${id}`),
}
