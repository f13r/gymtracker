import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Exercise } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { queryKeys } from '@/api/queryKeys'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EditExerciseDialog } from '@/components/workout/EditExerciseDialog'
import { ExerciseForm } from '@/components/workout/ExerciseForm'

const CATEGORY_COLORS: Record<string, string> = {
  push: 'text-orange-400',
  pull: 'text-blue-400',
  legs: 'text-purple-400',
  core: 'text-yellow-400',
  cardio: 'text-green-400',
  other: 'text-slate-400',
}

export function ExercisesPage() {
  const { t } = useTranslation('exercises')
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
            <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{t('eyebrow')}</p>
            <h1 className="font-display font-700 text-3xl tracking-wide">{t('title')}</h1>
          </div>
          <button
            aria-label={t('addExercise')}
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
            aria-label={t('searchAria')}
            className="bg-card border-border focus:border-primary w-full rounded-xl border py-2.5 pr-4 pl-9 text-sm transition-colors outline-none"
            placeholder={t('searchPlaceholder')}
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
                {t(`category.${cat}`, { defaultValue: cat })}
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
                    {t(`equipment.${ex.equipmentType}`, { defaultValue: ex.equipmentType })}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <p className="text-muted-foreground">{t('empty')}</p>
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

function CreateExerciseDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation('exercises')
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t('addExercise')}</DialogTitle>
        </DialogHeader>
        {/* Only mounted while open, so the fields reset between opens. */}
        {open && <ExerciseForm onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}
