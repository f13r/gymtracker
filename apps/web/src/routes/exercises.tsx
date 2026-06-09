import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'

import type { Exercise } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { queryKeys } from '@/api/queryKeys'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EditExerciseDialog } from '@/components/workout/EditExerciseDialog'

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

export function ExercisesPage() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Exercise | null>(null)
  const [creating, setCreating] = useState(false)
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
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Library</p>
            <h1 className="font-display font-700 text-3xl tracking-wide">EXERCISES</h1>
          </div>
          <button
            aria-label="Add exercise from wger"
            className="bg-card border-border active:bg-muted flex size-10 items-center justify-center rounded-xl border transition-colors"
            type="button"
            onClick={() => setCreating(true)}
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2" size={16} />
          <input
            aria-label="Search exercises"
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

      <CreateExerciseDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.exercises() })
          setCreating(false)
        }}
      />
    </div>
  )
}

function CreateExerciseDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl">
        {/* Only mounted while open, so the field resets between opens. */}
        {open && <CreateExerciseForm onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function CreateExerciseForm({ onSaved }: { onSaved: () => void }) {
  const [wgerId, setWgerId] = useState('')

  const id = Number(wgerId)
  const valid = wgerId.trim() !== '' && Number.isInteger(id) && id > 0

  const create = useMutation({
    // Only the wger id is sent — the server fetches the name/category/equipment from wger.
    mutationFn: () => exercisesApi.create({ wgerId: id }),
    onSuccess: onSaved,
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add exercise from wger</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-wger-id">wger exercise ID</Label>
          <Input
            id="new-wger-id"
            inputMode="numeric"
            placeholder="e.g. 73"
            value={wgerId}
            autoFocus
            onChange={e => setWgerId(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <p className="text-muted-foreground text-xs">
            We’ll pull the name, category, equipment and demonstration from wger.de.
          </p>
        </div>

        {create.isError && (
          <p className="text-destructive text-xs">{(create.error as Error).message}</p>
        )}
      </div>

      <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
        <DialogClose asChild>
          <Button disabled={create.isPending} variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Fetching…' : 'Add'}
        </Button>
      </DialogFooter>
    </>
  )
}
