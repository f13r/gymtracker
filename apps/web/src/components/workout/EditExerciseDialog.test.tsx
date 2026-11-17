import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Exercise } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { Toaster } from '@/components/ui/toaster'
import { EditExerciseDialog } from '@/components/workout/EditExerciseDialog'
import i18n from '@/lib/i18n'

vi.mock('@/api/exercises', () => ({
  exercisesApi: { remove: vi.fn(), thumbUrl: (id: string) => `/api/exercises/${id}/thumb` },
}))

const bench: Exercise = {
  id: 'ex-bench',
  name: 'Bench Press',
  category: 'push',
  equipmentType: 'barbell',
  notes: null,
  description: null,
  archived: false,
  hasImage: false,
  createdAt: 1_700_000_000,
}

function renderDialog(onSaved = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EditExerciseDialog exercise={bench} onClose={vi.fn()} onSaved={onSaved} />
      <Toaster />
    </QueryClientProvider>,
  )
  return onSaved
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.mocked(exercisesApi.remove).mockReset()
})

describe('EditExerciseDialog remove', () => {
  it('explains that a used Exercise is archived rather than deleted', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Remove exercise' })).toBeInTheDocument()
    expect(screen.getByText(/archived instead/i)).toBeInTheDocument()
  })

  it('tells the user the Exercise was archived when it is still in use', async () => {
    vi.mocked(exercisesApi.remove).mockResolvedValue({ archived: true })
    const onSaved = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Remove exercise' }))

    expect(await screen.findByRole('status')).toHaveTextContent('“Bench Press” archived')
    expect(exercisesApi.remove).toHaveBeenCalledWith('ex-bench')
    expect(onSaved).toHaveBeenCalled()
  })

  it('tells the user the Exercise was deleted when nothing used it', async () => {
    vi.mocked(exercisesApi.remove).mockResolvedValue({ archived: false })
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Remove exercise' }))

    expect(await screen.findByRole('status')).toHaveTextContent('“Bench Press” deleted')
  })

  it('shows an error and keeps the dialog open when removing fails', async () => {
    vi.mocked(exercisesApi.remove).mockRejectedValue(new Error('boom'))
    const onSaved = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Remove exercise' }))

    expect(await screen.findByText('Couldn’t remove this exercise.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
