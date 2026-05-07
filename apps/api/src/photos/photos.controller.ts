import { Controller, Get, Post, Param, Req, Res, PayloadTooLargeException } from '@nestjs/common';
import { createReadStream } from 'fs';
import { PhotosService } from './photos.service';

@Controller('photos')
export class PhotosController {
  constructor(private readonly svc: PhotosService) {}

  @Get() getPhotos(@Req() req: any) { return this.svc.getPhotos(req.user.id); }

  @Post()
  async upload(@Req() req: any, @Res() res: any) {
    const data = await req.file();
    if (!data) return res.code(400).send({ message: 'No file provided' });

    const buffer = await data.toBuffer();
    if (buffer.byteLength > 15 * 1024 * 1024) {
      throw new PayloadTooLargeException('File exceeds 15 MB limit');
    }

    const fields = data.fields as Record<string, any>;
    const bodyWeight = fields.bodyWeight?.value ? parseFloat(fields.bodyWeight.value) : undefined;
    const tags = fields.tags?.value ? JSON.parse(fields.tags.value) : undefined;
    const notes = fields.notes?.value ?? undefined;

    const photo = await this.svc.uploadPhoto(req.user.id, buffer, bodyWeight, tags, notes);
    return res.send(photo);
  }

  @Get('file/:filename')
  serveFile(@Param('filename') filename: string, @Req() req: any, @Res() res: any) {
    const filePath = this.svc.getPhotoPath(req.user.id, filename);
    const stream = createReadStream(filePath);
    return res.type('image/webp').send(stream);
  }
}
