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
  await app.listen(port, '0.0.0.0')
  logger.log(`API running on http://localhost:${port}`, 'Bootstrap')
}

bootstrap()
