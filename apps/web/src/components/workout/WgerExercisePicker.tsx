import { X, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useWgerCatalog } from '@/hooks/useWgerCatalog'

interface WgerExercisePickerProps {
  /** Pre-fill the search box (e.g. with the exercise's own name). */
  initialSearch?: string
  onClose: () => void
  onSelect: (wgerId: number, name: string) => void
}

export function WgerExercisePicker({ initialSearch = '', onClose, onSelect }: WgerExercisePickerProps) {
  const [search, setSearch] = useState(initialSearch)
  const { data: catalog = [], isLoading } = useWgerCatalog()

  const terms = useMemo(() => search.toLowerCase().match(/[a-z0-9]+/g) ?? [], [search])
  const filtered = useMemo(() => {
    if (terms.length === 0) {
      return catalog.slice(0, 50)
    }
    // Rank by how many search words appear in the name; keep only matches.
    return catalog
      .map(e => {
        const lower = e.name.toLowerCase()
        const hits = terms.filter(t => lower.includes(t)).length
        return { e, hits }
      })
      .filter(x => x.hits > 0)
      .sort((a, b) => b.hits - a.hits || a.e.name.localeCompare(b.e.name))
      .slice(0, 50)
      .map(x => x.e)
  }, [catalog, terms])

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="border-border flex items-center gap-3 border-b px-4 pt-4 pb-3">
        <button className="text-muted-foreground p-1" type="button" onClick={onClose}>
          <X size={22} />
        </button>
        <span className="font-display font-600 text-lg tracking-wide uppercase">Link Demonstration</span>
      </div>

      <div className="border-border border-b px-4 py-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2" size={16} />
          <input
            className="bg-card border-border focus:border-primary w-full rounded-xl border py-2.5 pr-4 pl-9 text-sm outline-none"
            placeholder="Search wger exercises..."
            value={search}
            autoFocus
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="text-muted-foreground p-4 text-sm">Loading wger catalog…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-muted-foreground p-4 text-sm">No exercises with images match that search.</p>
        )}
        {filtered.map(e => (
          <button
            key={e.id}
            className="border-border/50 active:bg-card flex w-full items-center gap-4 border-b px-4 py-3 text-left transition-colors"
            type="button"
            onClick={() => onSelect(e.id, e.name)}
          >
            <img
              alt=""
              className="size-24 shrink-0 rounded-xl bg-white object-contain p-2"
              loading="lazy"
              src={e.imageUrl}
            />
            <span className="font-medium">{e.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
