import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/postgresql';
import { User, UserStatus } from '../entities';

/**
 * Owns the canonical account: lookup by identifier, account state, and the
 * brute-force lockout counters. Credentials live in CredentialsService.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly em: EntityManager,
    private readonly config: ConfigService,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.em.findOne(User, { id });
  }

  /** Resolve a login identifier (email, username, or E.164 phone) to a user. */
  findByIdentifier(identifier: string): Promise<User | null> {
    const value = identifier.trim();
    const isEmail = value.includes('@');
    const isPhone = /^\+?\d{6,15}$/.test(value);
    if (isEmail) {
      return this.em.findOne(User, { email: value.toLowerCase() });
    }
    if (isPhone) {
      return this.em.findOne(User, { phone: value });
    }
    return this.em.findOne(User, { username: value });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.em.findOne(User, { email: email.toLowerCase() });
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.em.findOne(User, { phone });
  }

  /** True when the account is currently within a lockout window. */
  isLocked(user: User): boolean {
    return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
  }

  isLoginable(user: User): boolean {
    return (
      (user.status === UserStatus.ACTIVE ||
        user.status === UserStatus.PENDING) &&
      !this.isLocked(user)
    );
  }

  /**
   * Record a failed login. After LOCKOUT_MAX_FAILURES failures the account is
   * locked with exponential backoff (base * 2^(extraFailures)).
   */
  async registerFailedLogin(user: User): Promise<void> {
    const max = this.config.get<number>('LOCKOUT_MAX_FAILURES', 5);
    const base = this.config.get<number>('LOCKOUT_BASE_SECONDS', 60);

    user.failedLoginCount += 1;
    if (user.failedLoginCount >= max) {
      const overflow = user.failedLoginCount - max;
      const backoff = base * 2 ** Math.min(overflow, 10);
      user.lockedUntil = new Date(Date.now() + backoff * 1000);
    }
    this.em.persist(user);
    await this.em.flush();
  }

  /** Clear failure counters after a successful authentication. */
  async registerSuccessfulLogin(user: User): Promise<void> {
    if (user.failedLoginCount !== 0 || user.lockedUntil) {
      user.failedLoginCount = 0;
      user.lockedUntil = undefined;
      this.em.persist(user);
      await this.em.flush();
    }
  }
}
