import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { OtpAuthService } from './otp-auth.service';
import { OtpController } from './otp.controller';
import { NotificationModule } from '../notification/notification.module';
import { UsersModule } from '../users/users.module';
import { ApplicationsModule } from '../applications/applications.module';
import { MfaModule } from '../mfa/mfa.module';
import { TokenModule } from '../token/token.module';

@Module({
  imports: [
    NotificationModule,
    UsersModule,
    ApplicationsModule,
    MfaModule,
    TokenModule,
  ],
  controllers: [OtpController],
  providers: [OtpService, OtpAuthService],
  exports: [OtpService, OtpAuthService],
})
export class OtpModule {}
