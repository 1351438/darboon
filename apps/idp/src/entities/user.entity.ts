import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

export enum UserStatus {
  ACTIVE = 'active',
  LOCKED = 'locked',
  DISABLED = 'disabled',
  PENDING = 'pending',
}

/**
 * The canonical account. Its `id` is the JWT `sub` carried across every
 * downstream dashboard. Rich per-dashboard profile data lives in the dashboards
 * themselves, linked back to this id.
 */
export class User {
  id: string = uuid();
  organizationId?: string;
  username?: string;
  email?: string;
  emailVerified = false;
  phone?: string;
  phoneVerified = false;
  status: UserStatus = UserStatus.PENDING;
  failedLoginCount = 0;
  lockedUntil?: Date;
  mfaEnabled = false;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const UserSchema = new EntitySchema<User>({
  class: User,
  tableName: 'users',
  properties: {
    id: { type: 'uuid', primary: true },
    organizationId: {
      type: 'uuid',
      fieldName: 'organization_id',
      nullable: true,
    },
    username: { type: 'string', length: 150, nullable: true, unique: true },
    email: { type: 'string', length: 320, nullable: true },
    emailVerified: {
      type: 'boolean',
      fieldName: 'email_verified',
      default: false,
    },
    phone: { type: 'string', length: 20, nullable: true },
    phoneVerified: {
      type: 'boolean',
      fieldName: 'phone_verified',
      default: false,
    },
    status: {
      enum: true,
      items: () => Object.values(UserStatus),
      default: UserStatus.PENDING,
    },
    failedLoginCount: {
      type: 'integer',
      fieldName: 'failed_login_count',
      default: 0,
    },
    lockedUntil: {
      type: 'datetime',
      fieldName: 'locked_until',
      nullable: true,
    },
    mfaEnabled: { type: 'boolean', fieldName: 'mfa_enabled', default: false },
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
  indexes: [
    { properties: ['organizationId', 'email'], options: { unique: true } },
    { properties: ['organizationId', 'phone'], options: { unique: true } },
    { properties: ['status'] },
  ],
});
