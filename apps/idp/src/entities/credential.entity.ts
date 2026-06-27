import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

export enum CredentialType {
  PASSWORD = 'password',
}

/**
 * Authentication material kept separate from the user record so additional
 * credential types can be added later. `passwordHash` is an argon2id PHC string
 * which embeds its own salt + parameters — no separate salt column is needed.
 */
export class Credential {
  id: string = uuid();
  userId!: string;
  type: CredentialType = CredentialType.PASSWORD;
  passwordHash!: string;
  mustChange = false;
  passwordUpdatedAt: Date = new Date();
  createdAt: Date = new Date();
}

export const CredentialSchema = new EntitySchema<Credential>({
  class: Credential,
  tableName: 'credentials',
  properties: {
    id: { type: 'uuid', primary: true },
    userId: { type: 'uuid', fieldName: 'user_id' },
    type: {
      enum: true,
      items: () => Object.values(CredentialType),
      default: CredentialType.PASSWORD,
    },
    passwordHash: { type: 'text', fieldName: 'password_hash' },
    mustChange: { type: 'boolean', fieldName: 'must_change', default: false },
    passwordUpdatedAt: {
      type: 'datetime',
      fieldName: 'password_updated_at',
      onCreate: () => new Date(),
    },
    createdAt: {
      type: 'datetime',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
  indexes: [{ properties: ['userId'] }],
});
