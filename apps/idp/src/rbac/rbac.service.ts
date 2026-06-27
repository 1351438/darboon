import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import Redis from 'ioredis';
import {
  Permission,
  Role,
  RolePermission,
  UserApplicationRole,
} from '../entities';
import { InjectRedis } from '../redis/redis.module';

export interface ResolvedClaims {
  roles: string[];
  permissions: string[];
}

/**
 * Resolves a user's effective roles + permissions within a single application,
 * which become the `roles`/`permissions` claims of the access token. Results are
 * cached in Redis keyed by (user, application) and invalidated on any change to
 * that user's assignments.
 */
@Injectable()
export class RbacService {
  private static readonly CACHE_TTL_SECONDS = 60;

  constructor(
    private readonly em: EntityManager,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  private cacheKey(userId: string, applicationId: string): string {
    return `rbac:${applicationId}:${userId}`;
  }

  async resolve(
    userId: string,
    applicationId: string,
  ): Promise<ResolvedClaims> {
    const key = this.cacheKey(userId, applicationId);
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as ResolvedClaims;
    }

    const assignments = await this.em.find(UserApplicationRole, {
      userId,
      applicationId,
    });
    const roleIds = assignments.map((a) => a.roleId);

    if (roleIds.length === 0) {
      const empty: ResolvedClaims = { roles: [], permissions: [] };
      await this.cache(key, empty);
      return empty;
    }

    const roles = await this.em.find(Role, { id: { $in: roleIds } });
    const rolePerms = await this.em.find(RolePermission, {
      roleId: { $in: roleIds },
    });
    const permIds = [...new Set(rolePerms.map((rp) => rp.permissionId))];
    const permissions = permIds.length
      ? await this.em.find(Permission, { id: { $in: permIds } })
      : [];

    const result: ResolvedClaims = {
      roles: [...new Set(roles.map((r) => r.name))].sort(),
      permissions: [...new Set(permissions.map((p) => p.name))].sort(),
    };
    await this.cache(key, result);
    return result;
  }

  private async cache(key: string, value: ResolvedClaims): Promise<void> {
    await this.redis.set(
      key,
      JSON.stringify(value),
      'EX',
      RbacService.CACHE_TTL_SECONDS,
    );
  }

  /** Invalidate every cached application scope for a user after a role change. */
  async invalidateUser(userId: string): Promise<void> {
    const keys = await this.redis.keys(`rbac:*:${userId}`);
    if (keys.length) {
      await this.redis.del(...keys);
    }
  }
}
