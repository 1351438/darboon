import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

export enum OtpPurpose {
  LOGIN = 'login',
  MFA = 'mfa',
  PHONE_VERIFY = 'phone_verify',
  EMAIL_VERIFY = 'email_verify',
  PASSWORD_RESET = 'password_reset',
}

/** A one-time passcode. Only the HMAC/SHA-256 hash of the code is persisted. */
export class OtpCode {
  id: string = uuid();
  userId?: string;
  identifier!: string; // phone or email the code was sent to
  purpose!: OtpPurpose;
  codeHash!: string;
  expiresAt!: Date;
  attempts = 0;
  maxAttempts = 5;
  consumedAt?: Date;
  createdAt: Date = new Date();
}

export const OtpCodeSchema = new EntitySchema<OtpCode>({
  class: OtpCode,
  tableName: 'otp_codes',
  properties: {
    id: { type: 'uuid', primary: true },
    userId: { type: 'uuid', fieldName: 'user_id', nullable: true },
    identifier: { type: 'string', length: 320 },
    purpose: { enum: true, items: () => Object.values(OtpPurpose) },
    codeHash: { type: 'string', fieldName: 'code_hash', length: 64 },
    expiresAt: { type: 'datetime', fieldName: 'expires_at' },
    attempts: { type: 'integer', default: 0 },
    maxAttempts: { type: 'integer', fieldName: 'max_attempts', default: 5 },
    consumedAt: { type: 'datetime', fieldName: 'consumed_at', nullable: true },
    createdAt: {
      type: 'datetime',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
  indexes: [
    { properties: ['identifier', 'purpose'] },
    { properties: ['expiresAt'] },
  ],
});
