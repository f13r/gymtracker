import { Pool } from 'pg'
import sharp from 'sharp'

import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// One-time migration of demonstration media off wger.de into local storage.
//
// For every Exercise that still carries a wger_id but has no local image yet, this downloads the
// main wger demonstration image (flattened onto white, since wger art is black line-art on a
// transparent background) and the English description, writes orig + thumb .webp into
// PHOTOS_DIR/_defaults, and records the paths + description on the row.
//
// It is the single last time wger.de is ever contacted. Idempotent: rows that already have an
// image_path are skipped, so re-runs only fill in whatever failed previously.
//
// Run (local) after `nest build`:
//   node -r dotenv/config dist/scripts/backfill-exercise-media.js
// Then dump the DB to prod and copy the PHOTOS_DIR/_defaults files across.

const WGER_API = 'https://wger.de/api/v2'
const ENGLISH = 2 // wger language id for English

interface WgerExerciseInfo {
  images?: Array<{ image: string; is_main: boolean }>
  translations?: Array<{ language: number; description?: string }>
}

function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|li|ul|ol|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim()
}

async function fetchWger(wgerId: number): Promise<{ imageUrl: string | null; description: string | null }> {
  const res = await fetch(`${WGER_API}/exerciseinfo/${wgerId}/?format=json`)
  if (!res.ok) {
    throw new Error(`wger ${wgerId} returned ${res.status}`)
  }
  const data = (await res.json()) as WgerExerciseInfo
  const mainImage = data.images?.find(i => i.is_main) ?? data.images?.[0]
  const translation =
    data.translations?.find(t => t.language === ENGLISH && t.description) ?? data.translations?.find(t => t.description)
  return {
    imageUrl: mainImage?.image ?? null,
    description: translation?.description ? htmlToText(translation.description) : null,
  }
}

async function main() {
  const photosDir = process.env.PHOTOS_DIR
  if (!photosDir) {
    throw new Error('PHOTOS_DIR is not set')
  }
  const defaultsDir = join(photosDir, '_defaults')
  mkdirSync(defaultsDir, { recursive: true })

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/gymtracker',
  })

  try {
    const { rows } = await pool.query<{ id: string; name: string; wger_id: number }>(
      `SELECT id, name, wger_id FROM exercises
       WHERE wger_id IS NOT NULL AND image_path IS NULL
       ORDER BY name`,
    )
    console.log(`${rows.length} exercise(s) to backfill.`)

    let ok = 0
    let failed = 0
    for (const row of rows) {
      try {
        const { imageUrl, description } = await fetchWger(row.wger_id)
        if (!imageUrl) {
          console.warn(`  ! ${row.name} (wger ${row.wger_id}): no image, storing description only`)
          await pool.query(`UPDATE exercises SET description = $2 WHERE id = $1`, [row.id, description])
          ok += 1
          continue
        }

        const imgRes = await fetch(imageUrl)
        if (!imgRes.ok) {
          throw new Error(`image download ${imgRes.status}`)
        }
        const input = Buffer.from(await imgRes.arrayBuffer())

        const relOrig = `_defaults/${row.id}-orig.webp`
        const relThumb = `_defaults/${row.id}-thumb.webp`
        // Flatten onto white so the stored .webp is self-contained: line-art stays visible on the
        // dark theme with no display-time special-casing.
        await sharp(input).flatten({ background: '#ffffff' }).webp({ quality: 85 }).toFile(join(photosDir, relOrig))
        await sharp(input)
          .flatten({ background: '#ffffff' })
          .resize({ width: 400 })
          .webp({ quality: 75 })
          .toFile(join(photosDir, relThumb))

        await pool.query(`UPDATE exercises SET image_path = $2, thumb_path = $3, description = $4 WHERE id = $1`, [
          row.id,
          relOrig,
          relThumb,
          description,
        ])
        console.log(`  ✓ ${row.name}`)
        ok += 1
      } catch (err) {
        failed += 1
        console.error(`  ✗ ${row.name} (wger ${row.wger_id}): ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log(
      `Done. ${ok} backfilled, ${failed} failed. Files in ${defaultsDir} (existing: ${existsSync(defaultsDir)}).`,
    )
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
