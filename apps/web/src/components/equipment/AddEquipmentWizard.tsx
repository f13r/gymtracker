import { useMutation } from '@tanstack/react-query'
import { Camera, ChevronLeft, X } from 'lucide-react'
import { useRef, useState } from 'react'

import type { AnalyzeSuggestion, SaveExerciseInput, SuggestedExercise } from '@gymtracker/shared'

import { equipmentApi } from '@/api/equipment'
import { Button } from '@/components/ui/button'

const EQUIPMENT_TYPES = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'other', label: 'Other' },
] as const

type Props = {
  onClose: () => void
  onSaved: () => void
}

type Step1State = {
  file: File | null
  previewUrl: string | null
  equipmentType: string
  description: string
}

type Step2State = {
  file: File
  suggestion: AnalyzeSuggestion
  name: string
  tags: string[]
  tagsInput: string
  selectedExercises: Set<number>
  exerciseNames: string[]
  equipmentType: string
  description: string
}

export function AddEquipmentWizard({ onClose, onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<1 | 2>(1)
  const [s1, setS1] = useState<Step1State>({
    file: null,
    previewUrl: null,
    equipmentType: 'machine',
    description: '',
  })
  const [s2, setS2] = useState<Step2State | null>(null)

  const analyze = useMutation({
    mutationFn: ({ file, equipmentType, description }: { file: File; equipmentType: string; description: string }) =>
      equipmentApi.analyze(file, equipmentType, description),
    onSuccess: (suggestion) => {
      setS2({
        file: s1.file!,
        suggestion,
        name: suggestion.equipment.name,
        tags: suggestion.equipment.tags,
        tagsInput: suggestion.equipment.tags.join(', '),
        selectedExercises: new Set(suggestion.exercises.map((_, i) => i)),
        exerciseNames: suggestion.exercises.map(e => e.name),
        equipmentType: s1.equipmentType,
        description: s1.description,
      })
      setStep(2)
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setS1(prev => ({
      ...prev,
      file,
      previewUrl: URL.createObjectURL(file),
    }))
  }

  if (step === 2 && s2) {
    return <Step2 s2={s2} setS2={setS2} onBack={() => setStep(1)} onClose={onClose} onSaved={onSaved} />
  }

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="border-border flex items-center gap-3 border-b px-4 py-3">
        <button className="flex h-9 w-9 items-center justify-center rounded-full" onClick={onClose}>
          <X size={20} />
        </button>
        <h2 className="flex-1 text-base font-semibold">Add Equipment</h2>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        {/* Photo picker */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-widest">
            Photo
          </label>
          <button
            className="bg-muted border-border flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-8 transition-colors active:scale-95"
            onClick={() => fileRef.current?.click()}
          >
            {s1.previewUrl ? (
              <img
                alt="Equipment preview"
                className="h-40 w-full rounded-xl object-cover"
                src={s1.previewUrl}
              />
            ) : (
              <>
                <Camera className="text-muted-foreground" size={32} strokeWidth={1.5} />
                <span className="text-muted-foreground text-sm">Tap to take or choose a photo</span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            accept="image/*"
            capture="environment"
            className="hidden"
            type="file"
            onChange={handleFileChange}
          />
        </div>

        {/* Equipment Type */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-widest">
            Equipment Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {EQUIPMENT_TYPES.map(({ value, label }) => (
              <button
                key={value}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  s1.equipmentType === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground'
                }`}
                onClick={() => setS1(prev => ({ ...prev, equipmentType: value }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Description / hint */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-widest">
            Description (helps AI)
          </label>
          <textarea
            className="bg-card border-border focus:border-primary w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors"
            placeholder="e.g. left cable tower near the window, dual pulley"
            rows={3}
            value={s1.description}
            onChange={e => setS1(prev => ({ ...prev, description: e.target.value }))}
          />
        </div>
      </div>

      <div className="border-border border-t p-4 pb-safe">
        {analyze.isError && (
          <p className="text-destructive mb-3 text-center text-sm">
            {analyze.error instanceof Error ? analyze.error.message : 'Analysis failed'}
          </p>
        )}
        <Button
          className="w-full"
          disabled={!s1.file || analyze.isPending}
          onClick={() => {
            if (s1.file) {
              analyze.mutate({
                file: s1.file,
                equipmentType: s1.equipmentType,
                description: s1.description,
              })
            }
          }}
        >
          {analyze.isPending ? 'Analyzing…' : 'Analyze Photo'}
        </Button>
      </div>
    </div>
  )
}

type Step2Props = {
  s2: Step2State
  setS2: React.Dispatch<React.SetStateAction<Step2State | null>>
  onBack: () => void
  onClose: () => void
  onSaved: () => void
}

function Step2({ s2, setS2, onBack, onClose, onSaved }: Step2Props) {
  const save = useMutation({
    mutationFn: () => {
      const exercises: SaveExerciseInput[] = s2.suggestion.exercises.flatMap((ex: SuggestedExercise, i: number) =>
        s2.selectedExercises.has(i)
          ? [{
              existingId: ex.existingId ?? undefined,
              name: s2.exerciseNames[i].trim() || ex.name,
              category: ex.category,
              equipmentType: ex.equipmentType,
            }]
          : []
      )
      return equipmentApi.create(
        s2.file,
        s2.name,
        s2.equipmentType,
        s2.description,
        s2.tags,
        exercises,
      )
    },
    onSuccess: onSaved,
  })

  const [renameConfirm, setRenameConfirm] = useState<Array<{ from: string; to: string }> | null>(null)

  const pendingRenames = s2.suggestion.exercises
    .map((ex: SuggestedExercise, i: number) => ({ ex, i }))
    .filter(({ ex, i }) =>
      s2.selectedExercises.has(i) &&
      ex.existingId !== null &&
      s2.exerciseNames[i].trim() !== ex.name
    )
    .map(({ ex, i }) => ({ from: ex.name, to: s2.exerciseNames[i].trim() }))

  const toggleExercise = (index: number) => {
    setS2(prev => {
      if (!prev) return prev
      const next = new Set(prev.selectedExercises)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return { ...prev, selectedExercises: next }
    })
  }

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col relative">
      <div className="border-border flex items-center gap-3 border-b px-4 py-3">
        <button className="flex h-9 w-9 items-center justify-center rounded-full" onClick={onBack}>
          <ChevronLeft size={20} />
        </button>
        <h2 className="flex-1 text-base font-semibold">Review Suggestions</h2>
        <button className="flex h-9 w-9 items-center justify-center rounded-full" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        {/* Equipment name */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-widest">
            Equipment Name
          </label>
          <input
            className="bg-card border-border focus:border-primary w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors"
            value={s2.name}
            onChange={e => setS2(prev => prev ? { ...prev, name: e.target.value } : prev)}
          />
        </div>

        {/* Tags */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-widest">
            Tags (comma-separated)
          </label>
          <input
            className="bg-card border-border focus:border-primary w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors"
            value={s2.tagsInput}
            onChange={e =>
              setS2(prev =>
                prev
                  ? {
                      ...prev,
                      tagsInput: e.target.value,
                      tags: e.target.value
                        .split(',')
                        .map(t => t.trim())
                        .filter(Boolean),
                    }
                  : prev,
              )
            }
          />
        </div>

        {/* Exercises */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold uppercase tracking-widest">
            Exercises ({s2.selectedExercises.size} selected)
          </label>
          <div className="space-y-1">
            {s2.suggestion.exercises.map((ex: SuggestedExercise, i: number) => (
              <div
                key={i}
                className={`flex w-full items-center gap-1 rounded-xl border transition-colors ${
                  s2.selectedExercises.has(i)
                    ? 'border-primary bg-primary/5'
                    : 'border-border opacity-50'
                }`}
              >
                <button
                  className="flex flex-shrink-0 items-center justify-center p-3"
                  type="button"
                  onClick={() => toggleExercise(i)}
                >
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                      s2.selectedExercises.has(i)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground'
                    }`}
                  >
                    {s2.selectedExercises.has(i) && (
                      <svg fill="none" height="10" viewBox="0 0 12 10" width="12">
                        <path
                          d="M1 5l3.5 3.5L11 1"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                        />
                      </svg>
                    )}
                  </div>
                </button>
                <div className="min-w-0 flex-1 py-3 pr-3">
                  <input
                    aria-label="Exercise name"
                    className="w-full bg-transparent text-sm font-medium outline-none"
                    value={s2.exerciseNames[i]}
                    onChange={e =>
                      setS2(prev => {
                        if (!prev) return prev
                        const names = [...prev.exerciseNames]
                        names[i] = e.target.value
                        return { ...prev, exerciseNames: names }
                      })
                    }
                  />
                  <p className="text-muted-foreground text-xs">
                    {ex.category} · {ex.equipmentType}
                    {ex.existingId ? ' · already in library' : ' · will be created'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-border border-t p-4 pb-safe">
        {save.isError && (
          <p className="text-destructive mb-3 text-center text-sm">Failed to save — try again</p>
        )}
        <Button
          className="w-full"
          disabled={save.isPending}
          onClick={() => {
            if (pendingRenames.length > 0) {
              setRenameConfirm(pendingRenames)
            } else {
              save.mutate()
            }
          }}
        >
          {save.isPending ? 'Saving…' : 'Save Equipment'}
        </Button>
      </div>

      {renameConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-6">
          <div className="bg-background w-full max-w-sm space-y-4 rounded-2xl p-6">
            <h3 className="font-semibold">Rename exercises in your library?</h3>
            <ul className="space-y-1">
              {renameConfirm.map(({ from, to }, idx) => (
                <li key={idx} className="text-muted-foreground text-sm">
                  "{from}" → "{to}"
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              These exercises will be renamed everywhere they appear.
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => setRenameConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setRenameConfirm(null)
                  save.mutate()
                }}
              >
                Rename & Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
