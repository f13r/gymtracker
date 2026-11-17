import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PgDialect } from 'drizzle-orm/pg-core'
import sharp from 'sharp'
import { describe, it, expect, beforeEach } from 'vitest'

import { PhotosService } from './photos.service'
import type { SQL } from 'drizzle-orm'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const ALICE_PHOTO = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'

type Row = {
  id: string
  userId: string | null
  recordedAt: number
  filePath: string
  thumbPath: string
  bodyWeight: number | null
  tags: string | null
  notes: string | null
}

// In-memory stand-in for the progress_photos table. A row matches a WHERE clause when every bound
// parameter equals one of its values, i.e. the clause is treated as a conjunction of `col = ?`.
// A query that filters on id only (no user_id) therefore cannot match a row owned by someone else.
function fakeDb(rows: Row[]) {
  const dialect = new PgDialect()
  const matching = (cond: SQL | undefined) => {
    if (!cond) {
      return rows
    }
    const { params } = dialect.sqlToQuery(cond)
    return rows.filter(r => params.every(p => Object.values(r).includes(p as never)))
  }
  return {
    select: () => ({
      from: () => ({
        where: (cond: SQL) => {
          const result = matching(cond)
          return {
            limit: (n: number) => Promise.resolve(result.slice(0, n)),
            orderBy: () => Promise.resolve(result),
          }
        },
      }),
    }),
    insert: () => ({
      values: (row: Row) => ({
        returning: () => {
          rows.push(row)
          return Promise.resolve([row])
        },
      }),
    }),
  }
}

function makeService(rows: Row[]) {
  const photosDir = mkdtempSync(join(tmpdir(), 'photos-'))
  for (const r of rows.filter(r => !`${r.filePath}${r.thumbPath}`.includes('..'))) {
    mkdirSync(join(photosDir, r.userId!), { recursive: true })
    writeFileSync(join(photosDir, r.filePath), 'orig')
    writeFileSync(join(photosDir, r.thumbPath), 'thumb')
  }
  const config = { getOrThrow: () => photosDir }
  return { svc: new PhotosService(fakeDb(rows) as never, config as never), photosDir }
}

const alicePhoto: Row = {
  id: ALICE_PHOTO,
  userId: 'alice',
  recordedAt: 1_700_000_000,
  filePath: `alice/${ALICE_PHOTO}-orig.webp`,
  thumbPath: `alice/${ALICE_PHOTO}-thumb.webp`,
  bodyWeight: 80,
  tags: null,
  notes: null,
}

describe('PhotosService.getPhotoFile', () => {
  let svc: PhotosService
  let photosDir: string

  beforeEach(() => {
    ;({ svc, photosDir } = makeService([alicePhoto]))
  })

  it('resolves the owner’s original and thumbnail by photo id', async () => {
    expect(await svc.getPhotoFile(ALICE_PHOTO, 'alice', 'file')).toBe(join(photosDir, `alice/${ALICE_PHOTO}-orig.webp`))
    expect(await svc.getPhotoFile(ALICE_PHOTO, 'alice', 'thumb')).toBe(
      join(photosDir, `alice/${ALICE_PHOTO}-thumb.webp`),
    )
  })

  it('returns 404 when another user asks for the photo', async () => {
    await expect(svc.getPhotoFile(ALICE_PHOTO, 'bob', 'file')).rejects.toThrow(NotFoundException)
    await expect(svc.getPhotoFile(ALICE_PHOTO, 'bob', 'thumb')).rejects.toThrow(NotFoundException)
  })

  it('returns 404 for an unknown or path-like id', async () => {
    await expect(svc.getPhotoFile('../../../../etc/hostname', 'alice', 'file')).rejects.toThrow(NotFoundException)
  })

  it('refuses a stored path that resolves outside the photos folder', async () => {
    const escaping: Row = { ...alicePhoto, filePath: '../../../../etc/hostname', thumbPath: 'alice/../../x.webp' }
    const { svc: tampered } = makeService([escaping])
    await expect(tampered.getPhotoFile(ALICE_PHOTO, 'alice', 'file')).rejects.toThrow(NotFoundException)
    await expect(tampered.getPhotoFile(ALICE_PHOTO, 'alice', 'thumb')).rejects.toThrow(NotFoundException)
  })
})

describe('PhotosService.getPhotos', () => {
  it('lists the user’s photos by id without exposing on-disk paths', async () => {
    const { svc } = makeService([alicePhoto])
    expect(await svc.getPhotos('alice')).toEqual([
      { id: ALICE_PHOTO, userId: 'alice', recordedAt: 1_700_000_000, bodyWeight: 80, tags: null, notes: null },
    ])
  })
})

describe('PhotosService.uploadPhoto', () => {
  it('stores the photo under the user’s folder and serves it back by id to that user only', async () => {
    const { svc, photosDir } = makeService([])
    const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } })
      .png()
      .toBuffer()

    const photo = await svc.uploadPhoto('default-user', image, 72.5)

    expect(photo).not.toHaveProperty('filePath')
    expect(photo).not.toHaveProperty('thumbPath')
    expect(photo).toMatchObject({ userId: 'default-user', bodyWeight: 72.5 })
    const thumb = await svc.getPhotoFile(photo.id, 'default-user', 'thumb')
    expect(thumb).toBe(join(photosDir, 'default-user', `${photo.id}-thumb.webp`))
    expect(existsSync(thumb)).toBe(true)
    await expect(svc.getPhotoFile(photo.id, 'someone-else', 'thumb')).rejects.toThrow(NotFoundException)
  })

  it.each(['..', '.', '../alice', 'a/b', 'a\\b', '', '_defaults/../..'])(
    'refuses user id %j as a folder name without writing anything',
    async userId => {
      const { svc, photosDir } = makeService([])
      await expect(svc.uploadPhoto(userId, Buffer.from('not an image'))).rejects.toThrow(BadRequestException)
      expect(readdirSync(photosDir)).toEqual([])
    },
  )
})
