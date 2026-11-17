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

/** The job sites the person has an account on, so their account page offers Sign In first. */
export class ListSiteAccounts {
  constructor(private readonly logins: SiteLoginRepository) {}
  execute(userId: string): Promise<string[]> {
    return this.logins.sites(userId);
  }
}

/** A sign-in or a new account that worked on a site: that site is one the person has an account on. */
export class RememberSiteAccount {
  constructor(private readonly logins: SiteLoginRepository) {}
  async execute(userId: string, host: string): Promise<string[]> {
    await this.logins.addSite(userId, host.trim().toLowerCase());
    return this.logins.sites(userId);
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
