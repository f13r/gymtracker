import { describe, it, expect, beforeEach } from 'vitest'

import { relocateExerciseImage } from './exercise-images'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

// Exercise Images are shared (ADR 0012): every image lives in the one shared folder
// `PHOTOS_DIR/exercises/`. Older images sit under `<userId>/exercises/` or `_defaults/` and are
// moved there on boot. The move must be idempotent and must never lose an image.
describe('relocateExerciseImage', () => {
  let photosDir: string

  const put = (rel: string, content: string) => {
    mkdirSync(dirname(join(photosDir, rel)), { recursive: true })
    writeFileSync(join(photosDir, rel), content)
  }
  const read = (rel: string) => readFileSync(join(photosDir, rel), 'utf8')
  const has = (rel: string) => existsSync(join(photosDir, rel))

  beforeEach(() => {
    photosDir = mkdtempSync(join(tmpdir(), 'exercise-images-'))
  })

  it('moves a per-User image and thumb into the shared folder', () => {
    put('default-user/exercises/e1-orig.webp', 'orig')
    put('default-user/exercises/e1-thumb.webp', 'thumb')

    const result = relocateExerciseImage(photosDir, {
      imagePath: 'default-user/exercises/e1-orig.webp',
      thumbPath: 'default-user/exercises/e1-thumb.webp',
    })

    expect(result).toEqual({
      status: 'moved',
      imagePath: 'exercises/e1-orig.webp',
      thumbPath: 'exercises/e1-thumb.webp',
    })
    expect(read('exercises/e1-orig.webp')).toBe('orig')
    expect(read('exercises/e1-thumb.webp')).toBe('thumb')
    expect(has('default-user/exercises/e1-orig.webp')).toBe(false)
    expect(has('default-user/exercises/e1-thumb.webp')).toBe(false)
  })

  it('moves an image from the old _defaults folder too', () => {
    put('_defaults/e2-orig.webp', 'orig')
    put('_defaults/e2-thumb.webp', 'thumb')

    const result = relocateExerciseImage(photosDir, {
      imagePath: '_defaults/e2-orig.webp',
      thumbPath: '_defaults/e2-thumb.webp',
    })

    expect(result.status).toBe('moved')
    expect(read('exercises/e2-orig.webp')).toBe('orig')
  })

  it('leaves an Exercise already in the shared folder unchanged', () => {
    put('exercises/e1-orig.webp', 'orig')
    put('exercises/e1-thumb.webp', 'thumb')

    const result = relocateExerciseImage(photosDir, {
      imagePath: 'exercises/e1-orig.webp',
      thumbPath: 'exercises/e1-thumb.webp',
    })

    expect(result).toEqual({
      status: 'unchanged',
      imagePath: 'exercises/e1-orig.webp',
      thumbPath: 'exercises/e1-thumb.webp',
    })
    expect(read('exercises/e1-orig.webp')).toBe('orig')
  })

  it('leaves an Exercise without an image unchanged', () => {
    expect(relocateExerciseImage(photosDir, { imagePath: null, thumbPath: null })).toEqual({
      status: 'unchanged',
      imagePath: null,
      thumbPath: null,
    })
  })

  it('finishes a move that was interrupted after the files were moved', () => {
    // A previous run moved the files but stopped before the row was rewritten.
    put('exercises/e1-orig.webp', 'orig')
    put('exercises/e1-thumb.webp', 'thumb')

    const result = relocateExerciseImage(photosDir, {
      imagePath: 'default-user/exercises/e1-orig.webp',
      thumbPath: 'default-user/exercises/e1-thumb.webp',
    })

    expect(result).toEqual({
      status: 'moved',
      imagePath: 'exercises/e1-orig.webp',
      thumbPath: 'exercises/e1-thumb.webp',
    })
  })

  it('finishes a move that was interrupted between the two files', () => {
    put('exercises/e1-orig.webp', 'orig')
    put('default-user/exercises/e1-thumb.webp', 'thumb')

    const result = relocateExerciseImage(photosDir, {
      imagePath: 'default-user/exercises/e1-orig.webp',
      thumbPath: 'default-user/exercises/e1-thumb.webp',
    })

    expect(result.status).toBe('moved')
    expect(read('exercises/e1-thumb.webp')).toBe('thumb')
    expect(has('default-user/exercises/e1-thumb.webp')).toBe(false)
  })

  it('drops the old copy when the shared folder already holds the same file', () => {
    put('default-user/exercises/e1-orig.webp', 'orig')
    put('exercises/e1-orig.webp', 'orig')

    const result = relocateExerciseImage(photosDir, {
      imagePath: 'default-user/exercises/e1-orig.webp',
      thumbPath: null,
    })

    expect(result).toEqual({ status: 'moved', imagePath: 'exercises/e1-orig.webp', thumbPath: null })
    expect(has('default-user/exercises/e1-orig.webp')).toBe(false)
  })

  it('skips, keeping both files, when a different file already has the shared name', () => {
    put('default-user/exercises/e1-orig.webp', 'mine')
    put('exercises/e1-orig.webp', 'someone else')

    const result = relocateExerciseImage(photosDir, {
      imagePath: 'default-user/exercises/e1-orig.webp',
      thumbPath: null,
    })

    expect(result.status).toBe('skipped')
    expect(read('default-user/exercises/e1-orig.webp')).toBe('mine')
    expect(read('exercises/e1-orig.webp')).toBe('someone else')
  })

  it('skips, moving nothing, when an image file is missing', () => {
    put('default-user/exercises/e1-thumb.webp', 'thumb')

    const result = relocateExerciseImage(photosDir, {
      imagePath: 'default-user/exercises/e1-orig.webp',
      thumbPath: 'default-user/exercises/e1-thumb.webp',
    })

    expect(result.status).toBe('skipped')
    expect(read('default-user/exercises/e1-thumb.webp')).toBe('thumb')
    expect(has('exercises/e1-thumb.webp')).toBe(false)
  })
})
