import { createHash } from 'node:crypto';
import type { PracticeFingerprint } from '../../../application/ports/practice';
export class Sha256PracticeFingerprint implements PracticeFingerprint {
  hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
