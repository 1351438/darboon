# Security Policy

Darboon is an identity provider, so security is the project's top priority.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, email **nasher.themo@gmail.com** with:

- a description of the vulnerability and its impact,
- steps to reproduce (proof-of-concept if possible),
- affected version(s) / commit, and
- any suggested remediation.

You will receive an acknowledgement within **72 hours**. We aim to provide a
remediation timeline within **7 days** and to credit reporters (unless you prefer
to remain anonymous) once a fix is released.

Please give us a reasonable window to investigate and release a fix before any
public disclosure.

## Supported versions

Until a `1.0.0` release, only the latest `main` receives security fixes.

## Hardening notes for operators

- Set a strong, unique **`KEY_ENCRYPTION_SECRET`** (`openssl rand -hex 32`) and
  source it from a secret manager / KMS — never commit it.
- Rotate **`ADMIN_API_KEY_HASH`** and the bootstrap admin password immediately
  after first start.
- Always run Darboon behind **TLS** and set `CORS_ALLOWED_ORIGINS` to your exact
  dashboard origins (never `*` in production).
- Run the API and worker as **separate deployments**; only the API should have
  `RUN_MIGRATIONS=true`.
- Keep access-token TTLs short and rely on refresh rotation + introspection for
  revocation.
- Monitor the `audit_log` table and the `refresh_token.reuse_detected` event.
