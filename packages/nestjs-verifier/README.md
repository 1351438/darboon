# @darboon/nestjs-verifier

NestJS guard + decorators for verifying [Darboon](../../README.md) access tokens
via JWKS, with optional introspection fallback and RBAC enforcement.

Downstream services (`s1`, `s2`, …) use this to validate the JWTs Darboon issues
and authorize requests by role/permission — statelessly by default.

## Install

```bash
pnpm add @darboon/nestjs-verifier
```

## Usage

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DarboonAuthModule, JwtAuthGuard } from '@darboon/nestjs-verifier';

@Module({
  imports: [
    DarboonAuthModule.forRoot({
      issuer: 'https://auth.domain.com',
      audience: 's1', // this service's application `audience` in Darboon
      // Optional: instant-revocation check for high-security routes.
      introspection: {
        enabled: false,
        apiKey: process.env.DARBOON_INTROSPECTION_KEY!,
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
```

```ts
// invoices.controller.ts
import { Controller, Get } from '@nestjs/common';
import {
  CurrentUser,
  DarboonPrincipal,
  Permissions,
  Public,
  Roles,
} from '@darboon/nestjs-verifier';

@Controller('invoices')
export class InvoicesController {
  @Get('health')
  @Public() // skip auth
  health() {
    return { ok: true };
  }

  @Get()
  @Roles('admin', 'accountant') // any of these roles
  list(@CurrentUser() user: DarboonPrincipal) {
    return { sub: user.sub, roles: user.roles };
  }

  @Get('export')
  @Permissions('invoices:export') // fine-grained permission
  export() {
    return { ok: true };
  }
}
```

## How it works

- On first request it reads `${issuer}/.well-known/openid-configuration` to
  resolve `jwks_uri`, then builds a cached `jose` remote JWKS. Signing-key
  rotation needs **no client action** — `jose` refetches on an unknown `kid`.
- `JwtAuthGuard` verifies signature, `iss`, `aud`, and expiry, then attaches the
  principal (`sub`, `roles`, `permissions`, `scope`, …) to `request.user`.
- `RolesGuard` / `PermissionsGuard` / `ScopesGuard` enforce `@Roles()`,
  `@Permissions()`, `@Scopes()` (register them as `APP_GUARD`s after
  `JwtAuthGuard`, or per-route).
- With `introspection.enabled`, each verified token is also checked against
  Darboon's `/oauth/introspect` (result cached ~30s) so tokens revoked before
  expiry are rejected immediately.

## License

MIT
