# Darboon Deployment Guide

Darboon is a stateless (aside from Postgres + Redis) microservice designed to run
the same image in two roles and scale horizontally.

## 1. Runtime topology

| Role (`DARBOON_ROLE`) | Serves HTTP | Consumes queues | Runs migrations |
|---|---|---|---|
| `api` | ✅ auth/token/admin/OIDC | ❌ | ✅ (single owner) |
| `worker` | ❌ | ✅ OTP-SMS, email, key rotation | ❌ |
| `all` | ✅ | ✅ | optional — dev only |

**Always run `api` and `worker` as separate deployments in production.** Only the
`api` deployment should set `RUN_MIGRATIONS=true`, and it should have **one
logical owner** of migrations even when scaled (migrations are idempotent and run
on boot; keep API replicas low during a migration-bearing rollout, or run
migrations as a separate Job).

External dependencies:

- **PostgreSQL 16+** — primary store.
- **Redis 7+** — BullMQ queues, distributed rate-limit counters, RBAC cache,
  OTP/MFA challenge state, access-token revocation denylist.
- **chapar** — the notification gateway used to send OTP SMS / verification email.

## 2. Configuration

All config is environment-driven and validated at boot (Joi). See
[`.env.example`](../.env.example) for the full list. The must-set values:

| Variable | Notes |
|---|---|
| `DATABASE_URL`, `REDIS_URL` | Connection strings |
| `DARBOON_ISSUER` | Public HTTPS issuer URL (e.g. `https://auth.domain.com`) |
| `KEY_ENCRYPTION_SECRET` | 32-byte master key; `openssl rand -hex 32`; from KMS/Secret |
| `CHAPAR_BASE_URL`, `CHAPAR_API_KEY` | chapar endpoint + plaintext API key |
| `ADMIN_API_KEY_HASH` | SHA-256 of your admin key (for `/admin` + `/oauth/introspect`) |
| `ADMIN_BOOTSTRAP_EMAIL` / `_PASSWORD` | Seeds the first admin on initial start |
| `CORS_ALLOWED_ORIGINS` | Exact dashboard origins (never `*` in prod) |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | Only if Google login is enabled |
| `GITHUB_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | Only if GitHub login is enabled |

Generate the admin key hash:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('YOUR_ADMIN_KEY').digest('hex'))"
```

## 3. Local / single-host (Docker Compose)

```bash
cp .env.example .env
# fill KEY_ENCRYPTION_SECRET, CHAPAR_API_KEY, ADMIN_API_KEY_HASH, ADMIN_BOOTSTRAP_*

# With a sibling chapar checkout (../chapar):
docker compose --profile with-chapar up --build

# Or, if chapar runs elsewhere, point CHAPAR_BASE_URL at it and omit the profile:
docker compose up --build
```

This starts `postgres`, `redis`, `darboon-api` (with migrations), and
`darboon-worker`. The API listens on `:3000`.

Smoke test:

```bash
curl -s localhost:3000/health
curl -s localhost:3000/.well-known/openid-configuration
```

## 4. Kubernetes (kustomize)

Manifests live in [`k8s/`](../k8s): namespace, ConfigMap, Secret (template),
`api`/`worker` Deployments, Service, Ingress, HPA, PDB, and a Prometheus
ServiceMonitor.

```bash
# 1. Provide real secrets (use a sealed-secret / external-secrets operator in CI).
kubectl create secret generic darboon-secrets -n darboon \
  --from-literal=DATABASE_URL='postgresql://…' \
  --from-literal=REDIS_URL='redis://…' \
  --from-literal=KEY_ENCRYPTION_SECRET="$(openssl rand -hex 32)" \
  --from-literal=CHAPAR_API_KEY='…' \
  --from-literal=ADMIN_API_KEY_HASH='…' \
  --from-literal=ADMIN_BOOTSTRAP_EMAIL='admin@example.com' \
  --from-literal=ADMIN_BOOTSTRAP_PASSWORD='…'

# 2. Edit k8s/configmap.yaml (DARBOON_ISSUER, CORS origins) and k8s/ingress.yaml host.

# 3. Apply.
kubectl apply -k k8s/
```

- The **api** Deployment scales via the HPA (CPU 70%, 2–10 replicas) and is
  protected by a PodDisruptionBudget.
- The **worker** Deployment scales with notification throughput (adjust
  `replicas`).
- `/health` (liveness) and `/health/ready` (DB+Redis) back the probes.
- `/metrics` is scraped by the ServiceMonitor (requires the Prometheus Operator).

> Image: the manifests reference `ghcr.io/mohammadnasher/darboon:latest`. Build and
> push your own tag, or wire the provided GitHub Actions workflow to your registry.

## 5. Database migrations

Migrations are MikroORM-based and applied automatically on `api` startup when
`RUN_MIGRATIONS=true`. To run them out-of-band (recommended for zero-downtime
rollouts), run a one-shot Job/command with `RUN_MIGRATIONS=true` and a single
replica, then deploy the app with `RUN_MIGRATIONS=false`:

```bash
pnpm --filter @darboon/idp migration:up      # uses src/mikro-orm.config.ts
```

## 6. Signing keys & rotation

- On first boot the API generates an initial **active** ES256 key (private key
  AES-256-GCM-encrypted with `KEY_ENCRYPTION_SECRET`).
- A repeatable BullMQ job rotates keys every `KEY_ROTATION_DAYS`; `active`/`next`/
  `retiring` keys overlap so in-flight tokens keep verifying.
- Force a rotation any time: `POST /admin/keys/rotate` (admin API key).
- **Rotating `KEY_ENCRYPTION_SECRET` is a manual operation** — re-encrypt stored
  private keys before changing it, or rotate signing keys first and let old ones
  expire.

## 7. Observability & operations

- **Metrics** (`/metrics`): logins, tokens issued, OTP sent, introspection calls,
  issuance latency, plus default Node process metrics.
- **Audit log** (`audit_log` table): logins, token issue/revoke, role changes, key
  rotation, and `refresh_token.reuse_detected` (watch this — it indicates token
  theft).
- **Scaling**: API scales with request traffic; worker scales with OTP/email
  volume. Redis and Postgres are the shared state — size them accordingly.

## 8. Production checklist

- [ ] TLS terminated in front of Darboon; `DARBOON_ISSUER` is the public HTTPS URL.
- [ ] `CORS_ALLOWED_ORIGINS` lists exact dashboard origins (no `*`).
- [ ] `KEY_ENCRYPTION_SECRET` and admin credentials sourced from a secret manager.
- [ ] Bootstrap admin password changed after first login.
- [ ] `api` and `worker` deployed separately; only `api` runs migrations.
- [ ] Backups configured for Postgres; Redis persistence (AOF) enabled.
- [ ] Alerts on `refresh_token.reuse_detected` and elevated 4xx/5xx rates.
