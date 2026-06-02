# Renaming an existing Exercise via the Add Equipment wizard

When a Suggested Exercise matches an existing library Exercise by name, the user can edit that name in Step 2 of the wizard. If the name is changed, saving the Equipment also renames the Exercise in the library (after explicit confirmation). This was chosen over locking the name field (forcing the user to deselect and live with the wrong name) or silently creating a new Exercise alongside the existing one (orphaning the original). The rename is scoped to the user's own library and applied in the same DB transaction as the Equipment save; the confirmation dialog lists every rename before committing so the user understands the scope.

## Considered options

- **Lock name when existingId is set** — safest, but leaves the user with no way to correct a wrong AI name without abandoning the wizard entirely.
- **Create a new Exercise with the new name** — avoids mutating shared data, but orphans the original Exercise, splits history across two records, and the user ends up with a duplicate they'll need to clean up.
- **Rename with confirmation (chosen)** — the user typed the new name deliberately; a single confirmation dialog is enough guard. Exercises are user-owned (not globally shared at this stage), so the blast radius is limited to one user's library.
