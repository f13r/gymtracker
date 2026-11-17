import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { EquipmentWithExercises } from '@gymtracker/shared'

import { GymPage } from '@/routes/gym'

const item: EquipmentWithExercises = {
  id: '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
  gymId: 'household',
  name: 'Left Cable Tower',
  equipmentType: 'cable',
  description: null,
  tags: null,
  createdAt: 1_700_000_000,
  exercises: [],
}

vi.mock('@/api/equipment', () => ({
  equipmentApi: { list: () => Promise.resolve([item]), delete: vi.fn() },
}))
vi.mock('@/components/equipment/AddEquipmentWizard', () => ({ AddEquipmentWizard: () => null }))

describe('GymPage', () => {
  it('loads each thumbnail by Equipment id', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GymPage />
      </QueryClientProvider>,
    )

    const img = await screen.findByAltText('Left Cable Tower')
    expect(img.getAttribute('src')).toBe(`/api/equipment/${item.id}/thumb`)
  })
})
