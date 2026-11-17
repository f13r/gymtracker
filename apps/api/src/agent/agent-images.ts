import sharp from 'sharp'

import { EXERCISE_IMAGE_DIR, exerciseImagePaths } from '../exercises/exercise-images'
import { randomUUID } from 'crypto'
import { mkdirSync, renameSync, unlinkSync } from 'fs'
import { isIP } from 'net'
import { join } from 'path'

/** The HTTP client used to download images; `fetch` in production, a fake in tests. */
export type ImageFetch = (url: string, init: RequestInit) => Promise<Response>
export const IMAGE_FETCH = 'AGENT_IMAGE_FETCH' as const

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 20_000
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

export class ImageFetchError extends Error {}

/** Loopback, private, link-local and unspecified addresses, written as IP literals or `localhost`. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true
  }
  if (isIP(host) === 4) {
    const [a = 0, b = 0] = host.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  if (isIP(host) === 6) {
    return host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:')
  }
  return false
}

function checkUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ImageFetchError('Not a valid URL')
  }
  if (url.protocol !== 'https:') {
    throw new ImageFetchError('Only https image URLs are allowed')
  }
  if (isPrivateHost(url.hostname)) {
    throw new ImageFetchError('Image URL points at a local or private address')
  }
  return url
}

/**
 * Download an image over https: redirects are followed only to https, the type must be a common
 * image type and the size at most MAX_IMAGE_BYTES (checked while reading, not just by the header).
 * Throws ImageFetchError with a message fit for the Agent.
 */
export async function downloadImage(fetchFn: ImageFetch, rawUrl: string): Promise<Buffer> {
  let url = checkUrl(rawUrl)
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  for (let hop = 0; ; hop++) {
    let res: Response
    try {
      res = await fetchFn(url.toString(), { redirect: 'manual', signal, headers: { accept: 'image/*' } })
    } catch {
      throw new ImageFetchError('Image could not be downloaded')
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location || hop >= MAX_REDIRECTS) {
        throw new ImageFetchError('Image URL redirects too often or nowhere')
      }
      url = checkUrl(new URL(location, url).toString())
      continue
    }
    if (!res.ok) {
      throw new ImageFetchError(`Image download failed with HTTP ${res.status}`)
    }
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (!IMAGE_TYPES.has(type)) {
      throw new ImageFetchError(`Not an image (${type || 'no content type'}); use JPEG, PNG, WebP, GIF or AVIF`)
    }
    if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
      throw new ImageFetchError('Image is larger than 10 MB')
    }
    return readCapped(res)
  }
}

async function readCapped(res: Response): Promise<Buffer> {
  if (!res.body) {
    throw new ImageFetchError('Image response has no body')
  }
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    size += value.byteLength
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel()
      throw new ImageFetchError('Image is larger than 10 MB')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/** A downloaded image converted to the usual orig + thumb `.webp` pair, parked under a temporary name. */
export type StagedImage = { tmpImage: string; tmpThumb: string }

/** Convert an image to the Exercise Image pair (as ExercisesService does) under temporary names. */
export async function stageExerciseImage(photosDir: string, buffer: Buffer): Promise<StagedImage> {
  mkdirSync(join(photosDir, EXERCISE_IMAGE_DIR), { recursive: true })
  const base = join(photosDir, EXERCISE_IMAGE_DIR, `.agent-${randomUUID()}`)
  const staged = { tmpImage: `${base}-orig.webp`, tmpThumb: `${base}-thumb.webp` }
  try {
    await sharp(buffer).rotate().webp({ quality: 85 }).toFile(staged.tmpImage)
    await sharp(buffer).rotate().resize({ width: 400 }).webp({ quality: 75 }).toFile(staged.tmpThumb)
  } catch {
    discardStagedImage(staged)
    throw new ImageFetchError('Downloaded file is not a readable image')
  }
  return staged
}

/** Move a staged image into place as the Exercise's image; returns the relative paths stored on the row. */
export function commitStagedImage(photosDir: string, staged: StagedImage, exerciseId: string) {
  const paths = exerciseImagePaths(exerciseId)
  renameSync(staged.tmpImage, join(photosDir, paths.imagePath))
  renameSync(staged.tmpThumb, join(photosDir, paths.thumbPath))
  return paths
}

export function discardStagedImage(staged: StagedImage) {
  for (const file of [staged.tmpImage, staged.tmpThumb]) {
    try {
      unlinkSync(file)
    } catch {} // eslint-disable-line no-empty
  }
}
