import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

/** A fine-grained permission (e.g. `invoices:read`) scoped to an application. */
export class Permission {
  id: string = uuid();
  applicationId!: string;
  name!: string;
  description?: string;
  createdAt: Date = new Date();
}

export const PermissionSchema = new EntitySchema<Permission>({
  class: Permission,
  tableName: 'permissions',
  properties: {
    id: { type: 'uuid', primary: true },
    applicationId: { type: 'uuid', fieldName: 'application_id' },
    name: { type: 'string', length: 200 },
    description: { type: 'text', nullable: true },
    createdAt: {
      type: 'datetime',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
  indexes: [
    { properties: ['applicationId', 'name'], options: { unique: true } },
    { properties: ['applicationId'] },
  ],
});
