jest.mock('@mikro-orm/core', () => ({
  EntityManager: class EntityManager {},
}));

jest.mock('../entities', () => ({
  Application: class Application {},
  GrantType: { GITHUB: 'urn:darboon:github' },
  IdentityProvider: { GITHUB: 'github' },
}));

jest.mock('../common/federated-identity', () => ({
  linkOrCreateFederatedUser: jest.fn(),
}));

jest.mock('../applications/applications.service', () => ({
  ApplicationsService: class ApplicationsService {},
}));

jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));

jest.mock('../token/token.service', () => ({
  TokenService: class TokenService {},
}));

jest.mock('../audit/audit.service', () => ({
  AuditService: class AuditService {},
}));

jest.mock('../metrics/metrics.service', () => ({
  MetricsService: class MetricsService {},
}));

jest.mock('../redis/redis.module', () => ({
  InjectRedis: () => () => undefined,
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'github-state-uuid'),
}));

import { GithubService } from './github.service';
import { OAuthError } from '../common/oauth-error';
import { linkOrCreateFederatedUser } from '../common/federated-identity';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GithubService', () => {
  const originalFetch = global.fetch;

  const env = {
    GITHUB_CLIENT_ID: 'github-client-id',
    GITHUB_CLIENT_SECRET: 'github-client-secret',
    GITHUB_REDIRECT_URI: 'http://localhost:3000/auth/github/callback',
  };

  let em: { findOne: jest.Mock };
  let config: { get: jest.Mock };
  let applications: {
    findByClientId: jest.Mock;
    assertGrantAllowed: jest.Mock;
  };
  let users: {
    isLoginable: jest.Mock;
    registerSuccessfulLogin: jest.Mock;
  };
  let tokenService: { issueTokenSet: jest.Mock };
  let audit: { record: jest.Mock };
  let metrics: { incLogin: jest.Mock };
  let redis: { get: jest.Mock; del: jest.Mock; set: jest.Mock };
  let service: GithubService;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    em = { findOne: jest.fn() };
    config = { get: jest.fn((key: string) => env[key as keyof typeof env]) };
    applications = {
      findByClientId: jest.fn(),
      assertGrantAllowed: jest.fn(),
    };
    users = {
      isLoginable: jest.fn(),
      registerSuccessfulLogin: jest.fn(),
    };
    tokenService = { issueTokenSet: jest.fn() };
    audit = { record: jest.fn() };
    metrics = { incLogin: jest.fn() };
    redis = { get: jest.fn(), del: jest.fn(), set: jest.fn() };
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
    jest.mocked(linkOrCreateFederatedUser).mockReset();

    service = new GithubService(
      em as never,
      config as never,
      applications as never,
      users as never,
      tokenService as never,
      audit as never,
      metrics as never,
      redis as never,
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('completes the GitHub callback login and issues Darboon tokens', async () => {
    const app = { id: 'app-1' };
    const user = { id: 'user-1' };
    const tokens = {
      access_token: 'darboon-access',
      refresh_token: 'darboon-refresh',
      token_type: 'Bearer' as const,
      expires_in: 900,
    };

    redis.get.mockResolvedValue(
      JSON.stringify({
        applicationId: app.id,
        dashboardRedirect: 'https://dashboard.example.com/callback',
        codeVerifier: 'pkce-verifier',
        scope: 'openid profile email',
      }),
    );
    redis.del.mockResolvedValue(1);
    em.findOne.mockResolvedValue(app);
    jest.mocked(linkOrCreateFederatedUser).mockResolvedValue(user as never);
    users.isLoginable.mockReturnValue(true);
    users.registerSuccessfulLogin.mockResolvedValue(undefined);
    tokenService.issueTokenSet.mockResolvedValue(tokens);
    audit.record.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'github-access' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 12345,
          login: 'octocat',
          name: 'The Octocat',
          email: null,
          avatar_url: 'https://avatars.githubusercontent.com/u/12345',
          html_url: 'https://github.com/octocat',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            email: 'octocat@example.com',
            primary: true,
            verified: true,
          },
        ]),
      );

    const result = await service.handleCallback('auth-code', 'state-123', {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
    const firstCall = fetchMock.mock.calls[0];
    const secondCall = fetchMock.mock.calls[1];
    const thirdCall = fetchMock.mock.calls[2];

    expect(redis.del).toHaveBeenCalledWith('github:state:state-123');
    expect(firstCall?.[0]).toBe('https://github.com/login/oauth/access_token');
    expect(firstCall?.[1]).toMatchObject({ method: 'POST' });
    expect((firstCall?.[1]?.headers as Record<string, string>).Accept).toBe(
      'application/json',
    );
    expect(secondCall?.[0]).toBe('https://api.github.com/user');
    expect(
      (secondCall?.[1]?.headers as Record<string, string>).Authorization,
    ).toBe('Bearer github-access');
    expect(thirdCall?.[0]).toBe('https://api.github.com/user/emails');
    expect(
      (thirdCall?.[1]?.headers as Record<string, string>).Authorization,
    ).toBe('Bearer github-access');
    expect(linkOrCreateFederatedUser).toHaveBeenCalledWith(em, {
      provider: 'github',
      providerSubject: '12345',
      email: 'octocat@example.com',
      emailVerified: true,
      rawProfile: {
        login: 'octocat',
        name: 'The Octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
        profileUrl: 'https://github.com/octocat',
      },
    });
    expect(users.registerSuccessfulLogin).toHaveBeenCalledWith(user);
    expect(tokenService.issueTokenSet).toHaveBeenCalledWith(user, app, {
      amr: ['github'],
      grantType: 'github',
      scope: 'openid profile email',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'login.success',
        userId: 'user-1',
        applicationId: 'app-1',
      }),
    );
    expect(metrics.incLogin).toHaveBeenCalledWith('github', 'success');
    expect(result).toEqual({
      tokens,
      dashboardRedirect: 'https://dashboard.example.com/callback',
    });
  });

  it('rejects GitHub login when the linked account is not active', async () => {
    const app = { id: 'app-1' };
    const user = { id: 'user-1' };

    redis.get.mockResolvedValue(
      JSON.stringify({
        applicationId: app.id,
        dashboardRedirect: 'https://dashboard.example.com/callback',
        codeVerifier: 'pkce-verifier',
      }),
    );
    redis.del.mockResolvedValue(1);
    em.findOne.mockResolvedValue(app);
    jest.mocked(linkOrCreateFederatedUser).mockResolvedValue(user as never);
    users.isLoginable.mockReturnValue(false);
    audit.record.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'github-access' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 12345,
          login: 'octocat',
          email: 'octocat@example.com',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            email: 'octocat@example.com',
            primary: true,
            verified: true,
          },
        ]),
      );

    await expect(
      service.handleCallback('auth-code', 'state-123', {
        ip: '127.0.0.1',
        userAgent: 'jest',
      }),
    ).rejects.toMatchObject<Partial<OAuthError>>({
      error: 'invalid_grant',
      errorDescription: 'Account is not active',
    });

    expect(tokenService.issueTokenSet).not.toHaveBeenCalled();
    expect(users.registerSuccessfulLogin).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'login.failure',
        userId: 'user-1',
        applicationId: 'app-1',
      }),
    );
    expect(metrics.incLogin).toHaveBeenCalledWith('github', 'failure');
  });
});
