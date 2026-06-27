import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

/**
 * Optional tenant boundary. Modeled for a future multi-tenant mode but carries
 * NO enforced logic in V1 — Darboon runs as a single global user pool.
 */
export class Organization {
  id: string = uuid();
  name!: string;
  slug!: string;
  createdAt: Date = new Date();
}

export const OrganizationSchema = new EntitySchema<Organization>({
  class: Organization,
  tableName: 'organizations',
  properties: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string', length: 200 },
    slug: { type: 'string', length: 200, unique: true },
    createdAt: {
      type: 'datetime',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
});
