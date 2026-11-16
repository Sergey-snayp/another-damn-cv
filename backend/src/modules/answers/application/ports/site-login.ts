/** The login's row: the password only ever sealed. */
export interface StoredSiteLogin {
  email: string;
  sealedPassword: string;
  updatedAt: Date;
}

export interface SiteLoginRepository {
  find(userId: string): Promise<StoredSiteLogin | null>;
  save(userId: string, login: { email: string; sealedPassword: string }): Promise<StoredSiteLogin>;
}

/** Seals a secret for storage and opens it again; a tampered or foreign seal does not open. */
export interface SecretBox {
  seal(text: string): string;
  open(sealed: string): string;
}
