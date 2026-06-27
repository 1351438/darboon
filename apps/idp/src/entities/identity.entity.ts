import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

export enum IdentityProvider {
  GOOGLE = 'google',
}

/** A federated login linked to a Darboon user (e.g. Sign in with Google). */
export class Identity {
  id: string = uuid();
  userId!: string;
  provider!: IdentityProvider;
  providerSubject!: string;
  email?: string;
  rawProfile?: Record<string, unknown>;
  createdAt: Date = new Date();
}

export const IdentitySchema = new EntitySchema<Identity>({
  class: Identity,
  tableName: 'identities',
  properties: {
    id: { type: 'uuid', primary: true },
    userId: { type: 'uuid', fieldName: 'user_id' },
    provider: { enum: true, items: () => Object.values(IdentityProvider) },
    providerSubject: {
      type: 'string',
      fieldName: 'provider_subject',
      length: 255,
    },
    email: { type: 'string', length: 320, nullable: true },
    rawProfile: { type: 'json', fieldName: 'raw_profile', nullable: true },
    createdAt: {
      type: 'datetime',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
  indexes: [
    { properties: ['provider', 'providerSubject'], options: { unique: true } },
    { properties: ['userId'] },
  ],
});
