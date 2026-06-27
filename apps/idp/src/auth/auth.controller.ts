import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService, LoginOutcome } from './auth.service';
import { OtpAuthService } from '../otp/otp-auth.service';
import { TokenService } from '../token/token.service';
import { TokenRequestDto } from './dto/token-request.dto';
import { LogoutDto, PasswordLoginDto } from './dto/login.dto';
import { OAuthError } from '../common/oauth-error';
import { clientIp, userAgent } from '../common/request-context';
import { AccessTokenGuard } from '../token/access-token.guard';
import { VerifiedAccessToken } from '../token/token-verifier.service';

/** Tight throttle for credential-bearing endpoints. */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60000 } };

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpAuth: OtpAuthService,
    private readonly tokenService: TokenService,
  ) {}

  /** RFC 6749 token endpoint, dispatched by grant_type. */
  @Post('oauth/token')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  async token(
    @Body() dto: TokenRequestDto,
    @Req() req: Request,
  ): Promise<LoginOutcome> {
    const meta = { ip: clientIp(req), userAgent: userAgent(req) };

    switch (dto.grant_type) {
      case 'password':
        if (!dto.username || !dto.password) {
          throw OAuthError.invalidRequest('username and password are required');
        }
        return this.authService.passwordGrant(
          {
            clientId: dto.client_id,
            clientSecret: dto.client_secret,
            identifier: dto.username,
            password: dto.password,
            scope: dto.scope,
          },
          meta,
        );

      case 'refresh_token':
        if (!dto.refresh_token) {
          throw OAuthError.invalidRequest('refresh_token is required');
        }
        return this.authService.refreshGrant(
          {
            clientId: dto.client_id,
            clientSecret: dto.client_secret,
            refreshToken: dto.refresh_token,
          },
          meta,
        );

      case 'urn:darboon:otp':
        if (!dto.identifier || !dto.otp_code) {
          throw OAuthError.invalidRequest(
            'identifier and otp_code are required',
          );
        }
        return this.otpAuth.otpGrant(
          {
            clientId: dto.client_id,
            clientSecret: dto.client_secret,
            identifier: dto.identifier,
            otpCode: dto.otp_code,
            mfaToken: dto.mfa_token,
            scope: dto.scope,
          },
          meta,
        );

      default:
        throw new OAuthError(
          'unsupported_grant_type',
          `Unsupported grant_type "${dto.grant_type}"`,
        );
    }
  }

  /** Convenience first-party password login (wraps grant=password). */
  @Post('auth/login/password')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  login(
    @Body() dto: PasswordLoginDto,
    @Req() req: Request,
  ): Promise<LoginOutcome> {
    return this.authService.passwordGrant(
      {
        clientId: dto.client_id,
        identifier: dto.identifier,
        password: dto.password,
        scope: dto.scope,
      },
      { ip: clientIp(req), userAgent: userAgent(req) },
    );
  }

  /** Revoke the caller's refresh token (and its family). */
  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  async logout(@Body() dto: LogoutDto, @Req() req: Request): Promise<void> {
    const payload = (req as Request & { user: VerifiedAccessToken }).user;
    if (dto.refresh_token) {
      await this.tokenService.revokeRefreshToken(dto.refresh_token);
    }
    if (payload.jti && payload.exp) {
      await this.tokenService.revokeAccessToken(payload.jti, payload.exp);
    }
  }
}
