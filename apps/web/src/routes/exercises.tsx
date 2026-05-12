import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'

import type { Exercise } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'

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
  dumbbell: 'DB',
  machine: 'Machine',
  bodyweight: 'BW',
  cable: 'Cable',
  other: 'Other',
}

export function ExercisesPage() {
  const [search, setSearch] = useState('')
  const { data: exercises = [] } = useQuery({ queryKey: ['exercises'], queryFn: exercisesApi.getAll })

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
              <div key={ex.id} className="border-border/50 flex items-center justify-between border-b px-4 py-3.5">
                <span className="text-sm font-medium">{ex.name}</span>
                {ex.equipment && (
                  <span className="text-muted-foreground bg-muted rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                    {EQUIPMENT_LABELS[ex.equipment] ?? ex.equipment}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <p className="text-muted-foreground">No exercises found</p>
          </div>
        )}
      </div>
    </div>
  )
}
