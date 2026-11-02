import { randomBytes } from 'node:crypto';
import type { SyncTokenGenerator } from '../../application/ports/identity-verifier';

export class RandomSyncTokenGenerator implements SyncTokenGenerator {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }
}
