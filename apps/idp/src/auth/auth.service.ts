import { Injectable } from '@nestjs/common';
import { Application, GrantType, User } from '../entities';
import { ApplicationsService } from '../applications/applications.service';
import { UsersService } from '../users/users.service';
import { CredentialsService } from '../credentials/credentials.service';
import { MfaService } from '../mfa/mfa.service';
import { TokenService, TokenSet } from '../token/token.service';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { OAuthError } from '../common/oauth-error';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface MfaRequired {
  mfa_required: true;
  mfa_token: string;
  factors: string[];
}

export type LoginOutcome = TokenSet | MfaRequired;

export function isMfaRequired(o: LoginOutcome): o is MfaRequired {
  return (o as MfaRequired).mfa_required === true;
}

/**
 * Orchestrates first-party credential verification, brute-force lockout, and
 * the MFA decision, then delegates token minting to TokenService.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly users: UsersService,
    private readonly credentials: CredentialsService,
    private readonly mfa: MfaService,
    private readonly tokenService: TokenService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {}

  /** Verify username/password and either issue tokens or demand a second factor. */
  async passwordGrant(
    params: {
      clientId: string;
      clientSecret?: string;
      identifier: string;
      password: string;
      scope?: string;
    },
    meta: RequestMeta,
  ): Promise<LoginOutcome> {
    const app = await this.applications.authenticateClient(
      params.clientId,
      params.clientSecret,
    );
    this.applications.assertGrantAllowed(app, GrantType.PASSWORD);

    const user = await this.users.findByIdentifier(params.identifier);
    // Uniform error to avoid leaking which identifiers exist.
    const invalid = () => {
      this.metrics.incLogin('password', 'failure');
      return OAuthError.invalidGrant('Invalid credentials');
    };

    if (!user) {
      // Run a dummy verify to keep timing roughly constant against enumeration.
      await this.credentials.verify(
        '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXk$0000000000000000000000000000000000000000000',
        params.password,
      );
      throw invalid();
    }

    if (this.users.isLocked(user)) {
      await this.audit.record({
        eventType: 'login.locked',
        userId: user.id,
        applicationId: app.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw OAuthError.invalidGrant('Account is temporarily locked');
    }

    const credential = await this.credentials.findByUserId(user.id);
    const ok =
      !!credential &&
      (await this.credentials.verify(credential.passwordHash, params.password));

    if (!ok) {
      await this.users.registerFailedLogin(user);
      await this.audit.record({
        eventType: 'login.failure',
        userId: user.id,
        applicationId: app.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw invalid();
    }

    if (!this.users.isLoginable(user)) {
      throw OAuthError.invalidGrant('Account is not active');
    }

    await this.users.registerSuccessfulLogin(user);
    return this.completeOrChallenge(user, app, ['pwd'], params.scope, meta);
  }

  /**
   * Issue tokens directly, or, when the account requires MFA, return an
   * mfa_required challenge to be completed via the OTP grant.
   */
  async completeOrChallenge(
    user: User,
    app: Application,
    amr: string[],
    scope: string | undefined,
    meta: RequestMeta,
  ): Promise<LoginOutcome> {
    const factors = this.mfa.requiredFactors(user);
    // If the user already proved a second factor (e.g. otp), don't re-challenge.
    const satisfied = factors.every((f) => amr.includes(f.split('_')[0]));

    if (factors.length > 0 && !satisfied) {
      const mfaToken = await this.mfa.issueChallenge({
        userId: user.id,
        applicationId: app.id,
        scope,
        factors,
      });
      this.metrics.incLogin('password', 'mfa_required');
      return { mfa_required: true, mfa_token: mfaToken, factors };
    }

    const tokens = await this.tokenService.issueTokenSet(user, app, {
      scope,
      amr,
      grantType: 'password',
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
    this.metrics.incLogin(amr.includes('otp') ? 'otp' : 'password', 'success');
    return tokens;
  }

  /** Exchange a refresh token for a rotated pair. */
  async refreshGrant(
    params: { clientId: string; clientSecret?: string; refreshToken: string },
    meta: RequestMeta,
  ): Promise<TokenSet> {
    const app = await this.applications.authenticateClient(
      params.clientId,
      params.clientSecret,
    );
    this.applications.assertGrantAllowed(app, GrantType.REFRESH_TOKEN);
    return this.tokenService.refresh(params.refreshToken, app, {
      scope: undefined,
      grantType: 'refresh_token',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
