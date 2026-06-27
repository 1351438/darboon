import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/postgresql';
import { OtpCode, OtpPurpose } from '../entities';
import {
  randomNumericCode,
  safeHexEqual,
  sha256Hex,
} from '../common/crypto.util';
import { OAuthError } from '../common/oauth-error';

export interface OtpVerifyResult {
  ok: boolean;
  userId?: string;
}

/**
 * Generates, throttles, and verifies one-time passcodes. Only a binding hash of
 * the code is stored (sha256 of `identifier:code`); the plaintext lives only in
 * the SMS sent through chapar.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly em: EntityManager,
    private readonly config: ConfigService,
  ) {}

  private hash(identifier: string, code: string): string {
    return sha256Hex(`${identifier}:${code}`);
  }

  /**
   * Issue a fresh code, enforcing a resend cooldown per (identifier, purpose).
   * Returns the plaintext code for the caller to dispatch via chapar.
   */
  async issue(
    identifier: string,
    purpose: OtpPurpose,
    userId?: string,
  ): Promise<{ code: string; expiresIn: number }> {
    const window = this.config.get<number>('OTP_RESEND_WINDOW_SECONDS', 60);
    const recent = await this.em.findOne(
      OtpCode,
      {
        identifier,
        purpose,
        createdAt: { $gt: new Date(Date.now() - window * 1000) },
      },
      { orderBy: { createdAt: 'desc' } },
    );
    if (recent) {
      throw new OAuthError(
        'temporarily_unavailable',
        'A code was already sent recently; please wait before requesting another',
      );
    }

    const length = this.config.get<number>('OTP_LENGTH', 6);
    const ttl = this.config.get<number>('OTP_TTL_SECONDS', 300);
    const maxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS', 5);
    const code = randomNumericCode(length);

    const entity = this.em.create(OtpCode, {
      userId,
      identifier,
      purpose,
      codeHash: this.hash(identifier, code),
      expiresAt: new Date(Date.now() + ttl * 1000),
      maxAttempts,
    } as OtpCode);
    this.em.persist(entity);
    await this.em.flush();

    return { code, expiresIn: ttl };
  }

  /** Verify and single-use-consume the most recent matching code. */
  async verify(
    identifier: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<OtpVerifyResult> {
    const otp = await this.em.findOne(
      OtpCode,
      { identifier, purpose, consumedAt: null },
      { orderBy: { createdAt: 'desc' } },
    );
    if (!otp) {
      return { ok: false };
    }
    if (otp.expiresAt.getTime() <= Date.now()) {
      return { ok: false };
    }
    if (otp.attempts >= otp.maxAttempts) {
      otp.consumedAt = new Date();
      await this.em.flush();
      return { ok: false };
    }

    otp.attempts += 1;
    const matches = safeHexEqual(this.hash(identifier, code), otp.codeHash);
    if (matches) {
      otp.consumedAt = new Date();
      await this.em.flush();
      return { ok: true, userId: otp.userId };
    }
    await this.em.flush();
    return { ok: false };
  }
}
