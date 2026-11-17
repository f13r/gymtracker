import { NotFoundException } from '@nestjs/common'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { EquipmentController } from './equipment.controller'
import { EquipmentService } from './equipment.service'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const EQUIPMENT_ID = '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f'
const dir = mkdtempSync(join(tmpdir(), 'equipment-http-'))
const files = { photo: join(dir, 'orig.webp'), thumb: join(dir, 'thumb.webp') }
writeFileSync(files.photo, 'ORIG')
writeFileSync(files.thumb, 'THUMB')

// Stand-in for EquipmentService: EQUIPMENT_ID exists (added by someone else); anything else is a 404.
const lookups: string[] = []
const deleted: string[] = []
const fakeService = {
  getPhotoFile: (id: string, kind: 'photo' | 'thumb') => {
    lookups.push(id)
    return id === EQUIPMENT_ID ? Promise.resolve(files[kind]) : Promise.reject(new NotFoundException('Photo not found'))
  },
  delete: (id: string) => {
    deleted.push(id)
    return Promise.resolve()
  },
}

describe('Equipment HTTP routes', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EquipmentController],
      providers: [{ provide: EquipmentService, useValue: fakeService }],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.setGlobalPrefix('api')
    // Every request is u2; the Equipment was added by u1.
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (req, _reply, done) => {
        ;(req as unknown as { user: { id: string } }).user = { id: 'u2' }
        done()
      })
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('serves the photo and the thumbnail by Equipment id to any User', async () => {
    const photo = await app.inject({ method: 'GET', url: `/api/equipment/${EQUIPMENT_ID}/photo` })
    expect(photo.statusCode).toBe(200)
    expect(photo.headers['content-type']).toBe('image/webp')
    expect(photo.body).toBe('ORIG')

    const thumb = await app.inject({ method: 'GET', url: `/api/equipment/${EQUIPMENT_ID}/thumb` })
    expect(thumb.statusCode).toBe(200)
    expect(thumb.body).toBe('THUMB')
  })

  it('returns 404 for unknown Equipment', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/equipment/unknown/thumb' })
    expect(res.statusCode).toBe(404)
  })

  it('no longer has a filename route, so a traversal path reaches no file handler', async () => {
    lookups.length = 0
    const traversal = '..%2F..%2F..%2F..%2F..%2F..%2Fetc%2Fhostname'

    const old = await app.inject({ method: 'GET', url: `/api/equipment/photo/${traversal}` })
    expect(old.statusCode).toBe(404)
    expect(old.body).not.toContain('home')

    const asId = await app.inject({ method: 'GET', url: `/api/equipment/${traversal}/photo` })
    expect(asId.statusCode).toBe(404)
    expect(lookups).toEqual(['../../../../../../etc/hostname'])
  })

  it('lets any User delete Equipment', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/equipment/${EQUIPMENT_ID}` })
    expect(res.statusCode).toBe(200)
    expect(deleted).toEqual([EQUIPMENT_ID])
  })
})
