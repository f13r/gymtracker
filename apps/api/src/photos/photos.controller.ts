import { Controller, Get, Post, Delete, Param, Req, Res, PayloadTooLargeException } from '@nestjs/common'

import { PhotosService } from './photos.service'
import { AuthenticatedRequest } from '../auth/request.types'
import type { FastifyReply } from 'fastify'
import { createReadStream } from 'fs'

type FormField = { value: string }

@Controller('photos')
export class PhotosController {
  constructor(private readonly svc: PhotosService) {}

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

  @Get('file/:filename')
  serveFile(@Param('filename') filename: string, @Req() req: AuthenticatedRequest, @Res() res: FastifyReply) {
    const filePath = this.svc.getPhotoPath(req.user.id, filename)
    const stream = createReadStream(filePath)
    return res.type('image/webp').send(stream)
  }
}
