export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/** Public operations. Credential storage belongs to auth, not profiles. */
export interface AuthApi {
  signInWithGoogle(credential: string): Promise<PublicUser>;
  findById(userId: string): Promise<PublicUser | null>;
  issueSyncToken(userId: string): Promise<string>;
  currentSyncToken(userId: string): Promise<string | null>;
  resolveSyncToken(token: string): Promise<string>;
  /** Quick tailoring inside a job page: a one-time ticket, traded for a short session token. */
  issueEmbedTicket(userId: string): Promise<string>;
  openEmbedSession(ticket: string): Promise<string>;
  resolveEmbedToken(token: string): Promise<string>;
}
