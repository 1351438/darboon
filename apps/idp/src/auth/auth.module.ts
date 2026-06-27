import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ApplicationsModule } from '../applications/applications.module';
import { UsersModule } from '../users/users.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { MfaModule } from '../mfa/mfa.module';
import { TokenModule } from '../token/token.module';
import { OtpModule } from '../otp/otp.module';

@Module({
  imports: [
    ApplicationsModule,
    UsersModule,
    CredentialsModule,
    MfaModule,
    TokenModule,
    OtpModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
