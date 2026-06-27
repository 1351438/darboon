import { IsOptional, IsString } from 'class-validator';

export class OtpRequestDto {
  @IsString()
  client_id!: string;

  @IsOptional()
  @IsString()
  identifier?: string;

  @IsOptional()
  @IsString()
  mfa_token?: string;
}

export class OtpVerifyDto {
  @IsString()
  client_id!: string;

  @IsOptional()
  @IsString()
  client_secret?: string;

  @IsString()
  identifier!: string;

  @IsString()
  otp_code!: string;

  @IsOptional()
  @IsString()
  mfa_token?: string;

  @IsOptional()
  @IsString()
  scope?: string;
}
