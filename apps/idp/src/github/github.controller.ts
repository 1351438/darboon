import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { GithubService } from './github.service';
import { clientIp, userAgent } from '../common/request-context';

/**
 * Redirect-only GitHub federation endpoints. No HTML is rendered - /initiate
 * 302-redirects to GitHub and /callback 302-redirects back to the dashboard
 * with the issued tokens in the URL fragment.
 */
@Controller('auth/github')
export class GithubController {
  constructor(private readonly github: GithubService) {}

  @Get('initiate')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async initiate(
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!clientId || !redirectUri) {
      throw new BadRequestException('client_id and redirect_uri are required');
    }
    const url = await this.github.buildAuthUrl(clientId, redirectUri);
    res.redirect(url);
  }

  @Get('callback')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      throw new BadRequestException(`GitHub error: ${error}`);
    }
    if (!code || !state) {
      throw new BadRequestException('code and state are required');
    }
    const { tokens, dashboardRedirect } = await this.github.handleCallback(
      code,
      state,
      { ip: clientIp(req), userAgent: userAgent(req) },
    );

    // Hand tokens back to the dashboard via the URL fragment (not query/logs).
    const fragment = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expires_in: String(tokens.expires_in),
    }).toString();
    res.redirect(`${dashboardRedirect}#${fragment}`);
  }
}
