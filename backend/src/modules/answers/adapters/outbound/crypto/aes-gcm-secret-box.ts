import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { SecretBox } from '../../../application/ports/site-login';

/**
 * AES-256-GCM with a key derived from the server's secret for one purpose, so
 * the same secret signs sessions and seals passwords without sharing a key.
 * Each seal has its own random nonce; GCM's tag refuses a changed seal.
 * Sealed form: "v1." + base64(nonce 12 | tag 16 | ciphertext).
 */
export class AesGcmSecretBox implements SecretBox {
  private readonly key: Buffer;

  constructor(secret: string, purpose: string) {
    if (!secret) throw new Error('A secret is needed to seal passwords.');
    this.key = Buffer.from(hkdfSync('sha256', secret, 'another-damn-cv', purpose, 32));
  }

  seal(text: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return `v1.${Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64')}`;
  }

  open(sealed: string): string {
    const [version, data] = sealed.split('.');
    if (version !== 'v1' || !data) throw new Error('Unknown seal.');
    const raw = Buffer.from(data, 'base64');
    if (raw.length < 28) throw new Error('Unknown seal.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }
}
