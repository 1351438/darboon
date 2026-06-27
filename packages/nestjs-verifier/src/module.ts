import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import {
  DARBOON_AUTH_OPTIONS,
  DarboonAuthAsyncOptions,
  DarboonAuthOptions,
} from './options';
import { DarboonVerifierService } from './verifier.service';
import {
  JwtAuthGuard,
  PermissionsGuard,
  RolesGuard,
  ScopesGuard,
} from './guards';

const SHARED: Provider[] = [
  DarboonVerifierService,
  JwtAuthGuard,
  RolesGuard,
  PermissionsGuard,
  ScopesGuard,
];

const EXPORTS = [
  DarboonVerifierService,
  JwtAuthGuard,
  RolesGuard,
  PermissionsGuard,
  ScopesGuard,
];

/**
 * Drop-in token verification for downstream NestJS services:
 *
 *   imports: [DarboonAuthModule.forRoot({ issuer, audience })]
 *
 * then guard routes with JwtAuthGuard and @Roles()/@Permissions().
 */
@Global()
@Module({})
export class DarboonAuthModule {
  static forRoot(options: DarboonAuthOptions): DynamicModule {
    return {
      module: DarboonAuthModule,
      providers: [
        { provide: DARBOON_AUTH_OPTIONS, useValue: options },
        ...SHARED,
      ],
      exports: EXPORTS,
    };
  }

  static forRootAsync(options: DarboonAuthAsyncOptions): DynamicModule {
    return {
      module: DarboonAuthModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: DARBOON_AUTH_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        ...SHARED,
      ],
      exports: EXPORTS,
    };
  }
}
