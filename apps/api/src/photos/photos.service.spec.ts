import { NotFoundException } from '@nestjs/common'
import { describe, it, expect } from 'vitest'

import { PhotosService } from './photos.service'
import { join } from 'path'

const PHOTOS_DIR = '/var/data/gymtracker/photos'

function makeService() {
  const config = { getOrThrow: () => PHOTOS_DIR }
  return new PhotosService({} as never, config as never)
}

describe('PhotosService.getPhotoPath', () => {
  const svc = makeService()
  const id = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'

  it('resolves an uploaded photo file inside the user folder', () => {
    expect(svc.getPhotoPath('default-user', `${id}-orig.webp`)).toBe(
      join(PHOTOS_DIR, 'default-user', `${id}-orig.webp`),
    )
    expect(svc.getPhotoPath('default-user', `${id}-thumb.webp`)).toBe(
      join(PHOTOS_DIR, 'default-user', `${id}-thumb.webp`),
    )
  })

  it.each([
    '../../../../../../etc/hostname',
    '../other-user/x-orig.webp',
    '..',
    '/etc/passwd',
    `sub/${id}-orig.webp`,
    `${id}-orig.webp/../../../.env`,
    'anything.txt',
  ])('rejects %s instead of reading outside the photos folder', filename => {
    expect(() => svc.getPhotoPath('default-user', filename)).toThrow(NotFoundException)
  })
})
