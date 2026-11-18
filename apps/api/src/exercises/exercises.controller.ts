import { Controller, Get, Post, Patch, Delete, Param, Query, Req, Res, PayloadTooLargeException } from '@nestjs/common'

import { CreateExerciseSchema, UpdateExerciseSchema } from '@gymtracker/shared'

import { ExercisesService } from './exercises.service'
import { AuthenticatedRequest } from '../auth/request.types'
import { TrainerAccess } from '../auth/trainer-access.decorator'
import type { FastifyReply } from 'fastify'
import { createReadStream } from 'fs'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024

// Collect a multipart request into plain fields + an optional image buffer. Works whether or not a
// file part is present, so an exercise can be created/edited with no photo.
async function readMultipart(
  req: AuthenticatedRequest,
): Promise<{ fields: Record<string, string>; image: Buffer | undefined }> {
  const fields: Record<string, string> = {}
  let image: Buffer | undefined
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      const buf = await part.toBuffer()
      if (buf.byteLength > MAX_IMAGE_BYTES) {
        throw new PayloadTooLargeException('Image exceeds 15 MB limit')
      }
      if (buf.byteLength > 0) {
        image = buf
      }
    } else {
      fields[part.fieldname] = String(part.value)
    }
  }
  return { fields, image }
}

@Controller('exercises')
export class ExercisesController {
  constructor(private readonly svc: ExercisesService) {}

  // `?archived=true` lists only Archived Exercises; otherwise the live library.
  @TrainerAccess('read')
  @Get()
  findAll(@Req() req: AuthenticatedRequest, @Query('archived') archived?: string) {
    return this.svc.findAll(req.user.id, { archived: archived === 'true' })
  }
  @TrainerAccess('read')
  @Get(':id/last-sets')
  getLastSets(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.getLastSets(id, req.user.id)
  }
  @TrainerAccess('read')
  @Get(':id/image')
  image(@Param('id') id: string, @Res() res: FastifyReply) {
    return this.serve(id, res, 'image')
  }
  @TrainerAccess('read')
  @Get(':id/thumb')
  thumb(@Param('id') id: string, @Res() res: FastifyReply) {
    return this.serve(id, res, 'thumb')
  }
  @TrainerAccess('read')
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.findOne(id, req.user.id)
  }

  @TrainerAccess('write')
  @Post()
  async create(@Req() req: AuthenticatedRequest, @Res() res: FastifyReply) {
    const { fields, image } = await readMultipart(req)
    const dto = CreateExerciseSchema.parse(fields)
    return res.send(await this.svc.create(req.user.id, dto, image))
  }

  @TrainerAccess('write')
  @Patch(':id')
  async update(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res() res: FastifyReply) {
    const { fields, image } = await readMultipart(req)
    const { removeImage, ...rest } = fields
    const dto = UpdateExerciseSchema.parse(rest)
    return res.send(await this.svc.update(id, req.user.id, dto, { image, removeImage: removeImage === 'true' }))
  }

  @TrainerAccess('write')
  @Post(':id/restore')
  restore(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.restore(id, req.user.id)
  }

  // Responds `{ archived: true }` when the Exercise is still used somewhere, `{ archived: false }` when deleted.
  @TrainerAccess('write')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }

  private async serve(id: string, res: FastifyReply, kind: 'image' | 'thumb') {
    const filePath = await this.svc.getImageFile(id, kind)
    return res.type('image/webp').send(createReadStream(filePath))
  }
}
