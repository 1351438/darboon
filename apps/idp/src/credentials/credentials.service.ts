import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/postgresql';
import * as argon2 from 'argon2';
import { Credential, CredentialType } from '../entities';

/**
 * Password lifecycle using argon2id. The hash is a self-contained PHC string
 * (salt + parameters embedded), so no separate salt column is needed and
 * verification is constant-time within argon2.
 */
@Injectable()
export class CredentialsService {
  constructor(
    private readonly em: EntityManager,
    private readonly config: ConfigService,
  ) {}

  private get options(): argon2.Options {
    return {
      type: argon2.argon2id,
      memoryCost: this.config.get<number>('ARGON_MEMORY_COST', 19456),
      timeCost: this.config.get<number>('ARGON_TIME_COST', 2),
      parallelism: this.config.get<number>('ARGON_PARALLELISM', 1),
    };
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, this.options);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  findByUserId(userId: string): Promise<Credential | null> {
    return this.em.findOne(Credential, {
      userId,
      type: CredentialType.PASSWORD,
    });
  }

  /** Create or replace the password credential for a user. */
  async setPassword(userId: string, password: string): Promise<Credential> {
    const passwordHash = await this.hash(password);
    let credential = await this.findByUserId(userId);
    if (credential) {
      credential.passwordHash = passwordHash;
      credential.passwordUpdatedAt = new Date();
      credential.mustChange = false;
    } else {
      credential = this.em.create(Credential, {
        userId,
        type: CredentialType.PASSWORD,
        passwordHash,
      } as Credential);
    }
    this.em.persist(credential);
    await this.em.flush();
    return credential;
  }
}
