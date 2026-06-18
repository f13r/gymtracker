# Drop the wger.de integration; store Exercise media locally

Exercises no longer depend on **wger.de**. Previously an Exercise stored only a `wgerId` (a wger.de exercise base id), and its demonstration image and description were hot-linked **live** from the wger.de API at render time (`useExerciseMedia`, `useWgerCatalog`); creating an Exercise required picking a wger entry, and the server fetched name/category/equipment from wger (`WgerService`).

Now each **Exercise** owns a local **Exercise Image** — a self-contained `.webp` (orig + thumb) on disk, addressed by the Exercise's id — and an optional plain-text `description` column. An Exercise is created by typing a name and (optionally) uploading a photo; there is no third party in the path. The `wgerId` column and **all** wger code (`WgerService`, `useExerciseMedia`, `useWgerCatalog`, `WgerExercisePicker`, seeded wger ids) are removed.

The images that existed only as live wger URLs are preserved by a **one-time backfill**: for every Exercise with a `wgerId`, download the main image (flattened onto white via `sharp`, since wger art is black line-art on transparency) and the description, write the files + columns, then drop the column. The backfill is the single last time wger is ever contacted.

## Considered Options

- **Keep wger, just add a custom-exercise path:** rejected. The blocking problem was structural — mid-workout you cannot log an Exercise that has no wger match, and you cannot attach your own photo. Keeping wger leaves a two-class system (wger-backed vs. custom) and a permanent live dependency on a third party for images to render at all.
- **Store image bytes in Postgres (`bytea`):** rejected. Bloats the DB and every `db:pull-prod` snapshot, and breaks the established pattern. Equipment and progress photos already store `.webp` on disk with paths in the DB.
- **Commit the ~28 default-exercise images into the repo:** considered for shipping shared default images to prod and seeding fresh installs. Rejected for this project because the prod server is reachable over the local network, so files are copied directly after the local backfill; the repo stays free of binary assets.
- **Drop wger; store media locally (chosen):** one uniform media path (user uploads and migrated defaults are identical `.webp` on disk), any Exercise can be created with any photo, and rendering no longer depends on a third-party API being up.

## Consequences

- A migration **drops the `exercises.wger_id` column** and adds `image_path`, `thumb_path`, and `description` (all nullable). The backfill must run **before** the column is dropped — the order is load-bearing.
- Exercise images are served **by Exercise id** (`GET /exercises/:id/image`, `/thumb`) reusing the existing own-or-default authz; the exercise DTO exposes a `hasImage` flag so the UI never requests a missing image. File paths are never exposed in URLs.
- Create/Edit Exercise becomes a **multipart** request (fields + optional image), mirroring `photos.controller.ts`. Deleting an Exercise must `unlink` its image files like `deletePhoto` does, or orphaned `.webp` files accumulate.
- `db:pull-prod` pulls the **DB only** — image files in `PHOTOS_DIR` are not in the dump. This already applies to equipment/progress photos; exercise images inherit the same reality, so any environment seeded from a prod dump also needs the files copied across.
- **Fresh installs** seed default Exercises with name/category/equipment but **no images** (the images live only on prod after the one-time backfill + file copy). Accepted: single-user app, prod is the source of truth.
- Re-adding wger later would be a rebuild (catalog, picker, live-media hooks, the id column) — this is intentionally a one-way door.
