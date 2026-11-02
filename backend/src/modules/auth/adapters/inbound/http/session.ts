import type { Request } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}
export interface AuthedRequest extends Request {
  userId: string;
}
