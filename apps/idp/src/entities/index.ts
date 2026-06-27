export * from './organization.entity';
export * from './user.entity';
export * from './credential.entity';
export * from './identity.entity';
export * from './application.entity';
export * from './role.entity';
export * from './permission.entity';
export * from './role-permission.entity';
export * from './user-application-role.entity';
export * from './refresh-token.entity';
export * from './otp-code.entity';
export * from './signing-key.entity';
export * from './verification-token.entity';
export * from './audit-log.entity';

import { OrganizationSchema } from './organization.entity';
import { UserSchema } from './user.entity';
import { CredentialSchema } from './credential.entity';
import { IdentitySchema } from './identity.entity';
import { ApplicationSchema } from './application.entity';
import { RoleSchema } from './role.entity';
import { PermissionSchema } from './permission.entity';
import { RolePermissionSchema } from './role-permission.entity';
import { UserApplicationRoleSchema } from './user-application-role.entity';
import { RefreshTokenSchema } from './refresh-token.entity';
import { OtpCodeSchema } from './otp-code.entity';
import { SigningKeySchema } from './signing-key.entity';
import { VerificationTokenSchema } from './verification-token.entity';
import { AuditLogSchema } from './audit-log.entity';

/** Every persisted entity schema, registered with the ORM in one place. */
export const ALL_ENTITIES = [
  OrganizationSchema,
  UserSchema,
  CredentialSchema,
  IdentitySchema,
  ApplicationSchema,
  RoleSchema,
  PermissionSchema,
  RolePermissionSchema,
  UserApplicationRoleSchema,
  RefreshTokenSchema,
  OtpCodeSchema,
  SigningKeySchema,
  VerificationTokenSchema,
  AuditLogSchema,
];
