import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Application, ApplicationStatus, GrantType } from '../entities';
import { sha256Hex, safeHexEqual } from '../common/crypto.util';
import { OAuthError } from '../common/oauth-error';

/**
 * The OAuth client registry. Each registered Application is a dashboard; its
 * `audience` becomes the `aud` of tokens minted for it.
 */
@Injectable()
export class ApplicationsService {
  constructor(private readonly em: EntityManager) {}

  findByClientId(clientId: string): Promise<Application | null> {
    return this.em.findOne(Application, { clientId });
  }

  findByAudience(audience: string): Promise<Application | null> {
    return this.em.findOne(Application, { audience });
  }

  findById(id: string): Promise<Application | null> {
    return this.em.findOne(Application, { id });
  }

  /**
   * Resolve and authenticate the client for a token request. Confidential
   * clients (those with a stored secret hash) must present a matching secret;
   * public first-party clients authenticate by client_id alone.
   */
  async authenticateClient(
    clientId: string,
    clientSecret?: string,
  ): Promise<Application> {
    const app = await this.findByClientId(clientId);
    if (!app || app.status !== ApplicationStatus.ACTIVE) {
      throw OAuthError.invalidClient('Unknown or inactive client');
    }
    if (app.clientSecretHash) {
      if (
        !clientSecret ||
        !safeHexEqual(sha256Hex(clientSecret), app.clientSecretHash)
      ) {
        throw OAuthError.invalidClient('Invalid client credentials');
      }
    }
    return app;
  }

  assertGrantAllowed(app: Application, grant: GrantType): void {
    if (!app.allowedGrantTypes.includes(grant)) {
      throw new OAuthError(
        'unauthorized_client',
        `Client is not permitted to use grant "${grant}"`,
      );
    }
  }
}
