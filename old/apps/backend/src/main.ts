import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // The frontend and the extension are both browser clients on other origins.
  app.enableCors({ origin: true });
  app.setGlobalPrefix('api');

  await app.listen(config.port);

  console.log(`API on http://localhost:${config.port}/api`);
  console.log(`Fact base: ${config.factBasePath}`);
}

void bootstrap();
