import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import type { CreateTemplateDto } from '@gymtracker/shared'

import { workoutsApi } from '@/api/workouts'
import { TemplateForm } from '@/components/workout/TemplateForm'

export function NewTemplatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: (dto: CreateTemplateDto) => workoutsApi.createTemplate(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      navigate({ to: '/workout/start' })
    },
  })

  return (
    <TemplateForm
      isSaving={save.isPending}
      mode="create"
      onBack={() => navigate({ to: '/workout/start' })}
      onSave={dto => save.mutate(dto)}
    />
  )
}
