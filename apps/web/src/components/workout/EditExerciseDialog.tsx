import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState } from 'react'

import type { Exercise, ExerciseCategory, ExerciseEquipment } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WgerExercisePicker } from '@/components/workout/WgerExercisePicker'
import { useExerciseMedia } from '@/hooks/useExerciseMedia'

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  cable: 'Cable',
  other: 'Other',
}

const CATEGORIES: ExerciseCategory[] = ['push', 'pull', 'legs', 'core', 'cardio', 'other']
const EQUIPMENT: ExerciseEquipment[] = ['barbell', 'dumbbell', 'machine', 'bodyweight', 'cable', 'other']

// Full-screen editor panel (not a centred modal) so the wger picker can cover the screen and
// scroll freely — a transformed/scroll-locked dialog ancestor broke both.
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

function ExerciseMediaPreview({ name, wgerId }: { name: string; wgerId: number | null }) {
  const { data, isLoading } = useExerciseMedia(wgerId)
  const imageUrl = data?.imageUrl

  if (isLoading) {
    return (
      <div className="bg-muted flex h-40 w-full items-center justify-center rounded-xl">
        <span className="text-muted-foreground text-xs">Loading…</span>
      </div>
    )
  }
  if (!imageUrl) {return null}

  return (
    <div className="flex justify-center">
      {/* wger images are black line art on a transparent background — render on white so they show on the dark theme. */}
      <img
        alt={`${name} demonstration`}
        className="max-h-48 w-auto rounded-xl bg-white object-contain p-2"
        src={imageUrl}
      />
    </div>
  )
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
  const [name, setName] = useState(exercise.name)
  const [category, setCategory] = useState<ExerciseCategory>((exercise.category as ExerciseCategory) ?? 'other')
  const [equipmentType, setEquipmentType] = useState<ExerciseEquipment | ''>(
    (exercise.equipmentType as ExerciseEquipment) ?? '',
  )
  const [wgerId, setWgerId] = useState<number | null>(exercise.wgerId)
  const [linking, setLinking] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      exercisesApi.update(exercise.id, {
        name: name.trim(),
        category,
        wgerId,
        ...(equipmentType ? { equipmentType } : {}),
      }),
    onSuccess: onSaved,
  })

  const remove = useMutation({
    mutationFn: () => exercisesApi.remove(exercise.id),
    onSuccess: onSaved,
  })

  const busy = save.isPending || remove.isPending

  if (linking) {
    return (
      <WgerExercisePicker
        initialSearch={exercise.name}
        onClose={() => setLinking(false)}
        onSelect={id => {
          setWgerId(id)
          setLinking(false)
        }}
      />
    )
  }

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="border-border flex items-center gap-3 border-b px-4 pt-4 pb-3">
        <button className="text-muted-foreground p-1" type="button" onClick={onClose}>
          <X size={22} />
        </button>
        <span className="font-display font-600 text-lg tracking-wide uppercase">Edit Exercise</span>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <ExerciseMediaPreview name={name} wgerId={wgerId} />

        <div className="flex items-center justify-center gap-3">
          <Button size="sm" type="button" variant="outline" onClick={() => setLinking(true)}>
            {wgerId ? 'Change demonstration' : 'Link demonstration'}
          </Button>
          {wgerId && (
            <Button size="sm" type="button" variant="ghost" onClick={() => setWgerId(null)}>
              Unlink
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ex-wger-id">wger exercise ID</Label>
          <Input
            id="ex-wger-id"
            inputMode="numeric"
            placeholder="Not linked"
            value={wgerId ?? ''}
            onChange={e => {
              const next = e.target.value.replace(/[^0-9]/g, '')
              setWgerId(next === '' ? null : Number(next))
            }}
          />
          <p className="text-muted-foreground text-xs">
            Set or change this and save to re-sync name, category and equipment from wger.de.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ex-name">Name</Label>
          <Input id="ex-name" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={v => setCategory(v as ExerciseCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => (
                <SelectItem key={c} className="capitalize" value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Equipment</Label>
          <Select value={equipmentType} onValueChange={v => setEquipmentType(v as ExerciseEquipment)}>
            <SelectTrigger>
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              {EQUIPMENT.map(eq => (
                <SelectItem key={eq} value={eq}>
                  {EQUIPMENT_LABELS[eq]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {remove.isError && (
          <p className="text-destructive text-xs">Can’t delete: this exercise has logged sets or history.</p>
        )}
      </div>

      <div className="border-border flex items-center gap-2 border-t p-4">
        <Button className="mr-auto" disabled={busy} variant="ghost" onClick={() => remove.mutate()}>
          Delete
        </Button>
        <Button disabled={busy} variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || name.trim() === ''} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
