import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import multipart from '@fastify/multipart';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });
  app.useGlobalPipes(new ZodValidationPipe());
  app.setGlobalPrefix('api');

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`API running on http://localhost:${port}`);
}

bootstrap();
