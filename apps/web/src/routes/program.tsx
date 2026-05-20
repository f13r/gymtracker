import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Zap } from 'lucide-react'

import type { Program, ProgramPhase } from '@gymtracker/shared'

import { programApi } from '@/api/program'

const PHASE_TYPE_LABELS: Record<string, string> = {
  accumulation: 'Accumulation',
  strength: 'Strength',
  peaking: 'Peaking',
  maintenance: 'Maintenance',
}

const UPDATE_TYPE_LABELS: Record<string, string> = {
  phase_transition: 'Phase Transition',
  exercise_swap: 'Exercise Swap',
  deload: 'Deload Week',
  phase_extension: 'Phase Extension',
}

function PhaseProgressBar({ phase }: { phase: ProgramPhase }) {
  const pct = Math.min(100, Math.round((phase.completedSessionCount / phase.targetSessionCount) * 100))
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Sessions</span>
        <span className="font-mono tabular-nums">
          {phase.completedSessionCount} / {phase.targetSessionCount}
        </span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ProgramView({ program }: { program: Program }) {
  const queryClient = useQueryClient()

  const activePhase = program.phases.find(p => p.status === 'active')
  const pendingPhases = program.phases.filter(p => p.status === 'pending')

  const acknowledge = useMutation({
    mutationFn: ({ action }: { action: 'accept' | 'dismiss' }) =>
      programApi.acknowledgeUpdate(program.pendingUpdate!.id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['program'] }),
  })

  const evaluate = useMutation({
    mutationFn: programApi.evaluate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['program'] }),
  })

  return (
    <div className="space-y-4">
      <div className="bg-card border-border overflow-hidden rounded-xl border">
        <div className="border-border border-b px-4 py-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Program</p>
          <p className="font-display font-600 text-lg tracking-wide">{program.name}</p>
        </div>
        {activePhase && (
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-semibold">
                {PHASE_TYPE_LABELS[activePhase.type] ?? activePhase.type}
              </span>
              <span className="font-display font-600 text-sm">{activePhase.name}</span>
            </div>
            <p className="text-muted-foreground text-sm">{activePhase.rationale}</p>
            <PhaseProgressBar phase={activePhase} />
          </div>
        )}
      </div>

      {pendingPhases.length > 0 && (
        <div className="bg-card border-border overflow-hidden rounded-xl border">
          <div className="border-border border-b px-4 py-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Upcoming Phases</p>
          </div>
          <div className="divide-border divide-y">
            {pendingPhases.map((phase, i) => (
              <div key={phase.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-muted-foreground font-mono text-sm">{i + 2}</span>
                <div>
                  <p className="text-sm font-medium">{phase.name}</p>
                  <p className="text-muted-foreground text-xs">{PHASE_TYPE_LABELS[phase.type] ?? phase.type}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {program.pendingUpdate && (
        <div className="border-primary/30 bg-primary/5 overflow-hidden rounded-xl border-2">
          <div className="border-primary/20 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-primary" />
              <span className="text-primary text-xs font-semibold tracking-widest uppercase">
                {UPDATE_TYPE_LABELS[program.pendingUpdate.type] ?? program.pendingUpdate.type}
              </span>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <p className="font-medium">{program.pendingUpdate.description}</p>
            <p className="text-muted-foreground text-sm">{program.pendingUpdate.reason}</p>
            {program.pendingUpdate.evidence.length > 0 && (
              <ul className="space-y-1">
                {program.pendingUpdate.evidence.map((e, i) => (
                  <li key={i} className="text-muted-foreground flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">•</span>
                    {e}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => acknowledge.mutate({ action: 'accept' })}
                disabled={acknowledge.isPending}
                className="bg-primary text-primary-foreground font-display font-600 flex-1 rounded-xl py-2.5 text-sm tracking-wide transition-all active:scale-95 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={() => acknowledge.mutate({ action: 'dismiss' })}
                disabled={acknowledge.isPending}
                className="bg-muted text-muted-foreground font-display font-600 flex-1 rounded-xl py-2.5 text-sm tracking-wide transition-all active:scale-95 disabled:opacity-50"
              >
                Not yet
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => evaluate.mutate()}
        disabled={evaluate.isPending}
        className="border-border text-muted-foreground hover:text-foreground w-full rounded-xl border py-3 text-sm transition-colors disabled:opacity-50"
      >
        {evaluate.isPending ? 'Evaluating…' : 'Re-evaluate my program'}
      </button>
    </div>
  )
}

export function ProgramPage() {
  const queryClient = useQueryClient()

  const { data: program, isLoading } = useQuery({
    queryKey: ['program'],
    queryFn: programApi.getActive,
  })

  const generate = useMutation({
    mutationFn: programApi.generate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['program'] }),
  })

  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-4 pt-4 pb-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">AI Coach</p>
        <h1 className="font-display font-700 text-3xl tracking-wide">PROGRAM</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg space-y-4 p-4">
          {isLoading && (
            <div className="text-muted-foreground p-8 text-center text-sm">Loading…</div>
          )}

          {!isLoading && !program && (
            <div className="flex flex-col items-center gap-6 py-16 text-center">
              <div className="space-y-2">
                <h2 className="font-display font-600 text-xl tracking-wide">No Program Yet</h2>
                <p className="text-muted-foreground text-sm">
                  Let the AI create a personalised multi-phase program based on your profile and available exercises.
                </p>
              </div>
              <button
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
                className="bg-primary text-primary-foreground font-display font-600 rounded-xl px-8 py-3 tracking-wide transition-all active:scale-95 disabled:opacity-50"
              >
                {generate.isPending ? 'Generating…' : 'Generate my Program'}
              </button>
            </div>
          )}

          {!isLoading && program && <ProgramView program={program} />}
        </div>
      </div>
    </div>
  )
}
