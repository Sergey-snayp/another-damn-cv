/** The login's row: the password only ever sealed. */
export interface StoredSiteLogin {
  email: string;
  sealedPassword: string;
  updatedAt: Date;
}

export interface SiteLoginRepository {
  find(userId: string): Promise<StoredSiteLogin | null>;
  save(userId: string, login: { email: string; sealedPassword: string }): Promise<StoredSiteLogin>;
  /** The job sites (hosts) the person has an account on, oldest first. */
  sites(userId: string): Promise<string[]>;
  addSite(userId: string, host: string): Promise<void>;
}

/** Seals a secret for storage and opens it again; a tampered or foreign seal does not open. */
export interface SecretBox {
  seal(text: string): string;
  open(sealed: string): string;
}
