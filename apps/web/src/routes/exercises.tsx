import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'

import type { Exercise, ExerciseCategory, ExerciseEquipment } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { queryKeys } from '@/api/queryKeys'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const CATEGORY_COLORS: Record<string, string> = {
  push: 'text-orange-400',
  pull: 'text-blue-400',
  legs: 'text-purple-400',
  core: 'text-yellow-400',
  cardio: 'text-green-400',
  other: 'text-slate-400',
}

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

export function ExercisesPage() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Exercise | null>(null)
  const queryClient = useQueryClient()
  const { data: exercises = [] } = useQuery({ queryKey: queryKeys.exercises(), queryFn: exercisesApi.getAll })

  const filtered = exercises.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))

  const grouped = filtered.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const cat = ex.category ?? 'other'
    if (!acc[cat]) {
      acc[cat] = []
    }
    acc[cat].push(ex)
    return acc
  }, {})

  const sortedCategories = Object.keys(grouped).sort()

  return (
    <div className="flex h-full flex-col">
      <div className="border-border space-y-3 border-b px-4 pt-4 pb-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Library</p>
          <h1 className="font-display font-700 text-3xl tracking-wide">EXERCISES</h1>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2" size={16} />
          <input
            className="bg-card border-border focus:border-primary w-full rounded-xl border py-2.5 pr-4 pl-9 text-sm transition-colors outline-none"
            placeholder="Search exercises..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedCategories.map(cat => (
          <div key={cat}>
            <div className="bg-background/95 sticky top-0 px-4 py-2 backdrop-blur-sm">
              <span
                className={`text-xs font-bold tracking-widest uppercase ${CATEGORY_COLORS[cat] ?? 'text-muted-foreground'}`}
              >
                {cat}
              </span>
            </div>
            {grouped[cat].map(ex => (
              <button
                key={ex.id}
                className="border-border/50 active:bg-muted/50 flex w-full items-center justify-between border-b px-4 py-3.5 text-left transition-colors"
                type="button"
                onClick={() => setEditing(ex)}
              >
                <span className="text-sm font-medium">{ex.name}</span>
                {ex.equipmentType && (
                  <span className="text-muted-foreground bg-muted rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                    {EQUIPMENT_LABELS[ex.equipmentType] ?? ex.equipmentType}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <p className="text-muted-foreground">No exercises found</p>
          </div>
        )}
      </div>

      <EditExerciseDialog
        exercise={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.exercises() })
          setEditing(null)
        }}
      />
    </div>
  )
}

function EditExerciseDialog({
  exercise,
  onClose,
  onSaved,
}: {
  exercise: Exercise | null
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Dialog open={exercise !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl">
        {exercise && <EditExerciseForm key={exercise.id} exercise={exercise} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function EditExerciseForm({ exercise, onSaved }: { exercise: Exercise; onSaved: () => void }) {
  const [name, setName] = useState(exercise.name)
  const [category, setCategory] = useState<ExerciseCategory>((exercise.category as ExerciseCategory) ?? 'other')
  const [equipmentType, setEquipmentType] = useState<ExerciseEquipment | ''>(
    (exercise.equipmentType as ExerciseEquipment) ?? '',
  )

  const save = useMutation({
    mutationFn: () =>
      exercisesApi.update(exercise.id, {
        name: name.trim(),
        category,
        ...(equipmentType ? { equipmentType } : {}),
      }),
    onSuccess: onSaved,
  })

  const remove = useMutation({
    mutationFn: () => exercisesApi.remove(exercise.id),
    onSuccess: onSaved,
  })

  const busy = save.isPending || remove.isPending

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit exercise</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-2">
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

      <DialogFooter className="flex-row gap-2 sm:gap-2">
        <Button className="mr-auto" disabled={busy} variant="ghost" onClick={() => remove.mutate()}>
          Delete
        </Button>
        <DialogClose asChild>
          <Button disabled={busy} variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button disabled={busy || name.trim() === ''} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  )
}
