import { Controller, Get, Post, Delete, Inject, Param, Req, Res, PayloadTooLargeException } from '@nestjs/common'

import { PhotosService } from './photos.service'
import { AuthenticatedRequest } from '../auth/request.types'
import type { FastifyReply } from 'fastify'
import { createReadStream } from 'fs'

type FormField = { value: string }

@Controller('photos')
export class PhotosController {
  // Explicit token: the class works without emitted decorator metadata (e.g. under vitest).
  constructor(@Inject(PhotosService) private readonly svc: PhotosService) {}

  @Get() getPhotos(@Req() req: AuthenticatedRequest) {
    return this.svc.getPhotos(req.user.id)
  }

  @Post()
  async upload(@Req() req: AuthenticatedRequest, @Res() res: FastifyReply) {
    const data = await req.file()
    if (!data) {
      return res.code(400).send({ message: 'No file provided' })
    }

    const buffer = await data.toBuffer()
    if (buffer.byteLength > 15 * 1024 * 1024) {
      throw new PayloadTooLargeException('File exceeds 15 MB limit')
    }

    const fields = data.fields as Record<string, FormField | undefined>
    const bodyWeight = fields.bodyWeight?.value ? parseFloat(fields.bodyWeight.value) : undefined
    const rawTags = fields.tags?.value
    const tags = rawTags ? (JSON.parse(rawTags) as string[]) : undefined
    const notes = fields.notes?.value ?? undefined

    const photo = await this.svc.uploadPhoto(req.user.id, buffer, bodyWeight, tags, notes)
    return res.send(photo)
  }

  @Delete(':id') deletePhoto(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.deletePhoto(id, req.user.id)
  }

  @Get(':id/file') file(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res() res: FastifyReply) {
    return this.serve(id, req, res, 'file')
  }

  @Get(':id/thumb') thumb(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res() res: FastifyReply) {
    return this.serve(id, req, res, 'thumb')
  }

  private async serve(id: string, req: AuthenticatedRequest, res: FastifyReply, kind: 'file' | 'thumb') {
    const filePath = await this.svc.getPhotoFile(id, req.user.id, kind)
    return res.type('image/webp').send(createReadStream(filePath))
  }
}
