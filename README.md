# Darboon

> **Darboon** (Persian: داربون) — an open-source **OAuth2/OIDC Identity Provider**
> microservice that handles **authentication** and **RBAC authorization** for
> every service in your environment. Standalone, horizontally scalable, and
> Docker/Kubernetes-ready.

<p>
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="NestJS" src="https://img.shields.io/badge/built%20with-NestJS-e0234e.svg" />
  <img alt="Node >=22.17" src="https://img.shields.io/badge/node-%3E%3D22.17-339933.svg" />
  <img alt="OAuth2 / OIDC" src="https://img.shields.io/badge/OAuth2-OIDC-success.svg" />
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" />
</p>

Darboon runs at `auth.domain.com` and issues short-lived **JWT access tokens**
carrying audience-scoped roles/permissions. Downstream services (`s1`, `s2`, …)
verify those tokens locally against Darboon's JWKS (or via introspection) and
authorize requests — no per-request call to the IDP required.

```
            ┌──────────┐  1. request s1 (401, needs JWT)
  client ──▶│  s1..sN  │◀───────────────────────────────┐
            └──────────┘                                 │
                 ▲  4. call with Bearer JWT              │ verify via JWKS
                 │                                       │ (@darboon/nestjs-verifier)
            ┌────┴───────────────┐  2. login (pwd/otp/google)
  client ──▶│  Darboon (auth.*)  │  3. access + refresh tokens
            └────────┬───────────┘
                     │ OTP SMS via POST /notify
            ┌────────▼───────────┐
            │  chapar (gateway)  │  (no SMS provider in Darboon)
            └────────────────────┘
```

## The multi-profile model

A person has **one credential set** on `auth.domain.com` but **distinct
roles/profiles per dashboard**:

- **Darboon owns** the canonical account (credentials, MFA) and the RBAC mapping
  (`user → application → roles → permissions`).
- **Each dashboard is an OAuth `application`**; its `audience` is the `aud` of
  tokens minted for it. A token carries only that app's roles.
- **Rich profile data lives in each dashboard**, linked by the Darboon user id
  (the JWT `sub`).

## V1.0.0 features

- **Login methods:** username/email + password, OTP-over-SMS, Sign in with Google.
- **MFA:** password + OTP second factor (extensible factor model).
- **Tokens:** JWT access tokens (ES256, RS256 configurable) + rotating opaque
  refresh tokens with **family-wide reuse detection**.
- **OIDC:** `/.well-known/openid-configuration`, JWKS, `/userinfo`, automatic
  signing-key rotation with overlap.
- **Validation for services:** local JWKS verification **and** RFC 7662
  introspection + RFC 7009 revocation.
- **Self-service:** registration, email/phone verification, password recovery.
- **Admin RBAC API:** manage applications, roles, permissions, assignments,
  sessions, audit, key rotation.
- **Verifier SDK:** [`@darboon/nestjs-verifier`](packages/nestjs-verifier) —
  guard + `@Roles`/`@Permissions` decorators for downstream services.
- **Security:** argon2id, brute-force lockout, distributed rate limiting,
  OTP throttling, encrypted signing keys, append-only audit log, helmet, CORS.

> **API-first / direct-grant:** V1 has **no hosted login UI**. Trusted first-party
> dashboards render their own forms and call Darboon's endpoints directly. Google
> uses redirect callbacks only. Authorization-Code + PKCE + hosted UI is a planned
> additive V1.x extension — the token/JWKS/discovery layer is already standards-compliant.

## Repository layout

```
darboon/
├─ apps/idp/                  # the NestJS Authorization Server
│  └─ src/{config,common,entities,redis,audit,metrics,health,
│          users,credentials,applications,keys,rbac,token,mfa,otp,
│          notification,auth,google,admin,registration,bootstrap,migrations}
├─ packages/nestjs-verifier/  # @darboon/nestjs-verifier (publishable SDK)
├─ k8s/                       # kustomize manifests
├─ Dockerfile · docker-compose.yml · .env.example
```

## Architecture notes

- **Stack:** NestJS 11 · MikroORM 7 (PostgreSQL) · BullMQ (Redis) · `jose` ·
  argon2 · prom-client. Mirrors the conventions of the sibling
  [chapar](../chapar) notification gateway.
- **Role split (`DARBOON_ROLE`):** `api` serves HTTP + enqueues + owns migrations;
  `worker` consumes the OTP-SMS / email / key-rotation queues; `all` for dev.
  Scale each independently.
- **Refresh-token reuse detection:** refresh tokens are opaque, single-use, and
  rotated within a `family`. Presenting an already-used token revokes the whole
  family and raises a security audit event.
- **Signing keys:** generated per `JWT_ALG`, stored AES-256-GCM
  envelope-encrypted (master key from `KEY_ENCRYPTION_SECRET` → k8s Secret/KMS),
  rotated on a schedule with `active`/`next`/`retiring` overlap.

## Key HTTP endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/oauth/token` | Token endpoint (`grant_type` = `password` \| `refresh_token` \| `urn:darboon:otp`) |
| POST | `/auth/login/password` | First-party password login (tokens or `mfa_required`) |
| POST | `/auth/otp/request` · `/auth/otp/verify` | Request / verify OTP (login or MFA) |
| POST | `/auth/logout` · `/oauth/revoke` | Revoke refresh/access tokens (RFC 7009) |
| POST | `/oauth/introspect` | Token introspection (RFC 7662, API-key auth) |
| GET | `/auth/google/initiate` · `/auth/google/callback` | Google sign-in (redirect-only) |
| GET | `/.well-known/openid-configuration` · `/.well-known/jwks.json` · `/userinfo` | OIDC |
| POST | `/register` · `/verify/{email,phone}/*` · `/recovery/*` | Self-service |
| * | `/admin/*` | Applications, roles, permissions, users, assignments, sessions, audit, keys |
| GET | `/health` · `/health/ready` · `/metrics` | Ops |

## Quick start (local)

```bash
cp .env.example .env
# Set KEY_ENCRYPTION_SECRET (openssl rand -hex 32), CHAPAR_API_KEY,
# ADMIN_API_KEY_HASH (sha256 of your admin key), ADMIN_BOOTSTRAP_*.

pnpm install

# Bring up postgres, redis, chapar, and Darboon (api + worker):
docker compose --profile with-chapar up --build
```

Then exercise a login:

```bash
# Password grant (uses the seeded admin app + user)
curl -s localhost:3000/oauth/token -H 'Content-Type: application/json' -d '{
  "grant_type": "password",
  "client_id": "darboon-admin",
  "username": "admin@example.com",
  "password": "change-me-immediately",
  "scope": "openid"
}'

# Verify the issued JWT against the public JWKS
curl -s localhost:3000/.well-known/jwks.json
```

For development without Docker: run Postgres + Redis, set `DARBOON_ROLE=all` and
`RUN_MIGRATIONS=true`, then `pnpm start:dev`.

## End-to-end verification

- **Reuse detection:** log in → refresh once → replay the *old* refresh token →
  expect `400 invalid_grant` and a `refresh_token.reuse_detected` audit row; the
  whole family is revoked.
- **OTP:** `POST /auth/otp/request` → confirm a `POST /notify` (sms, `otp-sms`)
  reaches chapar (`GET /logs`) → `POST /oauth/token` grant `urn:darboon:otp`.
- **RBAC:** assign a role via `/admin/users/:id/roles` → a newly issued token's
  `roles` claim reflects it; revoke the token → `/oauth/introspect` → `active:false`.
- **SDK:** stand up a service using `@darboon/nestjs-verifier`; valid token +
  required role → 200, missing role → 403, tampered/expired → 401.

## Deployment

- **Docker:** multi-stage build, non-root, `/health` healthcheck.
- **Kubernetes:** `kubectl apply -k k8s/` (namespace, config, secret, api +
  worker deployments, service, ingress, HPA, PDB, ServiceMonitor). Provide real
  secrets via a sealed-secret / external secret store.

See the [Deployment Guide](docs/DEPLOYMENT.md) for the full topology, env
reference, migrations, key rotation, and the production checklist.

## Documentation

- 📘 [Client Handbook](docs/CLIENT_HANDBOOK.md) — integrate dashboards and resource services.
- 🚀 [Deployment Guide](docs/DEPLOYMENT.md) — Docker, Kubernetes, ops, and hardening.
- 🧩 [Verifier SDK](packages/nestjs-verifier/README.md) — `@darboon/nestjs-verifier`.
- 📮 [Postman collection](docs/darboon.postman_collection.json) +
  [environment](docs/darboon.postman_environment.json) — ready-to-run requests.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the
development setup, workflow, commit conventions, and the security-review checklist
for auth-related changes. Make sure `pnpm -r build`, `pnpm -r lint`, and
`pnpm -r test` pass before opening a pull request.

## Security

Found a vulnerability? **Do not open a public issue** — follow the responsible
disclosure process in [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).
