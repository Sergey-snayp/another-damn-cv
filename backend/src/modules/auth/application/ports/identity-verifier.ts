export interface VerifiedIdentity {
  subject: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
}

export interface IdentityVerifier {
  verify(credential: string): Promise<VerifiedIdentity>;
}

export interface SyncTokenGenerator {
  generate(): string;
}
