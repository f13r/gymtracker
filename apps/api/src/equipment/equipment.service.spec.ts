import { ConflictException, NotFoundException } from '@nestjs/common'
import sharp from 'sharp'
import { describe, it, expect, beforeEach } from 'vitest'

import { EquipmentService } from './equipment.service'
import * as schema from '../drizzle/schema'
import { GymService, HOUSEHOLD_GYM_ID } from '../gym/gym.service'
import { createFakeDb, type FakeDb } from '../testing/fake-db'
import { existsSync, mkdtempSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// The Gym and its Equipment are shared by the whole household. Two Users, u1 and u2.
describe('EquipmentService for a household-shared Gym', () => {
  let db: FakeDb
  let photosDir: string
  let svc: EquipmentService
  let photo: Buffer

  const addAs = (userId: string, name = 'Left Cable Tower') =>
    svc.create(userId, photo, name, 'cable', undefined, [], [])

  beforeEach(async () => {
    db = createFakeDb()
    photosDir = mkdtempSync(join(tmpdir(), 'equipment-svc-'))
    const config = { getOrThrow: () => photosDir }
    svc = new EquipmentService(db as any, config as any, new GymService(db as any), {} as any)
    photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } })
      .png()
      .toBuffer()
  })

  it('shows u2 the Equipment u1 added', async () => {
    const added = await addAs('u1')

    const seen = await svc.findAll('u2')

    expect(seen.map(e => e.id)).toEqual([added.id])
  })

  it('lets u2 delete the Equipment u1 added, photo files included', async () => {
    const added = await addAs('u1')
    const files = [await svc.getPhotoFile(added.id, 'photo'), await svc.getPhotoFile(added.id, 'thumb')]

    await svc.delete(added.id)

    expect(await svc.findAll('u1')).toEqual([])
    expect(files.map(f => existsSync(f))).toEqual([false, false])
  })

  it('puts all Equipment in the one household Gym', async () => {
    const a = await addAs('u1', 'Bench')
    const b = await addAs('u2', 'Rack')

    expect([a.gymId, b.gymId]).toEqual([HOUSEHOLD_GYM_ID, HOUSEHOLD_GYM_ID])
    expect(db.rows(schema.gyms).map(g => g.id)).toEqual([HOUSEHOLD_GYM_ID])
  })

  it('stores Equipment photos in the shared equipment folder, not under a User', async () => {
    const added = await addAs('u1')

    expect(await svc.getPhotoFile(added.id, 'photo')).toBe(join(photosDir, 'equipment', `${added.id}-orig.webp`))
    expect(await svc.getPhotoFile(added.id, 'thumb')).toBe(join(photosDir, 'equipment', `${added.id}-thumb.webp`))
    expect(existsSync(join(photosDir, 'equipment', `${added.id}-thumb.webp`))).toBe(true)
  })

  it('does not expose disk paths', async () => {
    const added = await addAs('u1')

    expect(added).not.toHaveProperty('photoPath')
    expect(added).not.toHaveProperty('thumbPath')
  })

  it('returns 404 for a photo of unknown Equipment', async () => {
    await expect(svc.getPhotoFile('nope', 'photo')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuses a stored photo path that leads outside the photos folder', async () => {
    db.seed(schema.equipment, {
      id: 'evil',
      gymId: HOUSEHOLD_GYM_ID,
      name: 'Evil',
      photoPath: '../../etc/hostname',
      thumbPath: '../../etc/hostname',
      createdAt: 1,
    })

    await expect(svc.getPhotoFile('evil', 'photo')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('answers 409 and removes the uploaded photos when renaming an Exercise clashes with another name', async () => {
    db.update = () => {
      throw Object.assign(new Error('duplicate key'), { code: '23505' })
    }
    const ex = { existingId: 'e1', name: 'Squat', category: 'legs', equipmentType: 'barbell' }

    await expect(svc.create('u1', photo, 'Rack', 'other', undefined, [], [ex])).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(readdirSync(join(photosDir, 'equipment'))).toEqual([])
  })

  it('returns 404 when deleting unknown Equipment', async () => {
    await expect(svc.delete('nope')).rejects.toBeInstanceOf(NotFoundException)
  })
})
