import type { EmbedSessionStore } from '../../src/modules/auth/application/ports/embed-session-store';

/** Embed tickets and sessions kept in memory, with their expiry. */
export function memoryEmbeds(now: () => number = Date.now): EmbedSessionStore {
  const rows = new Map<string, { userId: string; expires: number }>();
  const live = (key: string) => {
    const row = rows.get(key);
    return row && row.expires > now() ? row.userId : null;
  };
  return {
    save: (kind, token, userId, expires) => {
      rows.set(`${kind}:${token}`, { userId, expires: expires.getTime() });
      return Promise.resolve();
    },
    take: (kind, token) => {
      const userId = live(`${kind}:${token}`);
      rows.delete(`${kind}:${token}`);
      return Promise.resolve(userId);
    },
    find: (kind, token) => Promise.resolve(live(`${kind}:${token}`)),
  };
}
