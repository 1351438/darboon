import { EntitySchema } from '@mikro-orm/core';

/** Join row mapping a role to a permission. */
export class RolePermission {
  roleId!: string;
  permissionId!: string;
}

export const RolePermissionSchema = new EntitySchema<RolePermission>({
  class: RolePermission,
  tableName: 'role_permissions',
  properties: {
    roleId: { type: 'uuid', fieldName: 'role_id', primary: true },
    permissionId: { type: 'uuid', fieldName: 'permission_id', primary: true },
  },
  indexes: [{ properties: ['permissionId'] }],
});
