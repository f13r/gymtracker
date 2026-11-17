import type { ProgressPhoto } from '@gymtracker/shared'

import { api } from './client'

export const photosApi = {
  getPhotos: () => api.get<ProgressPhoto[]>('/photos'),
  deletePhoto: (id: string) => api.delete(`/photos/${id}`),
  uploadPhoto: (file: File, bodyWeight?: number, notes?: string): Promise<ProgressPhoto> => {
    const form = new FormData()
    form.append('file', file)
    if (bodyWeight) {
      form.append('bodyWeight', String(bodyWeight))
    }
    if (notes) {
      form.append('notes', notes)
    }
    return api.post<ProgressPhoto>('/photos', form)
  },
}
