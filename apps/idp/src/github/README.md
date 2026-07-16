# GitHub Module

This module implements Darboon's redirect-only GitHub sign-in flow.

It does not render hosted HTML. The dashboard starts the flow with
`GET /auth/github/initiate`, GitHub redirects back to
`GET /auth/github/callback`, and Darboon redirects the browser back to the
dashboard with Darboon tokens in the URL fragment.

## Responsibilities

- Build a GitHub authorization URL with PKCE and a short-lived state value.
- Validate the requesting Darboon application and its registered redirect URI.
- Exchange the GitHub callback code for a GitHub access token.
- Fetch the GitHub profile and verified email list.
- Link an existing Darboon user or create a federated identity.
- Enforce the existing account status rules before issuing tokens.
- Emit audit events and login metrics for success and failure paths.

## Files

- `github.module.ts`: Nest module wiring.
- `github.controller.ts`: redirect-only HTTP endpoints.
- `github.service.ts`: PKCE/state handling, GitHub API calls, identity linking,
  and token issuance.
- `github-email.util.ts`: chooses the best verified GitHub email.
- `github-email.util.spec.ts`: unit tests for GitHub email selection.
- `github.service.spec.ts`: unit tests for the callback login flow.

## Routes

### `GET /auth/github/initiate`

Required query params:

- `client_id`: Darboon application client id.
- `redirect_uri`: dashboard callback URI already registered on the Darboon
  application.

Behavior:

- Confirms the Darboon application exists.
- Confirms the application allows `urn:darboon:github`.
- Confirms the supplied `redirect_uri` is registered for that application.
- Generates a PKCE verifier/challenge pair.
- Stores state in Redis under `github:state:{state}` for 5 minutes.
- Redirects the browser to GitHub.

### `GET /auth/github/callback`

Required query params:

- `code`
- `state`

Behavior:

- Rejects GitHub callback errors directly.
- Loads and deletes the stored Redis state.
- Exchanges the code with GitHub.
- Fetches `https://api.github.com/user` and
  `https://api.github.com/user/emails`.
- Links or creates a Darboon user through the shared federated-identity
  policy.
- Issues Darboon access and refresh tokens.
- Redirects back to the dashboard using a URL fragment such as:

```text
https://dashboard.example/callback#access_token=...&refresh_token=...&token_type=Bearer&expires_in=900
```

## Configuration

The module is inactive until these settings are present:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_REDIRECT_URI`

GitHub redirect URI should point back to Darboon, for example:

```text
http://localhost:3000/auth/github/callback
```

The Darboon application used by the dashboard must also allow the GitHub grant:

```text
urn:darboon:github
```

## Data Model Impact

This implementation keeps database changes minimal:

- It reuses the existing federated identity model.
- It reuses the existing application grant-type model.
- It does not require a GitHub-specific table.
- It stores temporary callback state in Redis, not the database.

Persistent records are still created through the shared identity-linking path:

- `IdentityProvider.GITHUB`
- `GrantType.GITHUB`

## Email Handling

GitHub profile responses may not contain a usable primary email, so the module
also calls the GitHub emails API.

Selection rules:

1. Prefer a primary verified email.
2. Otherwise use any verified email.
3. Otherwise return `undefined`.

The selected email is normalized through the shared federated identity policy.
If GitHub does not provide a verified email, Darboon does not guess ownership of
an existing local account.

## Security Notes

- Uses PKCE with `S256`.
- Uses a short-lived Redis-backed state value.
- Deletes state after callback consumption.
- Sends tokens to the dashboard in the URL fragment, not the query string.
- Applies throttling on both public endpoints.
- Records `login.success` and `login.failure` audit events.
- Emits Prometheus login metrics with method `github`.

## Dependencies

`GithubModule` imports:

- `ApplicationsModule`
- `TokenModule`
- `UsersModule`
- `MetricsModule`

The service also depends on:

- `ConfigService`
- MikroORM `EntityManager`
- `AuditService`
- shared Redis client from `RedisModule`

## Tests

Current unit coverage includes:

- verified-email selection behavior in `github-email.util.spec.ts`
- successful callback login in `github.service.spec.ts`
- inactive-account rejection in `github.service.spec.ts`

These tests mock GitHub HTTP responses and verify:

- state consumption
- GitHub token exchange
- profile and email lookups
- federated user linking inputs
- token issuance inputs
- audit and metric side effects
