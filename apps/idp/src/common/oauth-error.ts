import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * RFC 6749 §5.2 error codes. Thrown as an OAuthError so the global filter can
 * render the standards-compliant `{ error, error_description }` body.
 */
export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'mfa_required'
  | 'server_error'
  | 'temporarily_unavailable';

export class OAuthError extends HttpException {
  constructor(
    readonly error: OAuthErrorCode,
    readonly errorDescription?: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly extra?: Record<string, unknown>,
  ) {
    super(
      {
        error,
        error_description: errorDescription,
        ...(extra ?? {}),
      },
      status,
    );
  }

  static invalidGrant(description: string): OAuthError {
    return new OAuthError('invalid_grant', description, HttpStatus.BAD_REQUEST);
  }

  static invalidClient(description: string): OAuthError {
    return new OAuthError(
      'invalid_client',
      description,
      HttpStatus.UNAUTHORIZED,
    );
  }

  static invalidRequest(description: string): OAuthError {
    return new OAuthError(
      'invalid_request',
      description,
      HttpStatus.BAD_REQUEST,
    );
  }
}
