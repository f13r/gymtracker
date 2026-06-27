# Editable Exercise Names in Equipment Wizard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users rename AI-suggested exercises in Step 2 of the Add Equipment wizard; if a renamed exercise already exists in the library, rename it there too (with confirmation); also improve the Gemini prompt to reduce wrong-position suggestions.

**Architecture:** Step2State gains a parallel `exerciseNames: string[]` array. Exercise rows change from full-row `<button>` (toggle) to a `<div>` with a left tap-target (toggle) and a right `<input>` (rename). At save time, renames of existing exercises surface a confirmation dialog; cancel aborts the save and returns to Step 2. The backend's `create` method gains a name-UPDATE before linking when `existingId` is set (scoped to user exercises, not defaults).

**Tech Stack:** React 18, TypeScript, Tailwind CSS, NestJS, Drizzle ORM (`and`, `eq`, `or` — already imported)

---

## Files

- Modify: `apps/web/src/components/equipment/AddEquipmentWizard.tsx`
- Modify: `apps/api/src/equipment/equipment.service.ts`

---

### Task 1: Improve Gemini prompt for body-position accuracy

**Files:**

- Modify: `apps/api/src/equipment/equipment.service.ts`

- [ ] **Step 1: Open the file and locate the prompt string**

In `equipment.service.ts`, find the `text:` field inside `contents[0].parts[1]`:

```ts
text:
  `Analyze this gym equipment photo. Equipment type: ${equipmentType}. User description: ${description}.\n\n` +
  `List all exercises that can be performed with this equipment. ` +
  `Also suggest a concise name for this specific equipment instance (e.g. "Left Cable Tower", "Adjustable Incline Bench").`,
```

- [ ] **Step 2: Replace with the position-aware version**

```ts
text:
  `Analyze this gym equipment photo. Equipment type: ${equipmentType}. User description: ${description}.\n\n` +
  `List all exercises that can be performed with this equipment. ` +
  `Describe each exercise's body position accurately based on what the equipment shows (e.g. seated, lying, standing, incline) — do not assume a default position if the equipment clearly shows otherwise. ` +
  `Also suggest a concise name for this specific equipment instance (e.g. "Left Cable Tower", "Adjustable Incline Bench").`,
```

- [ ] **Step 3: Verify the API still builds**

```bash
cd apps/api && npm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/equipment/equipment.service.ts
git commit -m "fix: instruct Gemini to describe exercise body position accurately"
```

---

### Task 2: Add `exerciseNames` to Step2State

**Files:**

- Modify: `apps/web/src/components/equipment/AddEquipmentWizard.tsx`

- [ ] **Step 1: Add `exerciseNames` to the type**

Find the `Step2State` type definition:

```ts
type Step2State = {
  file: File
  suggestion: AnalyzeSuggestion
  name: string
  tags: string[]
  tagsInput: string
  selectedExercises: Set<number>
  equipmentType: string
  description: string
}
```

Replace with:

```ts
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
```

- [ ] **Step 2: Initialize `exerciseNames` in `analyze.onSuccess`**

Find the `onSuccess` callback in the `analyze` mutation:

```ts
onSuccess: (suggestion) => {
  setS2({
    file: s1.file!,
    suggestion,
    name: suggestion.equipment.name,
    tags: suggestion.equipment.tags,
    tagsInput: suggestion.equipment.tags.join(', '),
    selectedExercises: new Set(suggestion.exercises.map((_, i) => i)),
    equipmentType: s1.equipmentType,
    description: s1.description,
  })
  setStep(2)
},
```

Replace with:

```ts
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
```

- [ ] **Step 3: Verify the web app still builds**

```bash
cd apps/web && npm run build
```

Expected: exits 0. TypeScript will error if `exerciseNames` is missing anywhere — that's expected and will be fixed in Task 3.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/equipment/AddEquipmentWizard.tsx
git commit -m "feat: add exerciseNames to Step2State for editable exercise names"
```

---

### Task 3: Restructure exercise rows — split-target layout with editable name

**Files:**

- Modify: `apps/web/src/components/equipment/AddEquipmentWizard.tsx`

- [ ] **Step 1: Replace the exercise row render in Step2**

Find this block inside the `Step2` function's return, inside the `{/* Exercises */}` section:

```tsx
{
  s2.suggestion.exercises.map((ex: SuggestedExercise, i: number) => (
    <button
      key={i}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
        s2.selectedExercises.has(i) ? 'border-primary bg-primary/5' : 'border-border opacity-50'
      }`}
      onClick={() => toggleExercise(i)}
    >
      <div
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${
          s2.selectedExercises.has(i) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'
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
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{ex.name}</p>
        <p className="text-muted-foreground text-xs">
          {ex.category} · {ex.equipmentType}
          {ex.existingId ? ' · already in library' : ' · will be created'}
        </p>
      </div>
    </button>
  ))
}
```

Replace with:

```tsx
{
  s2.suggestion.exercises.map((ex: SuggestedExercise, i: number) => (
    <div
      key={i}
      className={`flex w-full items-center gap-1 rounded-xl border transition-colors ${
        s2.selectedExercises.has(i) ? 'border-primary bg-primary/5' : 'border-border opacity-50'
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
  ))
}
```

- [ ] **Step 2: Update the save mutation to use `exerciseNames`**

Find the `save` mutation inside `Step2`:

```ts
const save = useMutation({
  mutationFn: () => {
    const selected = s2.suggestion.exercises.filter((_, i) => s2.selectedExercises.has(i))
    const exercises: SaveExerciseInput[] = selected.map((ex: SuggestedExercise) => ({
      existingId: ex.existingId ?? undefined,
      name: ex.name,
      category: ex.category,
      equipmentType: ex.equipmentType,
    }))
    return equipmentApi.create(s2.file, s2.name, s2.equipmentType, s2.description, s2.tags, exercises)
  },
  onSuccess: onSaved,
})
```

Replace with:

```ts
const save = useMutation({
  mutationFn: () => {
    const exercises: SaveExerciseInput[] = s2.suggestion.exercises.flatMap((ex: SuggestedExercise, i: number) =>
      s2.selectedExercises.has(i)
        ? [
            {
              existingId: ex.existingId ?? undefined,
              name: s2.exerciseNames[i].trim() || ex.name,
              category: ex.category,
              equipmentType: ex.equipmentType,
            },
          ]
        : [],
    )
    return equipmentApi.create(s2.file, s2.name, s2.equipmentType, s2.description, s2.tags, exercises)
  },
  onSuccess: onSaved,
})
```

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
cd apps/web && npm run build
```

Expected: exits 0.

- [ ] **Step 4: Start dev server and manually verify**

```bash
cd apps/web && npm run dev
```

Open the app, go to /gym, tap "Add Equipment", take/pick a photo, tap "Analyze Photo". On Step 2:

- Exercise names should appear as editable inputs.
- Tapping the checkbox area on the left should toggle selection.
- Tapping/typing in the name area should not toggle selection.
- Changing a name and tapping Save Equipment should save with the new name (check network payload in DevTools → `exercises` JSON field).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/equipment/AddEquipmentWizard.tsx
git commit -m "feat: make exercise names editable in Step 2 of Add Equipment wizard"
```

---

### Task 4: Add rename confirmation dialog at save time

**Files:**

- Modify: `apps/web/src/components/equipment/AddEquipmentWizard.tsx`

- [ ] **Step 1: Add `renameConfirm` state to Step2**

At the top of the `Step2` function body, after the existing `save` mutation declaration, add:

```ts
const [renameConfirm, setRenameConfirm] = useState<Array<{ from: string; to: string }> | null>(null)
```

`useState` is already imported. No new imports needed.

- [ ] **Step 2: Add a helper to compute pending renames**

Add this directly below the `renameConfirm` state line:

```ts
const pendingRenames = s2.suggestion.exercises
  .map((ex: SuggestedExercise, i: number) => ({ ex, i }))
  .filter(
    ({ ex, i }) => s2.selectedExercises.has(i) && ex.existingId !== null && s2.exerciseNames[i].trim() !== ex.name,
  )
  .map(({ ex, i }) => ({ from: ex.name, to: s2.exerciseNames[i].trim() }))
```

- [ ] **Step 3: Wire Save button to show dialog when renames exist**

Find the Save button's `onClick` at the bottom of Step2:

```tsx
<Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
  {save.isPending ? 'Saving…' : `Save Equipment`}
</Button>
```

Replace with:

```tsx
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
```

- [ ] **Step 4: Add the confirmation overlay**

Inside the `Step2` return, add this block immediately before the closing `</div>` of the outer fixed container (the one with `className="bg-background fixed inset-0 z-50 flex flex-col"`):

```tsx
{
  renameConfirm && (
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
        <p className="text-muted-foreground text-xs">These exercises will be renamed everywhere they appear.</p>
        <div className="flex gap-2">
          <Button className="flex-1" variant="outline" onClick={() => setRenameConfirm(null)}>
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
  )
}
```

Note: the outer `fixed` container needs `relative` or `position: relative` for the overlay's `absolute` to be scoped correctly. Add `relative` to the outer div's className:

Find:

```tsx
<div className="bg-background fixed inset-0 z-50 flex flex-col">
```

Replace with:

```tsx
<div className="bg-background fixed inset-0 z-50 flex flex-col relative">
```

- [ ] **Step 5: Build**

```bash
cd apps/web && npm run build
```

Expected: exits 0.

- [ ] **Step 6: Manually verify confirmation flow**

```bash
cd apps/web && npm run dev
```

Scenario: add equipment where Gemini suggests an exercise that matches one already in your library (the `· already in library` badge appears). Edit that exercise's name. Tap Save Equipment:

- Confirmation dialog must appear, listing `"old name" → "new name"`.
- Tap Cancel → dialog dismisses, you are back in Step 2 with no save triggered.
- Tap Save Equipment again → dialog appears again.
- Tap "Rename & Save" → equipment saves and wizard closes.

Scenario: all exercises are new (no `· already in library`). Rename one. Tap Save Equipment:

- No confirmation dialog — save fires immediately.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/equipment/AddEquipmentWizard.tsx
git commit -m "feat: confirm before renaming existing library exercises via Equipment wizard"
```

---

### Task 5: Backend — rename exercise when existingId is provided

**Files:**

- Modify: `apps/api/src/equipment/equipment.service.ts`

- [ ] **Step 1: Locate the exercise-linking loop in `create`**

Find this block inside the `create` method:

```ts
for (const ex of exercises) {
  if (ex.existingId) {
    exerciseIds.push(ex.existingId)
  } else {
    const [newEx] = await this.db
      .insert(schema.exercises)
      .values({
        id: randomUUID(),
        userId,
        name: ex.name,
        category: ex.category,
        equipmentType: ex.equipmentType,
        notes: null,
        isDefault: 0,
        createdAt: now,
      })
      .returning()
    exerciseIds.push(newEx!.id)
  }
}
```

- [ ] **Step 2: Add name UPDATE for existing exercises**

Replace with:

```ts
for (const ex of exercises) {
  if (ex.existingId) {
    await this.db
      .update(schema.exercises)
      .set({ name: ex.name })
      .where(
        and(
          eq(schema.exercises.id, ex.existingId),
          eq(schema.exercises.userId, userId),
          eq(schema.exercises.isDefault, 0),
        ),
      )
    exerciseIds.push(ex.existingId)
  } else {
    const [newEx] = await this.db
      .insert(schema.exercises)
      .values({
        id: randomUUID(),
        userId,
        name: ex.name,
        category: ex.category,
        equipmentType: ex.equipmentType,
        notes: null,
        isDefault: 0,
        createdAt: now,
      })
      .returning()
    exerciseIds.push(newEx!.id)
  }
}
```

Note: the `and`, `eq` are already imported from `drizzle-orm` at the top of this file. The WHERE clause scopes the UPDATE to only the user's own custom exercises (`isDefault = 0`). Default exercises (seeded library) are never renamed — the UPDATE silently no-ops and the default exercise is linked as-is with its original name.

- [ ] **Step 3: Build the API**

```bash
cd apps/api && npm run build
```

Expected: exits 0.

- [ ] **Step 4: End-to-end manual verify**

Start both servers:

```bash
# terminal 1
cd apps/api && npm run dev

# terminal 2
cd apps/web && npm run dev
```

1. Add equipment where Gemini matches an existing library exercise.
2. In Step 2, rename it to a new name.
3. Confirm the rename in the dialog.
4. Open the Exercises list in the app — the exercise should now show the new name.
5. Confirm the old name is gone.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/equipment/equipment.service.ts
git commit -m "feat: rename user exercise when existingId is present on Equipment save"
```
