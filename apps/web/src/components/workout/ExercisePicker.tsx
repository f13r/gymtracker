import { useQuery } from '@tanstack/react-query'
import { X, Search } from 'lucide-react'
import { useState } from 'react'

import type { Exercise } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'

interface ExercisePickerProps {
  onClose: () => void
  onSelect: (id: string, name: string) => void
}

export function ExercisePicker({ onClose, onSelect }: ExercisePickerProps) {
  const [search, setSearch] = useState('')
  const { data: exercises = [] } = useQuery({ queryKey: ['exercises'], queryFn: exercisesApi.getAll })

  const filtered = exercises.filter((e: Exercise) => e.name.toLowerCase().includes(search.toLowerCase()))

  const grouped = filtered.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const cat = ex.category ?? 'other'
    if (!acc[cat]) {
      acc[cat] = []
    }
    acc[cat].push(ex)
    return acc
  }, {})

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="border-border flex items-center gap-3 border-b px-4 pt-4 pb-3">
        <button className="text-muted-foreground p-1" onClick={onClose}>
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
        {Object.entries(grouped).map(([cat, exs]) => (
          <div key={cat}>
            <div className="bg-background/95 sticky top-0 px-4 py-2 backdrop-blur-sm">
              <span className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{cat}</span>
            </div>
            {exs.map(ex => (
              <button
                key={ex.id}
                className="border-border/50 active:bg-card flex w-full items-center justify-between border-b px-4 py-3.5 text-left transition-colors"
                onClick={() => onSelect(ex.id, ex.name)}
              >
                <span className="font-medium">{ex.name}</span>
                {ex.equipmentType && (
                  <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-xs">
                    {ex.equipmentType}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
