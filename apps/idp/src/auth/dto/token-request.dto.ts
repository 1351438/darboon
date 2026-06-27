import { IsOptional, IsString } from 'class-validator';

/**
 * Unified /oauth/token request body. Only a subset of fields is relevant per
 * `grant_type`; the AuthService validates the required ones for each grant.
 */
export class TokenRequestDto {
  @IsString()
  grant_type!: string;

  @IsString()
  client_id!: string;

  @IsOptional()
  @IsString()
  client_secret?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  // grant_type=password
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  // grant_type=urn:darboon:otp
  @IsOptional()
  @IsString()
  identifier?: string;

  @IsOptional()
  @IsString()
  otp_code?: string;

  @IsOptional()
  @IsString()
  mfa_token?: string;

  // grant_type=refresh_token
  @IsOptional()
  @IsString()
  refresh_token?: string;
}
