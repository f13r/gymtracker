import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'

import type { CreateTemplateDto } from '@gymtracker/shared'

import { queryKeys } from '@/api/queryKeys'
import { workoutsApi } from '@/api/workouts'
import { TemplateForm } from '@/components/workout/TemplateForm'

export function EditTemplatePage() {
  const { templateId } = useParams({ strict: false }) as { templateId: string }
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: template } = useQuery({
    queryKey: queryKeys.template(templateId),
    queryFn: () => workoutsApi.getTemplate(templateId),
  })

  const save = useMutation({
    mutationFn: (dto: CreateTemplateDto) => workoutsApi.updateTemplate(templateId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.template(templateId) })
      navigate({ to: '/workout/start' })
    },
  })

  if (!template) {
    return null
  }

  return (
    <TemplateForm
      initialTemplate={template}
      isSaving={save.isPending}
      mode="edit"
      onBack={() => navigate({ to: '/workout/start' })}
      onSave={dto => save.mutate(dto)}
    />
  )
}
