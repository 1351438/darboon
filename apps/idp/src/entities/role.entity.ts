import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

/** A role is scoped to a single application (dashboard). */
export class Role {
  id: string = uuid();
  applicationId!: string;
  name!: string;
  description?: string;
  isDefault = false;
  createdAt: Date = new Date();
}

export const RoleSchema = new EntitySchema<Role>({
  class: Role,
  tableName: 'roles',
  properties: {
    id: { type: 'uuid', primary: true },
    applicationId: { type: 'uuid', fieldName: 'application_id' },
    name: { type: 'string', length: 150 },
    description: { type: 'text', nullable: true },
    isDefault: { type: 'boolean', fieldName: 'is_default', default: false },
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
