import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DarboonVerifierService } from './verifier.service';
import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
  SCOPES_KEY,
} from './decorators';
import { DarboonPrincipal } from './options';

type AuthedRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: DarboonPrincipal;
};

/**
 * Authenticates the bearer token and attaches the principal to `request.user`.
 * Honors @Public(). Register globally (APP_GUARD) or per-controller.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly verifier: DarboonVerifierService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    if (!value?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const principal = await this.verifier.verify(value.slice(7));
    if (!principal) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    request.user = principal;
    return true;
  }
}

/** Requires the principal to hold at least one of the @Roles() listed. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    return checkAny(this.reflector, context, ROLES_KEY, (p) => p.roles);
  }
}

/** Requires the principal to hold at least one of the @Permissions() listed. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    return checkAny(
      this.reflector,
      context,
      PERMISSIONS_KEY,
      (p) => p.permissions,
    );
  }
}

/** Requires at least one of the @Scopes() listed (space-delimited `scope`). */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    return checkAny(this.reflector, context, SCOPES_KEY, (p) =>
      (p.scope ?? '').split(' ').filter(Boolean),
    );
  }
}

function checkAny(
  reflector: Reflector,
  context: ExecutionContext,
  key: string,
  pick: (p: DarboonPrincipal) => string[],
): boolean {
  const required = reflector.getAllAndOverride<string[]>(key, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (!required || required.length === 0) return true;

  const request = context.switchToHttp().getRequest<AuthedRequest>();
  const principal = request.user;
  if (!principal) {
    throw new UnauthorizedException('Not authenticated');
  }
  const held = new Set(pick(principal));
  if (required.some((r) => held.has(r))) return true;
  throw new ForbiddenException('Insufficient authorization');
}
