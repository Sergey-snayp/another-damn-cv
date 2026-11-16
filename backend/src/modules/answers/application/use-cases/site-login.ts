import { SiteLoginUnreadableError, type SiteLogin } from '../../domain/site-login';
import type { SecretBox, SiteLoginRepository, StoredSiteLogin } from '../ports/site-login';

function opened(stored: StoredSiteLogin, box: SecretBox): SiteLogin {
  let password: string;
  try {
    password = box.open(stored.sealedPassword);
  } catch {
    throw new SiteLoginUnreadableError();
  }
  return { email: stored.email, password, updatedAt: stored.updatedAt.toISOString() };
}

/** The saved login, for the extension to fill an account form; null before the first one. */
export class ReadSiteLogin {
  constructor(
    private readonly logins: SiteLoginRepository,
    private readonly box: SecretBox,
  ) {}
  async execute(userId: string): Promise<SiteLogin | null> {
    const stored = await this.logins.find(userId);
    return stored ? opened(stored, this.box) : null;
  }
}

/** Saves the login: a password the extension made for a new account, or one the person set. */
export class SaveSiteLogin {
  constructor(
    private readonly logins: SiteLoginRepository,
    private readonly box: SecretBox,
  ) {}
  async execute(userId: string, login: { email: string; password: string }): Promise<SiteLogin> {
    const stored = await this.logins.save(userId, {
      email: login.email.trim(),
      sealedPassword: this.box.seal(login.password),
    });
    return opened(stored, this.box);
  }
}
