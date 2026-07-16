import { Module } from '@nestjs/common';
import { GithubService } from './github.service';
import { GithubController } from './github.controller';
import { ApplicationsModule } from '../applications/applications.module';
import { TokenModule } from '../token/token.module';
import { UsersModule } from '../users/users.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [ApplicationsModule, TokenModule, UsersModule, MetricsModule],
  controllers: [GithubController],
  providers: [GithubService],
})
export class GithubModule {}
