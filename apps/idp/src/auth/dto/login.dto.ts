import { IsOptional, IsString } from 'class-validator';

export class PasswordLoginDto {
  @IsString()
  client_id!: string;

  @IsString()
  identifier!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  scope?: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refresh_token?: string;
}
