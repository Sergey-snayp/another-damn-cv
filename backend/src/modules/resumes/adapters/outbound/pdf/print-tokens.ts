import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PrintTokens } from '../../../application/ports/resume-pdf';

/**
 * "userId.expires.signature": an HMAC of the user, the CV and the expiry with
 * the session secret. Valid for two minutes, for one CV only.
 */
export class HmacPrintTokens implements PrintTokens {
  constructor(
    private readonly secret: string,
    private readonly now: () => number = () => Date.now(),
    private readonly lifetimeMs = 120_000,
  ) {}

  sign(userId: string, resumeId: string): string {
    const expires = this.now() + this.lifetimeMs;
    return `${userId}.${expires}.${this.signature(userId, resumeId, expires)}`;
  }

  verify(token: string, resumeId: string): string | null {
    const [userId, expiresText, signature] = String(token).split('.');
    const expires = Number(expiresText);
    if (!userId || !signature || !Number.isFinite(expires) || expires < this.now()) return null;
    const expected = Buffer.from(this.signature(userId, resumeId, expires));
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
  }

  private signature(userId: string, resumeId: string, expires: number): string {
    return createHmac('sha256', this.secret)
      .update(`print:${userId}:${resumeId}:${expires}`)
      .digest('base64url');
  }
}
