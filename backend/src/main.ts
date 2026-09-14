import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * Sessions live in Postgres, not in memory.
   *
   * The default MemoryStore loses every session on restart and leaks under
   * load — it is explicitly not for production. Storing them in the database
   * we already run costs one table and makes sessions revocable, which a
   * stateless JWT would not be.
   */
  const PgStore = connectPgSimple(session);

  app.use(session({
    store: new PgStore({
      conString: config.databaseUrl,
      tableName: 'user_sessions',
      createTableIfMissing: false,   // Prisma owns this table
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,               // unreadable from JavaScript, so XSS cannot steal it
      sameSite: 'lax',              // blocks the cookie on cross-site POSTs — CSRF defence
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  }));

  // credentials: true is required for the browser to send the session cookie.
  /**
   * The web app sends a cookie, so it needs an exact origin and credentials.
   * The extension sends a bearer token and no cookie, so it is allowed in
   * without credentials — a wildcard origin is safe precisely because nothing
   * ambient travels with the request.
   */
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || origin === config.frontendUrl || origin.startsWith('chrome-extension://')) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });
  app.setGlobalPrefix('api');

  await app.listen(config.port);

  console.log(`API on http://localhost:${config.port}/api`);
  console.log(`Google sign-in: ${config.google.configured ? 'configured' : 'NOT configured — set GOOGLE_CLIENT_ID'}`);
}

void bootstrap();
