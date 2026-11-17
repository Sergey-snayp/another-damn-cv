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

/**
 * The login to fill an account form with: the site's own when it has one (a
 * password changed on that company's site), else the one saved login; null
 * before the first.
 */
export class ReadSiteLogin {
  constructor(
    private readonly logins: SiteLoginRepository,
    private readonly box: SecretBox,
  ) {}
  async execute(userId: string, host?: string): Promise<SiteLogin | null> {
    const own = host ? await this.logins.findForSite(userId, host.trim().toLowerCase()) : null;
    if (own) return { ...opened(own, this.box), site: host!.trim().toLowerCase() };
    const stored = await this.logins.find(userId);
    return stored ? opened(stored, this.box) : null;
  }
}

/** Gives one site its own login: a password changed there and nowhere else. The site is recorded too. */
export class SaveSiteOwnLogin {
  constructor(
    private readonly logins: SiteLoginRepository,
    private readonly box: SecretBox,
  ) {}
  async execute(userId: string, host: string, login: { email: string; password: string }): Promise<SiteLogin> {
    const site = host.trim().toLowerCase();
    const stored = await this.logins.saveForSite(userId, site, { email: login.email.trim(), sealedPassword: this.box.seal(login.password) });
    return { ...opened(stored!, this.box), site };
  }
}

/** The site goes back to the one saved login. */
export class ForgetSiteOwnLogin {
  constructor(private readonly logins: SiteLoginRepository) {}
  async execute(userId: string, host: string): Promise<string[]> {
    await this.logins.saveForSite(userId, host.trim().toLowerCase(), null);
    return this.logins.sitesWithOwnLogin(userId);
  }
}

/** The sites with a login of their own, for Settings. */
export class ListSitesWithOwnLogin {
  constructor(private readonly logins: SiteLoginRepository) {}
  execute(userId: string): Promise<string[]> {
    return this.logins.sitesWithOwnLogin(userId);
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
