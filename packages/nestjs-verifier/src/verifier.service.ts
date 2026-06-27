import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import {
  DARBOON_AUTH_OPTIONS,
  DarboonAuthOptions,
  DarboonPrincipal,
} from './options';

interface CachedIntrospection {
  active: boolean;
  at: number;
}

/**
 * Verifies Darboon access tokens against the issuer's JWKS. `jose` caches keys
 * and transparently refetches on an unknown `kid`, so signing-key rotation needs
 * no client action. An optional introspection fallback catches tokens revoked
 * before their natural expiry.
 */
@Injectable()
export class DarboonVerifierService {
  private readonly logger = new Logger(DarboonVerifierService.name);
  private jwks?: JWTVerifyGetKey;
  private readonly algorithms: string[];
  private readonly introspectionCache = new Map<string, CachedIntrospection>();

  constructor(
    @Inject(DARBOON_AUTH_OPTIONS)
    private readonly options: DarboonAuthOptions,
  ) {
    this.algorithms = options.algorithms ?? ['ES256', 'RS256'];
  }

  private get issuer(): string {
    return this.options.issuer.replace(/\/$/, '');
  }

  /** Lazily resolve the JWKS endpoint (via discovery) and build a cached set. */
  private async getJwks(): Promise<JWTVerifyGetKey> {
    if (this.jwks) return this.jwks;
    let jwksUri = this.options.jwksUri;
    if (!jwksUri) {
      const res = await fetch(
        `${this.issuer}/.well-known/openid-configuration`,
      );
      if (!res.ok) {
        throw new Error(`OIDC discovery failed: ${res.status}`);
      }
      const doc = (await res.json()) as { jwks_uri: string };
      jwksUri = doc.jwks_uri;
    }
    this.jwks = createRemoteJWKSet(new URL(jwksUri), {
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
    });
    return this.jwks;
  }

  /** Returns the principal when valid (and not revoked), else null. */
  async verify(token: string): Promise<DarboonPrincipal | null> {
    let payload: JWTPayload;
    try {
      const jwks = await this.getJwks();
      const result = await jwtVerify(token, jwks, {
        issuer: this.issuer,
        audience: this.options.audience,
        algorithms: this.algorithms,
      });
      payload = result.payload;
    } catch (err) {
      this.logger.debug(
        `Token verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }

    if (this.options.introspection?.enabled) {
      const active = await this.introspect(token);
      if (!active) return null;
    }

    return {
      sub: payload.sub as string,
      client_id: payload.client_id as string | undefined,
      scope: payload.scope as string | undefined,
      roles: (payload.roles as string[]) ?? [],
      permissions: (payload.permissions as string[]) ?? [],
      amr: payload.amr as string[] | undefined,
      ...payload,
    };
  }

  private async introspect(token: string): Promise<boolean> {
    const cfg = this.options.introspection!;
    const ttl = cfg.cacheTtlMs ?? 30000;
    const cached = this.introspectionCache.get(token);
    if (cached && Date.now() - cached.at < ttl) {
      return cached.active;
    }
    const endpoint = cfg.endpoint ?? `${this.issuer}/oauth/introspect`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': cfg.apiKey,
        },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json()) as { active?: boolean };
      const active = res.ok && body.active === true;
      this.introspectionCache.set(token, { active, at: Date.now() });
      return active;
    } catch (err) {
      this.logger.warn(
        `Introspection call failed; denying token: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}
