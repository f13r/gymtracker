import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, Plus, X, Search } from 'lucide-react'
import { useState } from 'react'

import type { Exercise } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { queryKeys } from '@/api/queryKeys'
import { EditExerciseDialog } from '@/components/workout/EditExerciseDialog'
import { ExerciseForm } from '@/components/workout/ExerciseForm'

interface PermanentAdd {
  templateName: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

interface ExercisePickerProps {
  /** The exercise currently chosen for this slot, highlighted in the list. */
  selectedId?: string
  onClose: () => void
  onSelect: (id: string, name: string) => void
  /** When present (in-session use), shows the "Add to <Template> permanently" checkbox. */
  permanentAdd?: PermanentAdd
}

export function ExercisePicker({ selectedId, onClose, onSelect, permanentAdd }: ExercisePickerProps) {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Exercise | null>(null)
  const [creating, setCreating] = useState(false)
  const queryClient = useQueryClient()
  const { data: exercises = [] } = useQuery({ queryKey: queryKeys.exercises(), queryFn: exercisesApi.getAll })

  const filtered = exercises.filter((e: Exercise) => e.name.toLowerCase().includes(search.toLowerCase()))

  const grouped = filtered.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const cat = ex.category ?? 'other'
    if (!acc[cat]) {
      acc[cat] = []
    }
    acc[cat].push(ex)
    return acc
  }, {})

  // The "Add to <Template> permanently" toggle — reused on the picker footer (for selecting an
  // existing exercise) and inside the create form (so it's present at the save button).
  const permanentAddRow = permanentAdd ? (
    <button
      className="flex w-full items-center gap-3 text-left"
      type="button"
      onClick={() => permanentAdd.onCheckedChange(!permanentAdd.checked)}
    >
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          permanentAdd.checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
        }`}
      >
        {permanentAdd.checked && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="text-sm">
        Add to <span className="font-semibold">{permanentAdd.templateName}</span> permanently
      </span>
    </button>
  ) : null

  if (creating) {
    return (
      <div className="bg-background fixed inset-0 z-50 flex flex-col">
        <div className="border-border flex items-center gap-3 border-b px-4 pt-4 pb-3">
          <button className="text-muted-foreground p-1" type="button" onClick={() => setCreating(false)}>
            <X size={22} />
          </button>
          <span className="font-display font-600 text-lg tracking-wide uppercase">New Exercise</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ExerciseForm
            footerExtra={permanentAddRow}
            initialName={search}
            onSaved={created => {
              queryClient.invalidateQueries({ queryKey: queryKeys.exercises() })
              onSelect(created.id, created.name)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="border-border flex items-center gap-3 border-b px-4 pt-4 pb-3">
        <button className="text-muted-foreground p-1" type="button" onClick={onClose}>
          <X size={22} />
        </button>
        <span className="font-display font-600 text-lg tracking-wide uppercase">Select Exercise</span>
      </div>
      <div className="border-border border-b px-4 py-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2" size={16} />
          <input
            className="bg-card border-border focus:border-primary w-full rounded-xl border py-2.5 pr-4 pl-9 text-sm outline-none"
            placeholder="Search exercises..."
            value={search}
            autoFocus
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const first = filtered[0]
                if (first) {
                  onSelect(first.id, first.name)
                }
              }
            }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <button
          className="text-primary border-border/50 active:bg-card flex w-full items-center gap-2 border-b px-4 py-3.5 text-left text-sm font-medium"
          type="button"
          onClick={() => setCreating(true)}
        >
          <Plus size={16} />
          {search.trim() ? `Create “${search.trim()}”` : 'Create new exercise'}
        </button>
        {Object.entries(grouped).map(([cat, exs]) => (
          <div key={cat}>
            <div className="bg-background/95 sticky top-0 px-4 py-2 backdrop-blur-sm">
              <span className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{cat}</span>
            </div>
            {exs.map(ex => (
              <div
                key={ex.id}
                className={`border-border/50 flex items-center border-b transition-colors ${
                  ex.id === selectedId ? 'bg-orange-400/15' : 'active:bg-card'
                }`}
              >
                <button
                  className="flex flex-1 items-center justify-between gap-2 py-3.5 pr-2 pl-4 text-left"
                  type="button"
                  onClick={() => onSelect(ex.id, ex.name)}
                >
                  <span className={ex.id === selectedId ? 'font-semibold text-orange-400' : 'font-medium'}>
                    {ex.name}
                  </span>
                  {ex.equipmentType && (
                    <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-xs">
                      {ex.equipmentType}
                    </span>
                  )}
                </button>
                <button
                  aria-label={`Edit ${ex.name}`}
                  className="text-muted-foreground/60 active:text-primary flex size-10 shrink-0 items-center justify-center pr-2 transition-colors"
                  type="button"
                  onClick={() => setEditing(ex)}
                >
                  <Pencil size={16} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {permanentAddRow && <div className="border-border bg-background border-t px-4 py-3">{permanentAddRow}</div>}

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
