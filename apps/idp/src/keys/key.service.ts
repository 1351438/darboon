import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  exportJWK,
  generateKeyPair,
  importJWK,
  calculateJwkThumbprint,
  type JWK,
  type KeyLike,
} from 'jose';
import { SigningKey, SigningKeyAlg, SigningKeyStatus } from '../entities';
import { KeyCryptoService } from './key-crypto.service';
import { AuditService } from '../audit/audit.service';

export interface ActiveSigningKey {
  kid: string;
  alg: SigningKeyAlg;
  privateKey: KeyLike;
}

/**
 * Manages the signing-key lifecycle. Keys overlap by status:
 *  - ACTIVE   : signs new tokens (exactly one)
 *  - NEXT     : pre-published in JWKS, promoted on next rotation
 *  - RETIRING : still verifies in-flight tokens until expiry
 * On boot it self-heals: if there is no active key, it generates one so a fresh
 * deployment can issue tokens immediately.
 */
@Injectable()
export class KeyService implements OnModuleInit {
  private readonly logger = new Logger(KeyService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly config: ConfigService,
    private readonly crypto: KeyCryptoService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Only the migration-owning / API role bootstraps keys to avoid races.
    if (process.env.DARBOON_ROLE === 'worker') return;
    const em = this.em.fork();
    const active = await em.findOne(SigningKey, {
      status: SigningKeyStatus.ACTIVE,
    });
    if (!active) {
      await this.generateKeyWithEm(em, SigningKeyStatus.ACTIVE);
      this.logger.log('Bootstrapped initial active signing key');
    }
  }

  private get alg(): SigningKeyAlg {
    return this.config.get<SigningKeyAlg>('JWT_ALG', SigningKeyAlg.ES256);
  }

  private get lifetimeMs(): number {
    // A key verifies for two rotation periods (overlap) past its activation.
    const days = this.config.get<number>('KEY_ROTATION_DAYS', 90);
    return days * 2 * 24 * 60 * 60 * 1000;
  }

  /** Generate, encrypt, and persist a new keypair with the given status. */
  async generateKey(status: SigningKeyStatus): Promise<SigningKey> {
    return this.generateKeyWithEm(this.em, status);
  }

  private async generateKeyWithEm(
    em: EntityManager,
    status: SigningKeyStatus,
  ): Promise<SigningKey> {
    const alg = this.alg;
    const { publicKey, privateKey } = await generateKeyPair(alg, {
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);
    const privateJwk = await exportJWK(privateKey);
    const kid = await calculateJwkThumbprint(publicJwk);

    publicJwk.kid = kid;
    publicJwk.alg = alg;
    publicJwk.use = 'sig';

    const entity = em.create(SigningKey, {
      kid,
      alg,
      publicJwk: publicJwk as unknown as Record<string, unknown>,
      privateKeyEncrypted: this.crypto.encrypt(JSON.stringify(privateJwk)),
      status,
      notBefore: new Date(),
      expiresAt: new Date(Date.now() + this.lifetimeMs),
    } as SigningKey);
    em.persist(entity);
    await em.flush();
    return entity;
  }

  /** The private key + metadata used to sign new access/ID tokens. */
  async getActiveSigningKey(): Promise<ActiveSigningKey> {
    const key = await this.em.findOne(SigningKey, {
      status: SigningKeyStatus.ACTIVE,
    });
    if (!key) {
      throw new Error('No active signing key available');
    }
    const privateJwk = JSON.parse(
      this.crypto.decrypt(key.privateKeyEncrypted),
    ) as JWK;
    const privateKey = (await importJWK(privateJwk, key.alg)) as KeyLike;
    return { kid: key.kid, alg: key.alg, privateKey };
  }

  /** Public JWKS: every key that may still verify a live token. */
  async getPublicJwks(): Promise<{ keys: JWK[] }> {
    const keys = await this.em.find(SigningKey, {
      status: {
        $in: [
          SigningKeyStatus.ACTIVE,
          SigningKeyStatus.NEXT,
          SigningKeyStatus.RETIRING,
        ],
      },
    });
    return { keys: keys.map((k) => k.publicJwk as unknown as JWK) };
  }

  /**
   * Rotate keys: promote NEXT→ACTIVE, demote ACTIVE→RETIRING, generate a fresh
   * NEXT, and drop any RETIRING keys past their expiry.
   */
  async rotate(actorId?: string): Promise<{ activeKid: string }> {
    const current = await this.em.findOne(SigningKey, {
      status: SigningKeyStatus.ACTIVE,
    });
    let next = await this.em.findOne(SigningKey, {
      status: SigningKeyStatus.NEXT,
    });
    if (!next) {
      next = await this.generateKey(SigningKeyStatus.NEXT);
    }

    if (current) {
      current.status = SigningKeyStatus.RETIRING;
    }
    next.status = SigningKeyStatus.ACTIVE;
    next.notBefore = new Date();
    await this.em.flush();

    // Pre-publish the following key for the next rotation's overlap window.
    await this.generateKey(SigningKeyStatus.NEXT);

    // Purge expired retiring keys.
    const expired = await this.em.find(SigningKey, {
      status: SigningKeyStatus.RETIRING,
      expiresAt: { $lt: new Date() },
    });
    for (const k of expired) {
      this.em.remove(k);
    }
    await this.em.flush();

    await this.audit.record({
      eventType: 'signing_key.rotated',
      actorId,
      metadata: { activeKid: next.kid },
    });
    this.logger.log(`Rotated signing keys; active kid=${next.kid}`);
    return { activeKid: next.kid };
  }
}
