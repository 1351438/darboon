import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { DarboonPrincipal } from './options';

export const IS_PUBLIC_KEY = 'darboon:isPublic';
export const ROLES_KEY = 'darboon:roles';
export const PERMISSIONS_KEY = 'darboon:permissions';
export const SCOPES_KEY = 'darboon:scopes';

/** Skip authentication for a route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Require any of the listed roles (from the token's `roles` claim). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** Require any of the listed permissions (from the `permissions` claim). */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Require any of the listed OAuth scopes (from the space-delimited `scope`). */
export const Scopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

/** Inject the verified principal (or one of its claims) into a handler. */
export const CurrentUser = createParamDecorator(
  (data: keyof DarboonPrincipal | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: DarboonPrincipal }>();
    const user = request.user;
    return data && user ? user[data] : user;
  },
);
