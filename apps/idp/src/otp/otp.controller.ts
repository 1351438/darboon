import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { OtpAuthService } from './otp-auth.service';
import { OtpRequestDto, OtpVerifyDto } from './dto/otp.dto';
import { TokenSet } from '../token/token.service';
import { clientIp, userAgent } from '../common/request-context';

@Controller('auth/otp')
export class OtpController {
  constructor(private readonly otpAuth: OtpAuthService) {}

  /** Request an OTP for login or MFA completion. Tightly throttled. */
  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  request(
    @Body() dto: OtpRequestDto,
    @Req() req: Request,
  ): Promise<{ otp_sent: true; expires_in: number }> {
    return this.otpAuth.request(
      {
        clientId: dto.client_id,
        identifier: dto.identifier,
        mfaToken: dto.mfa_token,
      },
      { ip: clientIp(req), userAgent: userAgent(req) },
    );
  }

  /** Verify an OTP and issue tokens (convenience mirror of the otp grant). */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verify(@Body() dto: OtpVerifyDto, @Req() req: Request): Promise<TokenSet> {
    return this.otpAuth.otpGrant(
      {
        clientId: dto.client_id,
        clientSecret: dto.client_secret,
        identifier: dto.identifier,
        otpCode: dto.otp_code,
        mfaToken: dto.mfa_token,
        scope: dto.scope,
      },
      { ip: clientIp(req), userAgent: userAgent(req) },
    );
  }
}
