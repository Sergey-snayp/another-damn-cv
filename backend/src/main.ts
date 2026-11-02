import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureHttp } from './bootstrap';
import { config } from './shared/config/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureHttp(app);
  await app.listen(config.port);
  const logger = new Logger('Bootstrap');
  logger.log(`API on http://localhost:${config.port}/api`);
  logger.log(
    `Google sign-in: ${config.google.configured ? 'configured' : 'NOT configured — set GOOGLE_CLIENT_ID'}`,
  );
}

void bootstrap();
