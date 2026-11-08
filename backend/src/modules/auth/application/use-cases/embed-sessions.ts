import type { SyncTokenGenerator } from '../ports/identity-verifier';
import type { EmbedSessionStore } from '../ports/embed-session-store';
import { AuthenticationError } from '../errors';

/** A ticket is used at once: the extension asks for it right before opening Quick tailoring. */
export const EMBED_TICKET_MS = 60_000;
/** Long enough for a tailoring session; opening it again from the extension starts a new one. */
export const EMBED_SESSION_MS = 8 * 60 * 60_000;

/**
 * Quick tailoring inside a job site's page.
 *
 * There the app is a third-party frame: the browser does not send its session
 * cookie, and loosening that cookie would let any site frame a signed-in app.
 * Instead the extension, which holds the user's sync token, asks for a one-time
 * ticket and hands it to the frame; the frame trades it for a short session
 * token it sends with each request. A frame without a ticket gets nothing.
 */
export class EmbedSessions {
  constructor(
    private readonly store: EmbedSessionStore,
    private readonly generator: SyncTokenGenerator,
    private readonly now: () => number = Date.now,
  ) {}

  async issueTicket(userId: string): Promise<string> {
    const ticket = this.generator.generate();
    await this.store.save('ticket', ticket, userId, new Date(this.now() + EMBED_TICKET_MS));
    return ticket;
  }

  async open(ticket: string): Promise<string> {
    const userId = await this.store.take('ticket', ticket);
    if (!userId)
      throw new AuthenticationError('This Quick tailoring link has expired. Open it again from CV Autofill.');
    const token = this.generator.generate();
    await this.store.save('session', token, userId, new Date(this.now() + EMBED_SESSION_MS));
    return token;
  }

  async resolve(token: string): Promise<string> {
    const userId = await this.store.find('session', token);
    if (!userId)
      throw new AuthenticationError('Quick tailoring was signed out. Open it again from CV Autofill.');
    return userId;
  }
}
