import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { ProgressPhoto } from '@gymtracker/shared'

import i18n from '@/lib/i18n'
import { PhotosPage } from '@/routes/photos'

const photo: ProgressPhoto = {
  id: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b',
  userId: 'default-user',
  recordedAt: 1_700_000_000,
  bodyWeight: 80,
  tags: null,
  notes: null,
}

vi.mock('@/api/photos', () => ({
  photosApi: { getPhotos: () => Promise.resolve([photo]), deletePhoto: vi.fn(), uploadPhoto: vi.fn() },
}))
vi.mock('@/api/body', () => ({
  bodyApi: { getWeights: () => Promise.resolve([]) },
}))

describe('PhotosPage', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('loads each thumbnail by photo id from the owner-checked route', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PhotosPage />
      </QueryClientProvider>,
    )

    const img = await screen.findByAltText('Progress')
    expect(img.getAttribute('src')).toBe(`/api/photos/${photo.id}/thumb`)
  })
})
