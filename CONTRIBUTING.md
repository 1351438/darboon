# Contributing to Darboon

First off — thank you for taking the time to contribute! Darboon is a security-
critical project, and thoughtful contributions of all kinds (code, docs, tests,
bug reports, and reviews) are welcome.

## Code of Conduct

Be respectful and constructive. Harassment, discrimination, or abusive behaviour
will not be tolerated. By participating you agree to uphold a welcoming and
inclusive environment for everyone.

## Ways to contribute

- **Report a bug** — open an issue with reproduction steps, expected vs actual
  behaviour, and your environment (Node version, DB version, deployment mode).
- **Request a feature** — open an issue describing the use case and motivation
  before sending a large PR, so we can align on the approach.
- **Improve docs** — typos, clarifications, and new examples are always welcome.
- **Send a pull request** — see the workflow below.

> ⚠️ **Security issues must NOT be filed as public issues.** See
> [SECURITY.md](SECURITY.md) for responsible disclosure.

## Development setup

Prerequisites: **Node ≥ 22.17**, **pnpm 9**, Docker (for Postgres/Redis/chapar).

```bash
git clone https://github.com/mohammadnasher/darboon.git
cd darboon
pnpm install
cp .env.example .env            # then fill in the required secrets

# Start dependencies + the service (api + worker + chapar):
docker compose --profile with-chapar up --build

# …or run the service against your own Postgres/Redis:
DARBOON_ROLE=all RUN_MIGRATIONS=true pnpm start:dev
```

The repo is a pnpm workspace:

| Package | Path | What it is |
|---|---|---|
| `@darboon/idp` | `apps/idp` | the NestJS Authorization Server |
| `@darboon/nestjs-verifier` | `packages/nestjs-verifier` | the downstream verifier SDK |

## Workflow

1. **Fork** and create a topic branch off `main`:
   `git checkout -b feat/short-description`.
2. Make your change. Keep commits small and focused.
3. Make sure everything is green locally:
   ```bash
   pnpm -r build
   pnpm -r lint
   pnpm -r test
   ```
4. Add or update tests for any behaviour change. Security-sensitive changes
   (token issuance, refresh rotation, crypto, RBAC) **require** tests.
5. Update docs (`README.md`, `docs/`, the Postman collection) when you change
   behaviour or endpoints.
6. Open a pull request against `main` with a clear description and linked issue.

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

feat(token): add audience-scoped permission claims
fix(otp): reject expired codes before incrementing attempts
docs(readme): document the introspection fallback
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `chore`.

## Coding standards

- **TypeScript strict mode** — no `any` escapes without justification.
- **Lint + format** are enforced (ESLint + Prettier). Run `pnpm -r lint`.
- **Follow existing patterns** — MikroORM `EntitySchema` entities, the
  `DARBOON_ROLE` api/worker split, OAuth-style error bodies, and timing-safe
  secret comparisons. Match the surrounding code's style.
- **Never log secrets** (passwords, tokens, OTP codes, private keys).

## Security review checklist (for auth-related PRs)

- [ ] Secrets compared with `timingSafeEqual` / `safeHexEqual`.
- [ ] No user-enumeration via differing responses or timing.
- [ ] Tokens/codes stored only as hashes.
- [ ] Rate limiting / throttling applied to new credential-bearing endpoints.
- [ ] Audit events emitted for security-relevant actions.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
