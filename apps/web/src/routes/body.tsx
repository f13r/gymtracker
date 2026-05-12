import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Scale, Camera, Plus } from 'lucide-react'
import { useState } from 'react'

import type { BodyWeight } from '@gymtracker/shared'

import { bodyApi } from '@/api/body'

export function BodyPage() {
  const queryClient = useQueryClient()
  const [newWeight, setNewWeight] = useState('')

  const { data: weights = [] } = useQuery({ queryKey: ['bodyWeights'], queryFn: bodyApi.getWeights })

  const addWeight = useMutation({
    mutationFn: () => bodyApi.addWeight({ weightKg: parseFloat(newWeight) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bodyWeights'] })
      setNewWeight('')
    },
  })

  const latest: BodyWeight | undefined = weights[0]

  return (
    <div className="mx-auto max-w-lg space-y-5 p-4">
      <div className="pt-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Tracking</p>
        <h1 className="font-display font-700 text-3xl tracking-wide">BODY</h1>
      </div>

      {latest && (
        <div className="bg-card border-border flex items-center gap-4 rounded-xl border p-5">
          <div className="bg-accent/10 flex h-12 w-12 items-center justify-center rounded-full">
            <Scale className="text-accent" size={22} />
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Latest weight</p>
            <p className="font-display font-700 text-accent text-4xl leading-tight">
              {latest.weightKg} <span className="text-muted-foreground text-lg font-normal">kg</span>
            </p>
            <p className="text-muted-foreground text-xs">
              {new Date(latest.recordedAt * 1000).toLocaleDateString('en', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault()
          if (newWeight && !addWeight.isPending) {
            addWeight.mutate()
          }
        }}
      >
        <input
          className="bg-card border-border focus:border-primary h-12 flex-1 rounded-xl border px-4 text-base transition-colors outline-none"
          inputMode="decimal"
          placeholder="Weight in kg"
          type="number"
          value={newWeight}
          onChange={e => setNewWeight(e.target.value)}
        />
        <button
          className="bg-primary text-primary-foreground flex h-12 w-12 items-center justify-center rounded-xl transition-transform active:scale-95 disabled:opacity-40"
          disabled={!newWeight || addWeight.isPending}
          type="submit"
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      </form>

      <Link
        className="bg-card border-border active:bg-muted flex items-center justify-between rounded-xl border px-4 py-4 transition-colors"
        to="/photos"
      >
        <div className="flex items-center gap-3">
          <div className="bg-muted flex h-9 w-9 items-center justify-center rounded-lg">
            <Camera className="text-muted-foreground" size={18} />
          </div>
          <span className="font-medium">Progress Photos</span>
        </div>
        <span className="text-muted-foreground text-sm">→</span>
      </Link>

      {weights.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground pb-1 text-xs font-semibold tracking-widest uppercase">Weight Log</p>
          <div className="bg-card border-border divide-border/50 divide-y overflow-hidden rounded-xl border">
            {weights.slice(0, 10).map(w => (
              <div key={w.id} className="flex items-center justify-between px-4 py-3">
                <span className="font-display font-600 text-lg">
                  {w.weightKg} <span className="text-muted-foreground text-sm font-normal">kg</span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {new Date(w.recordedAt * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
