import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Exercise } from '@gymtracker/shared'

import { ApiError } from '@/api/client'
import { exercisesApi } from '@/api/exercises'
import { Toaster } from '@/components/ui/toaster'
import i18n from '@/lib/i18n'
import { ExercisesPage } from '@/routes/exercises'

vi.mock('@/api/exercises', () => ({
  exercisesApi: {
    getAll: vi.fn(),
    getArchived: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
    restore: vi.fn(),
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

// Stand-in for the server: restoring moves an Exercise from the archived list to the live one.
let live: Exercise[]
let archived: Exercise[]

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ExercisesPage />
      <Toaster />
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  live = [bench]
  archived = [oldFly]
  vi.mocked(exercisesApi.getAll).mockImplementation(async () => live)
  vi.mocked(exercisesApi.getArchived).mockImplementation(async () => archived)
  vi.mocked(exercisesApi.getOne).mockImplementation(async id => [...live, ...archived].find(e => e.id === id)!)
  vi.mocked(exercisesApi.create).mockReset()
  vi.mocked(exercisesApi.restore).mockReset()
})

describe('ExercisesPage', () => {
  it('lists live Exercises only until archived ones are asked for', async () => {
    renderPage()
    expect(await screen.findByText('Bench Press')).toBeInTheDocument()
    expect(screen.queryByText('Old Fly')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show archived' }))

    expect(await screen.findByText('Old Fly')).toBeInTheDocument()
  })

  it('restores an Archived Exercise back into the library', async () => {
    vi.mocked(exercisesApi.restore).mockImplementation(async id => {
      const restored = { ...oldFly, archived: false }
      archived = archived.filter(e => e.id !== id)
      live = [...live, restored]
      return restored
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Show archived' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Restore Old Fly' }))

    expect(await screen.findByRole('status')).toHaveTextContent('“Old Fly” restored')
    expect(exercisesApi.restore).toHaveBeenCalledWith('ex-fly')
    expect(await screen.findByText('No archived exercises')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore Old Fly' })).not.toBeInTheDocument()
    expect(screen.getByText('Old Fly')).toBeInTheDocument()
  })

  it('opens the existing Exercise when a new one would clash with it', async () => {
    vi.mocked(exercisesApi.create).mockRejectedValue(
      new ApiError(409, { statusCode: 409, error: 'Conflict', message: 'Exists', exerciseId: 'ex-bench' }, 'Exists'),
    )
    renderPage()
    await screen.findByText('Bench Press')

    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'bench press' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add exercise' }))

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Open “Bench Press”' }))

    expect(await screen.findByText('Edit Exercise')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Bench Press')
  })
})
