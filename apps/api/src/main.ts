import multipart from '@fastify/multipart'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { ZodValidationPipe } from 'nestjs-zod'

import { AppModule } from './app.module'
import { FileLogger } from './file-logger'

async function bootstrap() {
  const logger = new FileLogger()
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger })

  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } })
  app.useGlobalPipes(new ZodValidationPipe())
  app.setGlobalPrefix('api')

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000
  // Loopback by default: in prod the only way in is Cloudflare → host nginx (127.0.0.1:8095) → here.
  // Set HOST=0.0.0.0 only for a deliberate LAN dev setup.
  const host = process.env.HOST || '127.0.0.1'
  await app.listen(port, host)
  logger.log(`API running on http://${host}:${port}`, 'Bootstrap')
}

bootstrap()
