import { NotFoundException } from '@nestjs/common'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { PhotosController } from './photos.controller'
import { PhotosService } from './photos.service'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const PHOTO_ID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'
const dir = mkdtempSync(join(tmpdir(), 'photos-http-'))
const files = { file: join(dir, 'orig.webp'), thumb: join(dir, 'thumb.webp') }
writeFileSync(files.file, 'ORIG')
writeFileSync(files.thumb, 'THUMB')

// Stand-in for PhotosService: only `default-user` owns PHOTO_ID; anything else is a 404.
const lookups: string[] = []
const fakeService = {
  getPhotoFile: (id: string, userId: string, kind: 'file' | 'thumb') => {
    lookups.push(id)
    if (id !== PHOTO_ID || userId !== 'default-user') {
      return Promise.reject(new NotFoundException('Photo not found'))
    }
    return Promise.resolve(files[kind])
  },
}

describe('Photos HTTP routes', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PhotosController],
      providers: [{ provide: PhotosService, useValue: fakeService }],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.setGlobalPrefix('api')
    // Stand in for the auth guard: every request is `default-user`.
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (req, _reply, done) => {
        ;(req as unknown as { user: { id: string } }).user = { id: 'default-user' }
        done()
      })
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('serves the original and the thumbnail by photo id', async () => {
    const orig = await app.inject({ method: 'GET', url: `/api/photos/${PHOTO_ID}/file` })
    expect(orig.statusCode).toBe(200)
    expect(orig.headers['content-type']).toBe('image/webp')
    expect(orig.body).toBe('ORIG')

    const thumb = await app.inject({ method: 'GET', url: `/api/photos/${PHOTO_ID}/thumb` })
    expect(thumb.statusCode).toBe(200)
    expect(thumb.body).toBe('THUMB')
  })

  it('returns 404 for a photo id the user does not own', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/photos/someone-elses-photo/file' })
    expect(res.statusCode).toBe(404)
  })

  it('no longer has a filename route, so a traversal path reaches no file handler', async () => {
    lookups.length = 0
    const traversal = '..%2F..%2F..%2F..%2F..%2F..%2Fetc%2Fhostname'

    const old = await app.inject({ method: 'GET', url: `/api/photos/file/${traversal}` })
    expect(old.statusCode).toBe(404)
    expect(old.body).not.toContain('home')

    // As an id, the decoded traversal string is only ever a database key.
    const asId = await app.inject({ method: 'GET', url: `/api/photos/${traversal}/file` })
    expect(asId.statusCode).toBe(404)
    expect(lookups).toEqual(['../../../../../../etc/hostname'])
  })
})
