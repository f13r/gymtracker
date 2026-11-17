import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Exercise } from '@gymtracker/shared'

import { ApiError } from '@/api/client'
import { exercisesApi } from '@/api/exercises'
import { ExercisePicker } from '@/components/workout/ExercisePicker'
import i18n from '@/lib/i18n'

vi.mock('@/api/exercises', () => ({
  exercisesApi: {
    getAll: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
    thumbUrl: (id: string) => `/api/exercises/${id}/thumb`,
  },
}))

function exercise(over: Partial<Exercise>): Exercise {
  return {
    id: 'ex',
    name: 'Exercise',
    category: 'push',
    equipmentType: null,
    notes: null,
    description: null,
    archived: false,
    hasImage: false,
    createdAt: 1_700_000_000,
    ...over,
  }
}

const bench = exercise({ id: 'ex-bench', name: 'Bench Press' })
const oldFly = exercise({ id: 'ex-fly', name: 'Old Fly', archived: true })

function renderPicker() {
  const onSelect = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ExercisePicker onClose={vi.fn()} onSelect={onSelect} />
    </QueryClientProvider>,
  )
  return onSelect
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.mocked(exercisesApi.getAll).mockResolvedValue([bench, oldFly])
  vi.mocked(exercisesApi.getOne).mockImplementation(id => Promise.resolve(id === bench.id ? bench : oldFly))
  vi.mocked(exercisesApi.create).mockReset()
})

describe('ExercisePicker', () => {
  it('hides Archived Exercises', async () => {
    renderPicker()
    expect(await screen.findByText('Bench Press')).toBeInTheDocument()
    expect(screen.queryByText('Old Fly')).not.toBeInTheDocument()
  })

  it('offers the existing Exercise when creating a name that is already taken', async () => {
    vi.mocked(exercisesApi.create).mockRejectedValue(
      new ApiError(
        409,
        { statusCode: 409, error: 'Conflict', message: 'Exercise exists', exerciseId: 'ex-bench' },
        'Exercise exists',
      ),
    )
    const onSelect = renderPicker()
    await screen.findByText('Bench Press')

    fireEvent.change(screen.getByPlaceholderText('Search exercises...'), { target: { value: 'bench press' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create “bench press”' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))

    expect(await screen.findByText('“Bench Press” already exists.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use “Bench Press”' }))
    expect(onSelect).toHaveBeenCalledWith('ex-bench', 'Bench Press')
  })
})
