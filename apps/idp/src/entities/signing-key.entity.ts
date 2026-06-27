import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

export enum SigningKeyAlg {
  ES256 = 'ES256',
  RS256 = 'RS256',
}

export enum SigningKeyStatus {
  /** Currently used to sign new tokens. Exactly one at a time. */
  ACTIVE = 'active',
  /** Pre-published in JWKS for overlap; becomes active on next rotation. */
  NEXT = 'next',
  /** No longer signs, still verifies in-flight tokens until expiry. */
  RETIRING = 'retiring',
  REVOKED = 'revoked',
}

/**
 * An asymmetric signing keypair. The private key is stored AES-256-GCM
 * envelope-encrypted (see KeyCryptoService); the public JWK is served as-is via
 * the JWKS endpoint. `kid` ties a JWT header to the right verification key.
 */
export class SigningKey {
  id: string = uuid();
  kid!: string;
  alg: SigningKeyAlg = SigningKeyAlg.ES256;
  publicJwk!: Record<string, unknown>;
  privateKeyEncrypted!: string;
  status: SigningKeyStatus = SigningKeyStatus.NEXT;
  notBefore: Date = new Date();
  expiresAt!: Date;
  createdAt: Date = new Date();
}

export const SigningKeySchema = new EntitySchema<SigningKey>({
  class: SigningKey,
  tableName: 'signing_keys',
  properties: {
    id: { type: 'uuid', primary: true },
    kid: { type: 'string', length: 64, unique: true },
    alg: {
      enum: true,
      items: () => Object.values(SigningKeyAlg),
      default: SigningKeyAlg.ES256,
    },
    publicJwk: { type: 'json', fieldName: 'public_jwk' },
    privateKeyEncrypted: { type: 'text', fieldName: 'private_key_encrypted' },
    status: {
      enum: true,
      items: () => Object.values(SigningKeyStatus),
      default: SigningKeyStatus.NEXT,
    },
    notBefore: { type: 'datetime', fieldName: 'not_before' },
    expiresAt: { type: 'datetime', fieldName: 'expires_at' },
    createdAt: {
      type: 'datetime',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
  indexes: [{ properties: ['status'] }],
});
