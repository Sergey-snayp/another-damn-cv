import { UnauthorizedException } from '@nestjs/common';

export function syncToken(authorization?: string): string {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new UnauthorizedException('Missing sync token.');
  return token;
}
