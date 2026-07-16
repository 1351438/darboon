# Darboon Client Handbook

A practical guide for the two kinds of consumers of Darboon:

1. Dashboards / front-ends that authenticate users and obtain tokens.
2. Resource services (`s1`, `s2`, ...) that verify those tokens and authorize requests.

Throughout, the issuer is assumed to be `https://auth.domain.com` and a dashboard
is registered as the application with `client_id = s1` and `audience = s1`.

---

## 0. Concepts in 60 seconds

- A user has one credential set in Darboon (the `sub`).
- Each dashboard is an OAuth application/client with its own `audience`.
- Roles/permissions are assigned per `(user, application)` and embedded in the
  access token, scoped to that application's `audience`.
- Access tokens are short-lived JWTs (default 15 min). Refresh tokens are opaque,
  single-use, and rotate on every refresh.

---

## 1. Dashboard integration

### 1.1 Password login

```http
POST /oauth/token
Content-Type: application/json

{
  "grant_type": "password",
  "client_id": "s1",
  "username": "ada@example.com",
  "password": "*********",
  "scope": "openid profile email"
}
```

Success -> `200`:

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "8f3c....<secret>",
  "id_token": "eyJ..."
}
```

MFA required -> `200` with a challenge instead of tokens:

```json
{ "mfa_required": true, "mfa_token": "...", "factors": ["otp_sms"] }
```

Continue with the OTP step (Section 1.3) using the `mfa_token`.

Failure -> `400`:
`{ "error": "invalid_grant", "error_description": "Invalid credentials" }`

Errors are intentionally uniform to avoid revealing which accounts exist.

### 1.2 OTP login (passwordless)

```http
POST /auth/otp/request          -> 202 { "otp_sent": true, "expires_in": 300 }
{ "client_id": "s1", "identifier": "+15551234567" }
```

Darboon dispatches the code via the chapar SMS gateway. Then:

```http
POST /oauth/token
{
  "grant_type": "urn:darboon:otp",
  "client_id": "s1",
  "identifier": "+15551234567",
  "otp_code": "482915"
}
```

### 1.3 Completing MFA after password login

```http
POST /auth/otp/request          { "client_id": "s1", "mfa_token": "..." }   -> 202
POST /oauth/token
{
  "grant_type": "urn:darboon:otp",
  "client_id": "s1",
  "identifier": "+15551234567",
  "otp_code": "482915",
  "mfa_token": "..."
}
```

The resulting token's `amr` claim will be `["pwd", "otp"]`.

### 1.4 Social sign-in (Google / GitHub, redirect-only)

Google:
`GET /auth/google/initiate?client_id=s1&redirect_uri=https://s1.domain.com/callback`

GitHub:
`GET /auth/github/initiate?client_id=s1&redirect_uri=https://s1.domain.com/callback`

The `redirect_uri` must be registered on the application. Darboon redirects to
the provider, then back to your `redirect_uri` with tokens in the URL fragment:

`https://s1.domain.com/callback#access_token=...&refresh_token=...&token_type=Bearer&expires_in=900`

Read the fragment client-side and store the tokens (see Section 1.6).

GitHub requests `user:email`; if GitHub returns no verified email, Darboon
creates a GitHub-linked account instead of guessing an existing local user.

### 1.5 Refreshing tokens

```http
POST /oauth/token
{ "grant_type": "refresh_token", "client_id": "s1", "refresh_token": "8f3c....<secret>" }
```

Each refresh rotates the token. Store the new `refresh_token` and discard the
old one. Never retry with an old refresh token: replaying a consumed token is
treated as theft and revokes the entire token family.

### 1.6 Token storage guidance

- Prefer in-memory access tokens; keep refresh tokens in secure,
  `HttpOnly` + `Secure` + `SameSite` cookies set by your dashboard backend.
- If you must store on the client, treat tokens as secrets. Never log them, and
  scrub them from URLs after reading the Google/GitHub callback fragment.

### 1.7 Logout

```http
POST /auth/logout
Authorization: Bearer <access_token>
{ "refresh_token": "8f3c....<secret>" }     -> 204
```

Revokes the refresh-token family and denylists the current access token's `jti`.

### 1.8 Self-service

| Action | Request |
|---|---|
| Register | `POST /register { email?, phone?, username?, password }` |
| Confirm email | `GET /verify/email/confirm?token=...` or `POST /verify/email/confirm { token }` |
| Verify phone | `POST /verify/phone/request { phone }` -> `POST /verify/phone/confirm { phone, code }` |
| Forgot password | `POST /recovery/forgot-password { identifier }` |
| Reset password | `POST /recovery/reset-password { token \| identifier+code, newPassword }` |

---

## 2. Resource-service integration

### 2.1 Recommended: the verifier SDK (NestJS)

```bash
pnpm add @darboon/nestjs-verifier
```

```ts
import { DarboonAuthModule, JwtAuthGuard } from '@darboon/nestjs-verifier';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    DarboonAuthModule.forRoot({
      issuer: 'https://auth.domain.com',
      audience: 's1',
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
```

Then guard handlers with `@Roles('admin')`, `@Permissions('invoices:read')`,
`@Public()`, and read the principal with `@CurrentUser()`.

### 2.2 Manual verification (any language)

1. Fetch and cache the JWKS from `GET /.well-known/jwks.json` (discoverable via
   `/.well-known/openid-configuration`).
2. For each request, verify the `Authorization: Bearer <jwt>`:
   - signature against the JWK whose `kid` matches the token header,
   - `iss === https://auth.domain.com`,
   - `aud === "s1"`,
   - `exp` not passed.
3. Authorize using the `roles` / `permissions` claims already scoped to your app.

Example access-token claims:

```json
{
  "iss": "https://auth.domain.com",
  "sub": "9b2...",
  "aud": "s1",
  "exp": 1750000900,
  "jti": "...",
  "client_id": "s1",
  "scope": "openid profile",
  "roles": ["editor"],
  "permissions": ["invoices:read"],
  "amr": ["pwd", "otp"],
  "token_use": "access"
}
```

### 2.3 Instant revocation (optional)

For high-security endpoints, additionally call introspection:

```http
POST /oauth/introspect
X-API-Key: <resource-server key>
{ "token": "<access_token>" }     -> { "active": true, "sub": "...", "roles": [...] }
```

The SDK does this for you when `introspection.enabled = true` (results cached
for about 30 seconds). Otherwise rely on short access-token TTLs.

---

## 3. Error reference (RFC 6749 style)

| HTTP | `error` | Meaning |
|---|---|---|
| 400 | `invalid_request` | Missing or malformed parameters |
| 400 | `invalid_grant` | Bad credentials, expired/replayed/unknown token, bad OTP |
| 400 | `unsupported_grant_type` | Unknown `grant_type` |
| 401 | `invalid_client` | Unknown/inactive client or bad client secret |
| 400 | `unauthorized_client` | Client not allowed to use this grant |
| 429 | - | Rate limit exceeded |

---

## 4. Admin API (machine-to-machine)

All `/admin/*` endpoints require `X-API-Key: <admin key>`. Typical lifecycle:

```http
POST /admin/applications                 { name, audience, allowedGrantTypes }
POST /admin/applications/:id/roles       { name }
POST /admin/applications/:id/permissions { name }
PUT  /admin/roles/:roleId/permissions    { permissionIds: [...] }
POST /admin/users/:id/roles              { applicationId, roleId }
```

After assigning roles, the user's next issued token (or first refresh) carries
the updated `roles` claim (the RBAC cache TTL is about 60 seconds).

See the [Postman collection](darboon.postman_collection.json) for ready-to-run
examples of every endpoint.
