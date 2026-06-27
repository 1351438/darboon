import { EntitySchema } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

/**
 * The core RBAC mapping: which role a user holds within a given application.
 * The claims resolver joins this -> roles -> role_permissions -> permissions to
 * build the `roles` / `permissions` arrays embedded in an access token.
 */
export class UserApplicationRole {
  id: string = uuid();
  userId!: string;
  applicationId!: string;
  roleId!: string;
  grantedBy?: string;
  createdAt: Date = new Date();
}

export const UserApplicationRoleSchema = new EntitySchema<UserApplicationRole>({
  class: UserApplicationRole,
  tableName: 'user_application_roles',
  properties: {
    id: { type: 'uuid', primary: true },
    userId: { type: 'uuid', fieldName: 'user_id' },
    applicationId: { type: 'uuid', fieldName: 'application_id' },
    roleId: { type: 'uuid', fieldName: 'role_id' },
    grantedBy: { type: 'uuid', fieldName: 'granted_by', nullable: true },
    createdAt: {
      type: 'datetime',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
  indexes: [
    {
      properties: ['userId', 'applicationId', 'roleId'],
      options: { unique: true },
    },
    { properties: ['userId', 'applicationId'] },
    { properties: ['applicationId'] },
  ],
});
