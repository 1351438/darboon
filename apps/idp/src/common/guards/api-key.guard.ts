import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { sha256Hex, safeHexEqual } from '../crypto.util';

/**
 * Machine-to-machine auth via the `X-API-Key` header, compared against
 * ADMIN_API_KEY_HASH (SHA-256 hex). Used for admin endpoints and token
 * introspection by resource servers. Mirrors chapar's ApiKeyGuard: a fast
 * SHA-256 hash (no `$` chars to mangle in docker-compose env-files) plus a
 * timing-safe comparison.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'];
    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('Missing X-API-Key header');
    }
    const expected = this.config.getOrThrow<string>('ADMIN_API_KEY_HASH');
    if (!safeHexEqual(sha256Hex(apiKey), expected)) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }
}
