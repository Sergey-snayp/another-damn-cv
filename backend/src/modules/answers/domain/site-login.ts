/**
 * The one login the extension creates and signs in to job-site accounts with
 * (Workday's "Create Account"), as Simplify keeps one for every site. It lives
 * on the server, so a new computer or a cleared browser keeps it; the password
 * is stored encrypted and only the signed-in extension can read it.
 */
export interface SiteLogin {
  email: string;
  password: string;
  updatedAt: string;
  /** Set when this is one site's own login, not the one saved login. */
  site?: string;
}

export class SiteLoginUnreadableError extends Error {
  constructor() {
    super('Your saved job-site password could not be read. Set it again in Settings.');
  }
}
