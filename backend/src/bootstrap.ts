import type { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from './shared/config/config';

/** Shared by production startup and HTTP tests, including the real session store. */
export function configureHttp(app: NestExpressApplication, settings = config): () => Promise<void> {
  app.useBodyParser('json', { limit: '2mb' });
  const PgStore = connectPgSimple(session);
  const store = new PgStore({
    conString: settings.databaseUrl,
    tableName: 'user_sessions',
    createTableIfMissing: false,
  });
  app.use(
    session({
      store,
      secret: settings.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 30,
      },
    }),
  );
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      callback(null, !origin || origin === settings.frontendUrl || origin.startsWith('chrome-extension://'));
    },
    credentials: true,
  });
  app.setGlobalPrefix('api');
  const server = app.getHttpServer();
  server.requestTimeout = 10 * 60_000;
  return () => Promise.resolve(store.close());
}
