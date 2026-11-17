import sharp from 'sharp'

import { EXERCISE_IMAGE_DIR, exerciseImagePaths } from '../exercises/exercise-images'
import { randomUUID } from 'crypto'
import { lookup as dnsLookup } from 'dns/promises'
import { mkdirSync, renameSync, unlinkSync } from 'fs'
import { request } from 'https'
import { BlockList, isIP, type LookupFunction } from 'net'
import { join } from 'path'
import { Readable } from 'stream'

export type ResolvedAddress = { address: string; family: number }

/** One GET of `url` over a connection made to `address` only: no second DNS lookup. */
export type ImageRequest = { url: URL; address: ResolvedAddress; signal: AbortSignal }

/**
 * The network as the image download sees it: name resolution and a pinned GET. Production uses
 * `nodeImageClient`; tests inject a fake, so no test touches real DNS or the internet.
 */
export type ImageClient = {
  resolve: (hostname: string) => Promise<ResolvedAddress[]>
  fetch: (req: ImageRequest) => Promise<Response>
}
export const IMAGE_CLIENT = 'AGENT_IMAGE_CLIENT' as const

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 20_000
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

export class ImageFetchError extends Error {}

const PRIVATE = 'Image URL points at a local or private address'

// Addresses the server must never fetch from: private, loopback, link-local, CGNAT, unspecified,
// multicast, reserved and documentation ranges, plus IPv6 transition prefixes that embed IPv4.
const blocked = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4')
}
for (const [net, prefix] of [
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6')
}

/** The eight 16-bit groups of an IPv6 address (`::` expanded, a dotted IPv4 tail converted). */
function ipv6Groups(address: string): number[] {
  let text = address.toLowerCase()
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text)
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number]
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head = '', tail] = text.split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const fill = tail === undefined ? [] : Array<string>(8 - h.length - t.length).fill('0')
  return [...h, ...fill, ...t].map(g => parseInt(g, 16))
}

/** The IPv4 address inside an IPv4-mapped, IPv4-compatible or NAT64 IPv6 address, if any. */
function embeddedIPv4(groups: number[]): string | undefined {
  const zero = (from: number, to: number) => groups.slice(from, to).every(g => g === 0)
  const mapped = zero(0, 5) && groups[5] === 0xffff
  const compatible = zero(0, 6)
  const nat64 = groups[0] === 0x64 && groups[1] === 0xff9b && zero(2, 6)
  if (!mapped && !compatible && !nat64) {
    return undefined
  }
  const [hi = 0, lo = 0] = groups.slice(6)
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
}

/** Whether the server must refuse to connect to this IP address (anything that is not an IP: yes). */
export function isBlockedAddress(raw: string): boolean {
  const address = raw.replace(/^\[|\]$/g, '').split('%')[0]!
  const version = isIP(address)
  if (version === 4) {
    return blocked.check(address, 'ipv4')
  }
  if (version === 6) {
    const v4 = embeddedIPv4(ipv6Groups(address))
    return v4 ? isBlockedAddress(v4) : blocked.check(address, 'ipv6')
  }
  return true
}

function parseHttpsUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ImageFetchError('Not a valid URL')
  }
  if (url.protocol !== 'https:') {
    throw new ImageFetchError('Only https image URLs are allowed')
  }
  return url
}

/** The address to connect to for `hostname`: refused if it, or any address the name resolves to, is blocked. */
async function vetHost(client: ImageClient, hostname: string): Promise<ResolvedAddress> {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new ImageFetchError(PRIVATE)
    }
    return { address: host, family: isIP(host) }
  }
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new ImageFetchError(PRIVATE)
  }
  let addresses: ResolvedAddress[]
  try {
    addresses = await client.resolve(host)
  } catch {
    addresses = []
  }
  if (addresses.length === 0) {
    throw new ImageFetchError(`Image host "${host}" does not resolve`)
  }
  if (addresses.some(a => isBlockedAddress(a.address))) {
    throw new ImageFetchError(PRIVATE)
  }
  return addresses[0]!
}

/**
 * Download an image over https. Every hop (the URL and each redirect) is checked: https only, and
 * its host must resolve to public addresses only; the request then connects to the checked
 * address, so a DNS answer that changes in between (rebinding) cannot redirect it. At most
 * MAX_REDIRECTS redirects; a common image type; at most MAX_IMAGE_BYTES, checked while reading.
 * Throws ImageFetchError with a message fit for the Agent.
 */
export async function downloadImage(client: ImageClient, rawUrl: string): Promise<Buffer> {
  let url = parseHttpsUrl(rawUrl)
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  for (let hop = 0; ; hop++) {
    const address = await vetHost(client, url.hostname)
    let res: Response
    try {
      res = await client.fetch({ url, address, signal })
    } catch {
      throw new ImageFetchError('Image could not be downloaded')
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      await res.body?.cancel()
      if (!location || hop >= MAX_REDIRECTS) {
        throw new ImageFetchError('Image URL redirects too often or nowhere')
      }
      url = parseHttpsUrl(new URL(location, url).toString())
      continue
    }
    if (!res.ok) {
      await res.body?.cancel()
      throw new ImageFetchError(`Image download failed with HTTP ${res.status}`)
    }
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (!IMAGE_TYPES.has(type)) {
      await res.body?.cancel()
      throw new ImageFetchError(`Not an image (${type || 'no content type'}); use JPEG, PNG, WebP, GIF or AVIF`)
    }
    if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
      await res.body?.cancel()
      throw new ImageFetchError('Image is larger than 10 MB')
    }
    return readCapped(res)
  }
}

/** A DNS lookup that answers every query with the one vetted address. */
export function pinnedLookup(address: ResolvedAddress) {
  return (_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    if (options.all) {
      callback(null, [{ address: address.address, family: address.family }])
    } else {
      callback(null, address.address, address.family)
    }
  }
}

/** One https GET over a fresh connection to the pinned address (TLS name and Host header from the URL). */
function pinnedGet({ url, address, signal }: ImageRequest): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        agent: false,
        lookup: pinnedLookup(address) as unknown as LookupFunction,
        signal,
        headers: { accept: 'image/*', 'user-agent': 'gymtracker-image-fetch' },
      },
      res => {
        const status = res.statusCode ?? 0
        if (status < 200 || status > 599) {
          res.destroy()
          return reject(new Error(`Unexpected HTTP status ${status}`))
        }
        const headers = new Headers()
        for (const [name, value] of Object.entries(res.headers)) {
          if (value !== undefined) {
            headers.set(name, Array.isArray(value) ? value.join(', ') : value)
          }
        }
        const nullBody = [204, 205, 304].includes(status)
        if (nullBody) {
          res.resume()
        }
        resolve(new Response(nullBody ? null : (Readable.toWeb(res) as ReadableStream), { status, headers }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

export const nodeImageClient: ImageClient = {
  resolve: async hostname => await dnsLookup(hostname, { all: true, verbatim: true }),
  fetch: pinnedGet,
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
