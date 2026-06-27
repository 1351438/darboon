export const DARBOON_AUTH_OPTIONS = 'DARBOON_AUTH_OPTIONS';

export interface IntrospectionOptions {
  /** Enable per-request introspection fallback (catches revoked tokens). */
  enabled: boolean;
  /** Defaults to `${issuer}/oauth/introspect`. */
  endpoint?: string;
  /** Resource-server API key sent as `X-API-Key`. */
  apiKey: string;
  /** Cache window (ms) for introspection results. Default 30000. */
  cacheTtlMs?: number;
}

export interface DarboonAuthOptions {
  /** Darboon issuer URL, e.g. https://auth.domain.com */
  issuer: string;
  /** This service's audience (the application's `audience` value). */
  audience: string;
  /** Override the JWKS URI; otherwise resolved from OIDC discovery. */
  jwksUri?: string;
  /** Accepted signing algorithms. Default ['ES256','RS256']. */
  algorithms?: string[];
  /** Optional introspection fallback for instant revocation. */
  introspection?: IntrospectionOptions;
}

export interface DarboonAuthAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<DarboonAuthOptions> | DarboonAuthOptions;
}

/** Shape attached to `request.user` after successful verification. */
export interface DarboonPrincipal {
  sub: string;
  client_id?: string;
  scope?: string;
  roles: string[];
  permissions: string[];
  amr?: string[];
  [claim: string]: unknown;
}
