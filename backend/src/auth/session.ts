import type { Request } from 'express';

/** What we keep in the session cookie's server-side record. */
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export interface AuthedRequest extends Request {
  userId: string;
}
