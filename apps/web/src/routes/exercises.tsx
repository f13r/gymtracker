import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RotateCcw, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Exercise } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { queryKeys } from '@/api/queryKeys'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EditExerciseDialog } from '@/components/workout/EditExerciseDialog'
import { ExerciseForm } from '@/components/workout/ExerciseForm'
import { showToast } from '@/lib/toast'

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
  const { t } = useTranslation('exercises')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Exercise | null>(null)
  const [creating, setCreating] = useState(false)
  const queryClient = useQueryClient()
  const { data: exercises = [] } = useQuery({ queryKey: queryKeys.exercises(), queryFn: exercisesApi.getAll })

  const matches = (e: Exercise) => e.name.toLowerCase().includes(search.toLowerCase())
  const filtered = exercises.filter(e => !e.archived && matches(e))

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
            aria-label="Add exercise"
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

        <button
          className="text-muted-foreground active:bg-muted/50 w-full px-4 py-3.5 text-center text-xs font-semibold tracking-widest uppercase transition-colors"
          type="button"
          onClick={() => setShowArchived(s => !s)}
        >
          {showArchived ? t('hideArchived') : t('showArchived')}
        </button>
        {showArchived && <ArchivedExercises matches={matches} />}
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
        onOpenExisting={ex => {
          setCreating(false)
          setEditing(ex)
        }}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.exercises() })
          setCreating(false)
        }}
      />
    </div>
  )
}

// Archived Exercises: hidden from the library and pickers, still shown in history, restorable here.
function ArchivedExercises({ matches }: { matches: (e: Exercise) => boolean }) {
  const { t } = useTranslation('exercises')
  const queryClient = useQueryClient()
  const { data: archived = [], isSuccess } = useQuery({
    queryKey: queryKeys.archivedExercises(),
    queryFn: exercisesApi.getArchived,
  })
  const restore = useMutation({
    mutationFn: (ex: Exercise) => exercisesApi.restore(ex.id),
    onSuccess: (_restored, ex) => {
      showToast(t('restoredToast', { name: ex.name }))
      // The exercises() prefix covers both the live and the archived list.
      queryClient.invalidateQueries({ queryKey: queryKeys.exercises() })
    },
  })
  const shown = archived.filter(matches)

  return (
    <div>
      <div className="bg-background/95 sticky top-0 px-4 py-2 backdrop-blur-sm">
        <span className="text-muted-foreground text-xs font-bold tracking-widest uppercase">{t('archived')}</span>
      </div>
      {restore.isError && restore.variables && (
        <p className="text-destructive px-4 py-2 text-xs">{t('restoreError', { name: restore.variables.name })}</p>
      )}
      {shown.map(ex => (
        <div key={ex.id} className="border-border/50 flex items-center justify-between border-b px-4 py-2">
          <span className="text-muted-foreground text-sm font-medium">{ex.name}</span>
          <button
            aria-label={t('restoreNamed', { name: ex.name })}
            className="text-primary active:bg-muted/50 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors"
            disabled={restore.isPending}
            type="button"
            onClick={() => restore.mutate(ex)}
          >
            <RotateCcw size={14} />
            {t('restore')}
          </button>
        </div>
      ))}
      {isSuccess && shown.length === 0 && (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm">{t('noArchived')}</p>
      )}
    </div>
  )
}

function CreateExerciseDialog({
  open,
  onClose,
  onSaved,
  onOpenExisting,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  onOpenExisting: (existing: Exercise) => void
}) {
  const { t } = useTranslation('exercises')
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Add exercise</DialogTitle>
        </DialogHeader>
        {/* Only mounted while open, so the fields reset between opens. */}
        {open && (
          <ExerciseForm
            existingAction={{ label: name => t('openExisting', { name }), onSelect: onOpenExisting }}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
