import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { v4 as uuid } from 'uuid';
import { User } from '../entities';
import { InjectRedis } from '../redis/redis.module';

export interface MfaChallenge {
  userId: string;
  applicationId: string;
  scope?: string;
  factors: string[];
}

/**
 * Decides whether a second factor is required and brokers the short-lived
 * `mfa_token` that ties a partially-authenticated session to its completion
 * (OTP verification). The token is opaque and stored in Redis with the pending
 * challenge; it never carries authority on its own.
 */
@Injectable()
export class MfaService {
  private static readonly TTL_SECONDS = 300;

  constructor(@InjectRedis() private readonly redis: Redis) {}

  /** Factors required to finish login. Empty array => no MFA needed. */
  requiredFactors(user: User): string[] {
    return user.mfaEnabled ? ['otp_sms'] : [];
  }

  private key(token: string): string {
    return `mfa:${token}`;
  }

  async issueChallenge(challenge: MfaChallenge): Promise<string> {
    const token = uuid();
    await this.redis.set(
      this.key(token),
      JSON.stringify(challenge),
      'EX',
      MfaService.TTL_SECONDS,
    );
    return token;
  }

  async peek(token: string): Promise<MfaChallenge | null> {
    const raw = await this.redis.get(this.key(token));
    return raw ? (JSON.parse(raw) as MfaChallenge) : null;
  }

  /** Atomically consume a challenge so an mfa_token can be used only once. */
  async consume(token: string): Promise<MfaChallenge | null> {
    const challenge = await this.peek(token);
    if (challenge) {
      await this.redis.del(this.key(token));
    }
    return challenge;
  }
}
