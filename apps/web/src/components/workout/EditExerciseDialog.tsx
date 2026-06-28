import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Exercise } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { Button } from '@/components/ui/button'
import { ExerciseForm } from '@/components/workout/ExerciseForm'

// Full-screen editor panel (not a centred modal) so it can scroll freely on mobile.
export function EditExerciseDialog({
  exercise,
  onClose,
  onSaved,
}: {
  exercise: Exercise | null
  onClose: () => void
  onSaved: () => void
}) {
  if (!exercise) {
    return null
  }
  return <EditExerciseForm key={exercise.id} exercise={exercise} onClose={onClose} onSaved={onSaved} />
}

function EditExerciseForm({
  exercise,
  onClose,
  onSaved,
}: {
  exercise: Exercise
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation('workout')
  const remove = useMutation({
    mutationFn: () => exercisesApi.remove(exercise.id),
    onSuccess: onSaved,
  })

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="border-border flex items-center gap-3 border-b px-4 pt-4 pb-3">
        <button className="text-muted-foreground p-1" type="button" onClick={onClose}>
          <X size={22} />
        </button>
        <span className="font-display font-600 text-lg tracking-wide uppercase">{t('editDialog.title')}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ExerciseForm exercise={exercise} onSaved={onSaved} />

        {!exercise.isDefault && (
          <>
            {remove.isError && (
              <p className="text-destructive mt-4 text-xs">{t('editDialog.deleteError')}</p>
            )}
            <Button className="mt-6 w-full" disabled={remove.isPending} variant="ghost" onClick={() => remove.mutate()}>
              {t('editDialog.deleteExercise')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
