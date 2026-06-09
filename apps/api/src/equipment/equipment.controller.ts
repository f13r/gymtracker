import { Controller, Get, Post, Delete, Param, Req, Res, PayloadTooLargeException } from '@nestjs/common'

import { EquipmentService } from './equipment.service'
import { AuthenticatedRequest } from '../auth/request.types'
import type { FastifyReply } from 'fastify'
import { createReadStream } from 'fs'
import { join, basename } from 'path'

type FormField = { value: string }

@Controller('equipment')
export class EquipmentController {
  constructor(private readonly svc: EquipmentService) {}

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
      if (fields.tags?.value) { tags = JSON.parse(fields.tags.value) as string[] }
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

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.delete(id, req.user.id)
  }

  @Get('photo/:filename')
  servePhoto(@Param('filename') filename: string, @Req() req: AuthenticatedRequest, @Res() res: FastifyReply) {
    const safe = basename(filename)
    if (safe !== filename || filename.includes('..')) {
      return res.code(400).send({ message: 'Invalid filename' })
    }
    const filePath = join(this.svc.getPhotosDir(), req.user.id, 'equipment', safe)
    const stream = createReadStream(filePath)
    stream.on('error', () => res.code(404).send({ message: 'Photo not found' }))
    return res.type('image/webp').send(stream)
  }
}
