/**
 * Where embedded Quick tailoring keeps its sign-ins: one-time tickets and the
 * short sessions they open. Only hashes of the tokens are stored.
 */
export type EmbedKind = 'ticket' | 'session';

export interface EmbedSessionStore {
  save(kind: EmbedKind, token: string, userId: string, expires: Date): Promise<void>;
  /** The user of an unexpired entry, removing it in the same step: a ticket opens one session. */
  take(kind: EmbedKind, token: string): Promise<string | null>;
  /** The user of an unexpired entry, which stays. */
  find(kind: EmbedKind, token: string): Promise<string | null>;
}
