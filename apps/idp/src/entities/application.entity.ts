import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

export enum ApplicationStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

export enum GrantType {
  PASSWORD = 'password',
  OTP = 'otp',
  REFRESH_TOKEN = 'refresh_token',
  GOOGLE = 'urn:darboon:google',
  GITHUB = 'urn:darboon:github',
}

/**
 * An OAuth client = a registered dashboard (s1, s2, ...). The same user logs in
 * everywhere with one credential set; roles are assigned per (user, application).
 * `audience` is the JWT `aud` value tokens for this app carry, so a downstream
 * service simply checks `aud === myAudience` and reads its own scoped roles.
 */
export class Application {
  id: string = uuid();
  organizationId?: string;
  clientId!: string;
  clientSecretHash?: string;
  name!: string;
  audience!: string;
  redirectUris: string[] = [];
  allowedGrantTypes: GrantType[] = [];
  accessTokenTtlSeconds = 900;
  refreshTokenTtlSeconds = 2592000;
  requirePkce = true;
  isFirstParty = true;
  status: ApplicationStatus = ApplicationStatus.ACTIVE;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const ApplicationSchema = new EntitySchema<Application>({
  class: Application,
  tableName: 'applications',
  properties: {
    id: { type: 'uuid', primary: true },
    organizationId: {
      type: 'uuid',
      fieldName: 'organization_id',
      nullable: true,
    },
    clientId: {
      type: 'string',
      fieldName: 'client_id',
      length: 150,
      unique: true,
    },
    clientSecretHash: {
      type: 'text',
      fieldName: 'client_secret_hash',
      nullable: true,
    },
    name: { type: 'string', length: 200 },
    audience: { type: 'string', length: 255, unique: true },
    redirectUris: { type: 'json', fieldName: 'redirect_uris' },
    allowedGrantTypes: { type: 'json', fieldName: 'allowed_grant_types' },
    accessTokenTtlSeconds: {
      type: 'integer',
      fieldName: 'access_token_ttl_seconds',
      default: 900,
    },
    refreshTokenTtlSeconds: {
      type: 'integer',
      fieldName: 'refresh_token_ttl_seconds',
      default: 2592000,
    },
    requirePkce: { type: 'boolean', fieldName: 'require_pkce', default: true },
    isFirstParty: {
      type: 'boolean',
      fieldName: 'is_first_party',
      default: true,
    },
    status: {
      enum: true,
      items: () => Object.values(ApplicationStatus),
      default: ApplicationStatus.ACTIVE,
    },
    createdAt: {
      type: 'datetime',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
    updatedAt: {
      type: 'datetime',
      fieldName: 'updated_at',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
});
