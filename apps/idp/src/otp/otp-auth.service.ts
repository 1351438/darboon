import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GrantType, OtpPurpose, User } from '../entities';
import { OtpService } from './otp.service';
import { NotificationService } from '../notification/notification.service';
import { UsersService } from '../users/users.service';
import { ApplicationsService } from '../applications/applications.service';
import { MfaService } from '../mfa/mfa.service';
import { TokenService, TokenSet } from '../token/token.service';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { OAuthError } from '../common/oauth-error';
import { RequestMeta } from '../auth/auth.service';

/**
 * OTP-over-SMS login and MFA completion. Codes are dispatched via chapar; the
 * second factor is delivered to the account's verified phone.
 */
@Injectable()
export class OtpAuthService {
  private readonly logger = new Logger(OtpAuthService.name);

  constructor(
    private readonly otp: OtpService,
    private readonly notifications: NotificationService,
    private readonly users: UsersService,
    private readonly applications: ApplicationsService,
    private readonly mfa: MfaService,
    private readonly tokenService: TokenService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generate and dispatch an OTP. Either a direct OTP login (by identifier) or
   * the second step of an MFA challenge (by mfa_token). Always resolves without
   * revealing whether the account exists.
   */
  async request(
    params: { clientId: string; identifier?: string; mfaToken?: string },
    meta: RequestMeta,
  ): Promise<{ otp_sent: true; expires_in: number }> {
    const ttl = this.config.get<number>('OTP_TTL_SECONDS', 300);

    let user: User | null = null;
    let purpose: OtpPurpose = OtpPurpose.LOGIN;

    if (params.mfaToken) {
      const challenge = await this.mfa.peek(params.mfaToken);
      if (challenge) {
        user = await this.users.findById(challenge.userId);
        purpose = OtpPurpose.MFA;
      }
    } else if (params.identifier) {
      user = await this.users.findByIdentifier(params.identifier);
    }

    if (user?.phone && user.phoneVerified) {
      try {
        const { code, expiresIn } = await this.otp.issue(
          user.phone,
          purpose,
          user.id,
        );
        await this.notifications.sendSms({
          recipient: user.phone,
          template: 'otp-sms',
          data: {
            appName: this.config.get<string>('OTP_APP_NAME', 'Darboon'),
            otp: code,
            expiryMinutes: Math.round(expiresIn / 60),
          },
        });
        this.metrics.incOtpSent(purpose);
        await this.audit.record({
          eventType: 'otp.sent',
          userId: user.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: { purpose },
        });
      } catch (err) {
        // Swallow resend-throttle and delivery errors to avoid enumeration.
        this.logger.debug(
          `OTP issue suppressed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Uniform response regardless of account existence.
    return { otp_sent: true, expires_in: ttl };
  }

  /** Verify an OTP and issue tokens (direct login or MFA completion). */
  async otpGrant(
    params: {
      clientId: string;
      clientSecret?: string;
      identifier: string;
      otpCode: string;
      mfaToken?: string;
      scope?: string;
    },
    meta: RequestMeta,
  ): Promise<TokenSet> {
    const app = await this.applications.authenticateClient(
      params.clientId,
      params.clientSecret,
    );

    let user: User | null = null;
    let amr: string[] = ['otp'];
    let purpose = OtpPurpose.LOGIN;

    if (params.mfaToken) {
      const challenge = await this.mfa.peek(params.mfaToken);
      if (!challenge || challenge.applicationId !== app.id) {
        throw OAuthError.invalidGrant('Invalid or expired mfa_token');
      }
      user = await this.users.findById(challenge.userId);
      purpose = OtpPurpose.MFA;
      amr = ['pwd', 'otp'];
      params.scope = params.scope ?? challenge.scope;
    } else {
      this.applications.assertGrantAllowed(app, GrantType.OTP);
      user = await this.users.findByIdentifier(params.identifier);
    }

    if (!user) {
      throw OAuthError.invalidGrant('Invalid code');
    }

    const identifier = user.phone ?? params.identifier;
    const result = await this.otp.verify(identifier, purpose, params.otpCode);
    if (!result.ok) {
      this.metrics.incLogin('otp', 'failure');
      await this.audit.record({
        eventType: 'otp.failure',
        userId: user.id,
        applicationId: app.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw OAuthError.invalidGrant('Invalid code');
    }

    if (params.mfaToken) {
      await this.mfa.consume(params.mfaToken);
    }
    if (!this.users.isLoginable(user)) {
      throw OAuthError.invalidGrant('Account is not active');
    }
    await this.users.registerSuccessfulLogin(user);

    const tokens = await this.tokenService.issueTokenSet(user, app, {
      scope: params.scope,
      amr,
      grantType: 'otp',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.audit.record({
      eventType: 'login.success',
      userId: user.id,
      applicationId: app.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { amr },
    });
    this.metrics.incLogin('otp', 'success');
    return tokens;
  }
}
