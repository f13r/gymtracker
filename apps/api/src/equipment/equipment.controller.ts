import { Controller, Get, Post, Delete, Inject, Param, Req, Res, PayloadTooLargeException } from '@nestjs/common'

import { EquipmentService } from './equipment.service'
import { AuthenticatedRequest } from '../auth/request.types'
import { TrainerAccess } from '../auth/trainer-access.decorator'
import type { FastifyReply } from 'fastify'
import { createReadStream } from 'fs'

type FormField = { value: string }

@Controller('equipment')
export class EquipmentController {
  // Explicit token: the class works without emitted decorator metadata (e.g. under vitest).
  constructor(@Inject(EquipmentService) private readonly svc: EquipmentService) {}

  @TrainerAccess('read')
  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.svc.findAll(req.user.id)
  }

  @Post('analyze')
  async analyze(@Req() req: AuthenticatedRequest, @Res() res: FastifyReply) {
    const data = await req.file()
    if (!data) {
      return res.code(400).send({ message: 'No file provided' })
    }

    const buffer = await data.toBuffer()
    if (buffer.byteLength > 15 * 1024 * 1024) {
      throw new PayloadTooLargeException('File exceeds 15 MB limit')
    }

    const fields = data.fields as Record<string, FormField | undefined>
    const equipmentType = fields.equipmentType?.value ?? 'other'
    const description = fields.description?.value ?? ''

    const result = await this.svc.analyze(req.user.id, buffer, data.mimetype, equipmentType, description)
    return res.send(result)
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Res() res: FastifyReply) {
    const data = await req.file()
    if (!data) {
      return res.code(400).send({ message: 'No file provided' })
    }

    const buffer = await data.toBuffer()
    if (buffer.byteLength > 15 * 1024 * 1024) {
      throw new PayloadTooLargeException('File exceeds 15 MB limit')
    }

    const fields = data.fields as Record<string, FormField | undefined>
    const name = fields.name?.value ?? 'Equipment'
    const equipmentType = fields.equipmentType?.value ?? 'other'
    const description = fields.description?.value
    let tags: string[] = []
    let exercises: Array<{ existingId?: string; name: string; category: string; equipmentType: string }> = []
    try {
      if (fields.tags?.value) {
        tags = JSON.parse(fields.tags.value) as string[]
      }
      if (fields.exercises?.value) {
        exercises = JSON.parse(fields.exercises.value) as Array<{
          existingId?: string
          name: string
          category: string
          equipmentType: string
        }>
      }
    } catch {
      return res.code(400).send({ message: 'Invalid tags or exercises payload' })
    }

    const result = await this.svc.create(req.user.id, buffer, name, equipmentType, description, tags, exercises)
    return res.send(result)
  }

  // Equipment is household-shared: any User may delete it or see its photo.
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.delete(id)
  }

  @TrainerAccess('read')
  @Get(':id/photo')
  photo(@Param('id') id: string, @Res() res: FastifyReply) {
    return this.serve(id, res, 'photo')
  }

  @TrainerAccess('read')
  @Get(':id/thumb')
  thumb(@Param('id') id: string, @Res() res: FastifyReply) {
    return this.serve(id, res, 'thumb')
  }

  private async serve(id: string, res: FastifyReply, kind: 'photo' | 'thumb') {
    const filePath = await this.svc.getPhotoFile(id, kind)
    const stream = createReadStream(filePath)
    stream.on('error', () => res.code(404).send({ message: 'Photo not found' }))
    return res.type('image/webp').send(stream)
  }
}
