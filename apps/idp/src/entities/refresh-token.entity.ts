import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

export enum RefreshTokenStatus {
  ACTIVE = 'active',
  ROTATED = 'rotated',
  REVOKED = 'revoked',
  REUSED = 'reused',
}

/**
 * A rotating refresh token. The opaque token itself is never stored — only its
 * SHA-256 hash. Each refresh rotates the token within the same `familyId`.
 * Presenting an already-rotated/revoked token (reuse) triggers revocation of the
 * entire family: the core stolen-token defense.
 */
export class RefreshToken {
  id: string = uuid(); // also the `jti`
  userId!: string;
  applicationId!: string;
  tokenHash!: string;
  familyId!: string;
  parentId?: string;
  status: RefreshTokenStatus = RefreshTokenStatus.ACTIVE;
  expiresAt!: Date;
  lastUsedAt?: Date;
  userAgent?: string;
  ip?: string;
  createdAt: Date = new Date();
}

export const RefreshTokenSchema = new EntitySchema<RefreshToken>({
  class: RefreshToken,
  tableName: 'refresh_tokens',
  properties: {
    id: { type: 'uuid', primary: true },
    userId: { type: 'uuid', fieldName: 'user_id' },
    applicationId: { type: 'uuid', fieldName: 'application_id' },
    tokenHash: {
      type: 'string',
      fieldName: 'token_hash',
      length: 64,
      unique: true,
    },
    familyId: { type: 'uuid', fieldName: 'family_id' },
    parentId: { type: 'uuid', fieldName: 'parent_id', nullable: true },
    status: {
      enum: true,
      items: () => Object.values(RefreshTokenStatus),
      default: RefreshTokenStatus.ACTIVE,
    },
    expiresAt: { type: 'datetime', fieldName: 'expires_at' },
    lastUsedAt: { type: 'datetime', fieldName: 'last_used_at', nullable: true },
    userAgent: {
      type: 'string',
      fieldName: 'user_agent',
      length: 500,
      nullable: true,
    },
    ip: { type: 'string', length: 64, nullable: true },
    createdAt: {
      type: 'datetime',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
  indexes: [
    { properties: ['userId', 'applicationId'] },
    { properties: ['familyId'] },
    { properties: ['expiresAt'] },
  ],
});
