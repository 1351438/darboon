import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import { createHash, randomBytes } from 'crypto';
import Redis from 'ioredis';
import { v4 as uuid } from 'uuid';
import { Application, GrantType, IdentityProvider } from '../entities';
import { ApplicationsService } from '../applications/applications.service';
import { UsersService } from '../users/users.service';
import { TokenService, TokenSet } from '../token/token.service';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { InjectRedis } from '../redis/redis.module';
import { OAuthError } from '../common/oauth-error';
import { linkOrCreateFederatedUser } from '../common/federated-identity';
import {
  pickGithubVerifiedEmail,
  type GithubEmailRecord,
} from './github-email.util';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';
const GITHUB_API_VERSION = '2022-11-28';

interface GithubState {
  applicationId: string;
  dashboardRedirect: string;
  codeVerifier: string;
  scope?: string;
}

interface GithubProfile {
  sub: string;
  email?: string;
  emailVerified: boolean;
  login: string;
  name?: string;
  avatarUrl?: string;
  profileUrl?: string;
}

interface GithubUserResponse {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  html_url?: string | null;
}

/**
 * Sign in with GitHub via redirect callbacks only (no hosted HTML). Darboon
 * builds the consent URL with PKCE + a signed state, exchanges the code,
 * fetches the GitHub profile/emails, links or creates a local identity, and
 * mints Darboon tokens.
 */
@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly config: ConfigService,
    private readonly applications: ApplicationsService,
    private readonly users: UsersService,
    private readonly tokenService: TokenService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  private cfg(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new OAuthError(
        'temporarily_unavailable',
        'GitHub sign-in is not configured',
      );
    }
    return value;
  }

  private normalizeEmail(email?: string | null): string | undefined {
    const value = email?.trim().toLowerCase();
    return value || undefined;
  }

  /** Build the GitHub authorize URL and persist the PKCE/state for the callback. */
  async buildAuthUrl(
    clientId: string,
    dashboardRedirect: string,
  ): Promise<string> {
    const app = await this.applications.findByClientId(clientId);
    if (!app) {
      throw OAuthError.invalidClient('Unknown client');
    }
    this.applications.assertGrantAllowed(app, GrantType.GITHUB);
    if (!app.redirectUris.includes(dashboardRedirect)) {
      throw OAuthError.invalidRequest(
        'redirect_uri is not registered for this client',
      );
    }

    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const state = uuid();

    await this.redis.set(
      `github:state:${state}`,
      JSON.stringify({
        applicationId: app.id,
        dashboardRedirect,
        codeVerifier,
      }),
      'EX',
      300,
    );

    const params = new URLSearchParams({
      client_id: this.cfg('GITHUB_CLIENT_ID'),
      redirect_uri: this.cfg('GITHUB_REDIRECT_URI'),
      scope: 'read:user user:email',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `${GITHUB_AUTH_URL}?${params.toString()}`;
  }

  /** Handle the GitHub callback: exchange code, fetch user data, link, and issue tokens. */
  async handleCallback(
    code: string,
    state: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ tokens: TokenSet; dashboardRedirect: string }> {
    const raw = await this.redis.get(`github:state:${state}`);
    if (!raw) {
      throw OAuthError.invalidGrant('Invalid or expired state');
    }
    await this.redis.del(`github:state:${state}`);
    const stored = JSON.parse(raw) as GithubState;

    const accessToken = await this.exchangeCode(code, stored.codeVerifier);
    const profile = await this.fetchProfile(accessToken);

    const app = await this.em.findOne(Application, {
      id: stored.applicationId,
    });
    if (!app) {
      throw OAuthError.invalidClient('Client no longer exists');
    }

    const user = await linkOrCreateFederatedUser(this.em, {
      provider: IdentityProvider.GITHUB,
      providerSubject: profile.sub,
      email: profile.email,
      emailVerified: profile.emailVerified,
      rawProfile: {
        login: profile.login,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        profileUrl: profile.profileUrl,
      },
    });

    if (!this.users.isLoginable(user)) {
      await this.audit.record({
        eventType: 'login.failure',
        userId: user.id,
        applicationId: app.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { amr: ['github'], reason: 'account_not_active' },
      });
      this.metrics.incLogin('github', 'failure');
      throw OAuthError.invalidGrant('Account is not active');
    }

    await this.users.registerSuccessfulLogin(user);

    const tokens = await this.tokenService.issueTokenSet(user, app, {
      amr: ['github'],
      grantType: 'github',
      scope: stored.scope,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    await this.audit.record({
      eventType: 'login.success',
      userId: user.id,
      applicationId: app.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { amr: ['github'] },
    });
    this.metrics.incLogin('github', 'success');
    return { tokens, dashboardRedirect: stored.dashboardRedirect };
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<string> {
    const res = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: this.cfg('GITHUB_CLIENT_ID'),
        client_secret: this.cfg('GITHUB_CLIENT_SECRET'),
        redirect_uri: this.cfg('GITHUB_REDIRECT_URI'),
        code_verifier: codeVerifier,
      }).toString(),
    });
    if (!res.ok) {
      this.logger.warn(`GitHub token exchange failed: ${res.status}`);
      throw OAuthError.invalidGrant('GitHub token exchange failed');
    }

    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) {
      throw OAuthError.invalidGrant('GitHub did not return an access_token');
    }
    return body.access_token;
  }

  private async fetchProfile(accessToken: string): Promise<GithubProfile> {
    const [profile, emails] = await Promise.all([
      this.githubRequest<GithubUserResponse>(GITHUB_USER_URL, accessToken),
      this.githubRequest<GithubEmailRecord[]>(GITHUB_EMAILS_URL, accessToken),
    ]);

    const verifiedEmail = pickGithubVerifiedEmail(emails);
    const profileEmail = this.normalizeEmail(profile.email);

    return {
      sub: String(profile.id),
      email: verifiedEmail ?? profileEmail,
      emailVerified: !!verifiedEmail,
      login: profile.login,
      name: profile.name ?? undefined,
      avatarUrl: profile.avatar_url ?? undefined,
      profileUrl: profile.html_url ?? undefined,
    };
  }

  private async githubRequest<T>(url: string, accessToken: string): Promise<T> {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Darboon',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
    });
    if (!res.ok) {
      this.logger.warn(`GitHub API request failed: ${url} (${res.status})`);
      throw OAuthError.invalidGrant('GitHub user lookup failed');
    }
    return (await res.json()) as T;
  }
}
