import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

/**
 * Envelope encryption for signing private keys at rest (AES-256-GCM). The master
 * key is derived from KEY_ENCRYPTION_SECRET (k8s Secret / KMS). To migrate to a
 * managed KMS later, swap only this service's encrypt/decrypt implementation.
 *
 * Stored format: base64(iv).base64(authTag).base64(ciphertext)
 */
@Injectable()
export class KeyCryptoService {
  private readonly masterKey: Buffer;

  constructor(config: ConfigService) {
    const secret = config.getOrThrow<string>('KEY_ENCRYPTION_SECRET');
    // Derive a fixed 32-byte key regardless of the secret's encoding/length.
    this.masterKey = createHash('sha256').update(secret).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Malformed encrypted key payload');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.masterKey,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
