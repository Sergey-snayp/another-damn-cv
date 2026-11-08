import { createHash } from 'node:crypto';
import type { EmbedKind, EmbedSessionStore } from '../../application/ports/embed-session-store';
import type { PrismaService } from '../../../../shared/database/prisma.service';

/**
 * Embed tickets and sessions as rows of the session table, so they expire and
 * are pruned with the rest. The row id is a hash of the token, never the token,
 * and the row has no `userId`, so it can never pass as a cookie session.
 */
export class PrismaEmbedSessionStore implements EmbedSessionStore {
  constructor(private readonly prisma: PrismaService) {}

  async save(kind: EmbedKind, token: string, userId: string, expires: Date): Promise<void> {
    await this.prisma.userSession.create({
      data: {
        sid: sid(kind, token),
        sess: {
          embed: kind,
          embedUserId: userId,
          cookie: { expires: expires.toISOString(), originalMaxAge: null },
        },
        expire: expires,
      },
    });
  }

  async take(kind: EmbedKind, token: string): Promise<string | null> {
    const row = await this.prisma.userSession.findUnique({ where: { sid: sid(kind, token) } });
    if (!row) return null;
    // Only the request that removes the row gets the user: a ticket opens one session.
    const { count } = await this.prisma.userSession.deleteMany({ where: { sid: row.sid } });
    return count === 1 ? live(row, kind) : null;
  }

  async find(kind: EmbedKind, token: string): Promise<string | null> {
    const row = await this.prisma.userSession.findUnique({ where: { sid: sid(kind, token) } });
    return row ? live(row, kind) : null;
  }
}

const sid = (kind: EmbedKind, token: string) =>
  `embed-${kind}:${createHash('sha256').update(token).digest('hex')}`;

function live(row: { sess: unknown; expire: Date }, kind: EmbedKind): string | null {
  if (row.expire.getTime() <= Date.now()) return null;
  const sess = row.sess as { embed?: unknown; embedUserId?: unknown } | null;
  return sess?.embed === kind && typeof sess.embedUserId === 'string' ? sess.embedUserId : null;
}
