import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from './shared/config/config';

/** Shared by production startup and HTTP tests, including the real session store. */
export function configureHttp(app: NestExpressApplication, settings = config): () => Promise<void> {
  app.useBodyParser('json', { limit: '2mb' });
  // Behind a hosting proxy (Render) the request reaches us over plain HTTP: trust its
  // forwarded headers so a secure session cookie is still set.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
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
  if (settings.staticDir) serveWebApp(app, settings.staticDir);
  const server = app.getHttpServer();
  server.requestTimeout = 10 * 60_000;
  return () => Promise.resolve(store.close());
}

/**
 * The built web app from this same process and address, so a deployed server
 * needs no second service and no cross-site cookies. Any page that is not a
 * file or an API call gets index.html: the app routes it in the browser.
 */
function serveWebApp(app: NestExpressApplication, dir: string): void {
  app.useStaticAssets(dir, { index: false, maxAge: '1h' });
  const index = join(dir, 'index.html');
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
