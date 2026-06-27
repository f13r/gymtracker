import { useMutation } from '@tanstack/react-query'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'

import type { Exercise, ExerciseCategory, ExerciseEquipment } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const EQUIPMENT_LABELS: Record<ExerciseEquipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  cable: 'Cable',
  other: 'Other',
}

const CATEGORIES: ExerciseCategory[] = ['push', 'pull', 'legs', 'core', 'cardio', 'other']
const EQUIPMENT: ExerciseEquipment[] = ['barbell', 'dumbbell', 'machine', 'bodyweight', 'cable', 'other']

// The single create/edit form for an Exercise, shared by the library page, the edit panel, and the
// in-session picker. `exercise` present => edit mode; otherwise create (optionally name-prefilled).
export function ExerciseForm({
  exercise,
  initialName = '',
  onSaved,
  footerExtra,
}: {
  exercise?: Exercise
  initialName?: string
  onSaved: (exercise: Exercise) => void
  /** Rendered above the action buttons — e.g. the "Add to <Template> permanently" checkbox. */
  footerExtra?: ReactNode
}) {
  const editing = exercise != null
  const [name, setName] = useState(exercise?.name ?? initialName)
  const [category, setCategory] = useState<ExerciseCategory>((exercise?.category as ExerciseCategory) ?? 'other')
  const [equipmentType, setEquipmentType] = useState<ExerciseEquipment | ''>(
    (exercise?.equipmentType as ExerciseEquipment) ?? '',
  )
  const [description, setDescription] = useState(exercise?.description ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Preview priority: a freshly chosen file, else the stored image (unless the user cleared it).
  const previewUrl = file
    ? URL.createObjectURL(file)
    : editing && exercise.hasImage && !removeImage
      ? exercisesApi.thumbUrl(exercise.id)
      : null

  const save = useMutation({
    mutationFn: () => {
      const data = {
        name: name.trim(),
        category,
        description: description.trim(),
        ...(equipmentType ? { equipmentType } : {}),
      }
      return editing
        ? exercisesApi.update(exercise.id, data, file, removeImage && !file)
        : exercisesApi.create(data, file)
    },
    onSuccess: onSaved,
  })

  const pickFile = (f: File | null) => {
    setFile(f)
    if (f) {
      setRemoveImage(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        className="border-border bg-card relative flex h-44 w-full items-center justify-center overflow-hidden rounded-xl border"
        type="button"
        onClick={() => fileInput.current?.click()}
      >
        {previewUrl ? (
          <img
            alt={`${name || 'Exercise'} demonstration`}
            className="h-full w-full object-contain p-2"
            src={previewUrl}
          />
        ) : (
          <span className="text-muted-foreground flex flex-col items-center gap-1.5 text-sm">
            <ImagePlus size={24} strokeWidth={1.5} />
            Add photo
          </span>
        )}
      </button>
      <input
        ref={fileInput}
        accept="image/*"
        className="hidden"
        type="file"
        onChange={e => pickFile(e.target.files?.[0] ?? null)}
      />
      {(file || (editing && exercise.hasImage && !removeImage)) && (
        <div className="-mt-2 flex justify-center">
          <Button
            className="text-muted-foreground"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => {
              pickFile(null)
              setRemoveImage(editing && exercise.hasImage)
              if (fileInput.current) {
                fileInput.current.value = ''
              }
            }}
          >
            <Trash2 className="mr-1" size={14} /> Remove photo
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ex-name">Name</Label>
        <Input autoFocus={!editing} id="ex-name" value={name} onChange={e => setName(e.target.value)} />
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

      <div className="space-y-1.5">
        <Label htmlFor="ex-description">Description</Label>
        <textarea
          className="bg-card border-border focus:border-primary w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none"
          id="ex-description"
          placeholder="Optional notes on how to perform it…"
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      {save.isError && <p className="text-destructive text-xs">{(save.error as Error).message}</p>}

      {footerExtra}

      <Button className="w-full" disabled={name.trim() === '' || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Saving…' : editing ? 'Save' : 'Add exercise'}
      </Button>
    </div>
  )
}
