import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

export enum VerificationPurpose {
  EMAIL_VERIFY = 'email_verify',
  PHONE_VERIFY = 'phone_verify',
  PASSWORD_RESET = 'password_reset',
}

/** A single-use link/token for email verification and password recovery. */
export class VerificationToken {
  id: string = uuid();
  userId!: string;
  tokenHash!: string;
  purpose!: VerificationPurpose;
  expiresAt!: Date;
  consumedAt?: Date;
  createdAt: Date = new Date();
}

export const VerificationTokenSchema = new EntitySchema<VerificationToken>({
  class: VerificationToken,
  tableName: 'verification_tokens',
  properties: {
    id: { type: 'uuid', primary: true },
    userId: { type: 'uuid', fieldName: 'user_id' },
    tokenHash: {
      type: 'string',
      fieldName: 'token_hash',
      length: 64,
      unique: true,
    },
    purpose: { enum: true, items: () => Object.values(VerificationPurpose) },
    expiresAt: { type: 'datetime', fieldName: 'expires_at' },
    consumedAt: { type: 'datetime', fieldName: 'consumed_at', nullable: true },
    createdAt: {
      type: 'datetime',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
  indexes: [{ properties: ['userId'] }],
});
