import { Migration } from '@mikro-orm/migrations';

/**
 * Initial Darboon schema: accounts, credentials, federated identities, the
 * OAuth client registry, RBAC tables, rotating refresh tokens, OTP codes,
 * signing keys, verification tokens, and the append-only audit log.
 */
export class Migration00000000000001 extends Migration {
  override up(): void {
    this.addSql(`
      create table "organizations" (
        "id" uuid not null,
        "name" varchar(200) not null,
        "slug" varchar(200) not null,
        "created_at" timestamptz not null default now(),
        constraint "organizations_pkey" primary key ("id"),
        constraint "organizations_slug_unique" unique ("slug")
      );
    `);

    this.addSql(`
      create table "users" (
        "id" uuid not null,
        "organization_id" uuid null,
        "username" varchar(150) null,
        "email" varchar(320) null,
        "email_verified" boolean not null default false,
        "phone" varchar(20) null,
        "phone_verified" boolean not null default false,
        "status" varchar(20) not null default 'pending',
        "failed_login_count" int not null default 0,
        "locked_until" timestamptz null,
        "mfa_enabled" boolean not null default false,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "users_pkey" primary key ("id"),
        constraint "users_username_unique" unique ("username"),
        constraint "users_organization_id_fkey" foreign key ("organization_id")
          references "organizations" ("id") on delete set null
      );
      create unique index "users_org_email_unique" on "users" ("organization_id", "email");
      create unique index "users_org_phone_unique" on "users" ("organization_id", "phone");
      create index "users_status_index" on "users" ("status");
    `);

    this.addSql(`
      create table "credentials" (
        "id" uuid not null,
        "user_id" uuid not null,
        "type" varchar(20) not null default 'password',
        "password_hash" text not null,
        "must_change" boolean not null default false,
        "password_updated_at" timestamptz not null default now(),
        "created_at" timestamptz not null default now(),
        constraint "credentials_pkey" primary key ("id"),
        constraint "credentials_user_id_fkey" foreign key ("user_id")
          references "users" ("id") on delete cascade
      );
      create index "credentials_user_id_index" on "credentials" ("user_id");
    `);

    this.addSql(`
      create table "identities" (
        "id" uuid not null,
        "user_id" uuid not null,
        "provider" varchar(30) not null,
        "provider_subject" varchar(255) not null,
        "email" varchar(320) null,
        "raw_profile" jsonb null,
        "created_at" timestamptz not null default now(),
        constraint "identities_pkey" primary key ("id"),
        constraint "identities_provider_subject_unique" unique ("provider", "provider_subject"),
        constraint "identities_user_id_fkey" foreign key ("user_id")
          references "users" ("id") on delete cascade
      );
      create index "identities_user_id_index" on "identities" ("user_id");
    `);

    this.addSql(`
      create table "applications" (
        "id" uuid not null,
        "organization_id" uuid null,
        "client_id" varchar(150) not null,
        "client_secret_hash" text null,
        "name" varchar(200) not null,
        "audience" varchar(255) not null,
        "redirect_uris" jsonb not null default '[]',
        "allowed_grant_types" jsonb not null default '[]',
        "access_token_ttl_seconds" int not null default 900,
        "refresh_token_ttl_seconds" int not null default 2592000,
        "require_pkce" boolean not null default true,
        "is_first_party" boolean not null default true,
        "status" varchar(20) not null default 'active',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "applications_pkey" primary key ("id"),
        constraint "applications_client_id_unique" unique ("client_id"),
        constraint "applications_audience_unique" unique ("audience"),
        constraint "applications_organization_id_fkey" foreign key ("organization_id")
          references "organizations" ("id") on delete set null
      );
    `);

    this.addSql(`
      create table "roles" (
        "id" uuid not null,
        "application_id" uuid not null,
        "name" varchar(150) not null,
        "description" text null,
        "is_default" boolean not null default false,
        "created_at" timestamptz not null default now(),
        constraint "roles_pkey" primary key ("id"),
        constraint "roles_app_name_unique" unique ("application_id", "name"),
        constraint "roles_application_id_fkey" foreign key ("application_id")
          references "applications" ("id") on delete cascade
      );
      create index "roles_application_id_index" on "roles" ("application_id");
    `);

    this.addSql(`
      create table "permissions" (
        "id" uuid not null,
        "application_id" uuid not null,
        "name" varchar(200) not null,
        "description" text null,
        "created_at" timestamptz not null default now(),
        constraint "permissions_pkey" primary key ("id"),
        constraint "permissions_app_name_unique" unique ("application_id", "name"),
        constraint "permissions_application_id_fkey" foreign key ("application_id")
          references "applications" ("id") on delete cascade
      );
      create index "permissions_application_id_index" on "permissions" ("application_id");
    `);

    this.addSql(`
      create table "role_permissions" (
        "role_id" uuid not null,
        "permission_id" uuid not null,
        constraint "role_permissions_pkey" primary key ("role_id", "permission_id"),
        constraint "role_permissions_role_id_fkey" foreign key ("role_id")
          references "roles" ("id") on delete cascade,
        constraint "role_permissions_permission_id_fkey" foreign key ("permission_id")
          references "permissions" ("id") on delete cascade
      );
      create index "role_permissions_permission_id_index" on "role_permissions" ("permission_id");
    `);

    this.addSql(`
      create table "user_application_roles" (
        "id" uuid not null,
        "user_id" uuid not null,
        "application_id" uuid not null,
        "role_id" uuid not null,
        "granted_by" uuid null,
        "created_at" timestamptz not null default now(),
        constraint "user_application_roles_pkey" primary key ("id"),
        constraint "uar_user_app_role_unique" unique ("user_id", "application_id", "role_id"),
        constraint "uar_user_id_fkey" foreign key ("user_id")
          references "users" ("id") on delete cascade,
        constraint "uar_application_id_fkey" foreign key ("application_id")
          references "applications" ("id") on delete cascade,
        constraint "uar_role_id_fkey" foreign key ("role_id")
          references "roles" ("id") on delete cascade
      );
      create index "uar_user_app_index" on "user_application_roles" ("user_id", "application_id");
      create index "uar_application_id_index" on "user_application_roles" ("application_id");
    `);

    this.addSql(`
      create table "refresh_tokens" (
        "id" uuid not null,
        "user_id" uuid not null,
        "application_id" uuid not null,
        "token_hash" varchar(64) not null,
        "family_id" uuid not null,
        "parent_id" uuid null,
        "status" varchar(20) not null default 'active',
        "expires_at" timestamptz not null,
        "last_used_at" timestamptz null,
        "user_agent" varchar(500) null,
        "ip" varchar(64) null,
        "created_at" timestamptz not null default now(),
        constraint "refresh_tokens_pkey" primary key ("id"),
        constraint "refresh_tokens_token_hash_unique" unique ("token_hash"),
        constraint "refresh_tokens_user_id_fkey" foreign key ("user_id")
          references "users" ("id") on delete cascade,
        constraint "refresh_tokens_application_id_fkey" foreign key ("application_id")
          references "applications" ("id") on delete cascade
      );
      create index "refresh_tokens_user_app_index" on "refresh_tokens" ("user_id", "application_id");
      create index "refresh_tokens_family_id_index" on "refresh_tokens" ("family_id");
      create index "refresh_tokens_expires_at_index" on "refresh_tokens" ("expires_at");
    `);

    this.addSql(`
      create table "otp_codes" (
        "id" uuid not null,
        "user_id" uuid null,
        "identifier" varchar(320) not null,
        "purpose" varchar(30) not null,
        "code_hash" varchar(64) not null,
        "expires_at" timestamptz not null,
        "attempts" int not null default 0,
        "max_attempts" int not null default 5,
        "consumed_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        constraint "otp_codes_pkey" primary key ("id"),
        constraint "otp_codes_user_id_fkey" foreign key ("user_id")
          references "users" ("id") on delete cascade
      );
      create index "otp_codes_identifier_purpose_index" on "otp_codes" ("identifier", "purpose");
      create index "otp_codes_expires_at_index" on "otp_codes" ("expires_at");
    `);

    this.addSql(`
      create table "signing_keys" (
        "id" uuid not null,
        "kid" varchar(64) not null,
        "alg" varchar(10) not null default 'ES256',
        "public_jwk" jsonb not null,
        "private_key_encrypted" text not null,
        "status" varchar(20) not null default 'next',
        "not_before" timestamptz not null,
        "expires_at" timestamptz not null,
        "created_at" timestamptz not null default now(),
        constraint "signing_keys_pkey" primary key ("id"),
        constraint "signing_keys_kid_unique" unique ("kid")
      );
      create index "signing_keys_status_index" on "signing_keys" ("status");
    `);

    this.addSql(`
      create table "verification_tokens" (
        "id" uuid not null,
        "user_id" uuid not null,
        "token_hash" varchar(64) not null,
        "purpose" varchar(30) not null,
        "expires_at" timestamptz not null,
        "consumed_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        constraint "verification_tokens_pkey" primary key ("id"),
        constraint "verification_tokens_token_hash_unique" unique ("token_hash"),
        constraint "verification_tokens_user_id_fkey" foreign key ("user_id")
          references "users" ("id") on delete cascade
      );
      create index "verification_tokens_user_id_index" on "verification_tokens" ("user_id");
    `);

    this.addSql(`
      create table "audit_log" (
        "id" uuid not null,
        "event_type" varchar(100) not null,
        "user_id" uuid null,
        "application_id" uuid null,
        "actor_id" uuid null,
        "ip" varchar(64) null,
        "user_agent" varchar(500) null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        constraint "audit_log_pkey" primary key ("id")
      );
      create index "audit_log_user_created_index" on "audit_log" ("user_id", "created_at");
      create index "audit_log_event_type_index" on "audit_log" ("event_type");
      create index "audit_log_created_at_index" on "audit_log" ("created_at");
    `);
  }

  override down(): void {
    for (const table of [
      'audit_log',
      'verification_tokens',
      'signing_keys',
      'otp_codes',
      'refresh_tokens',
      'user_application_roles',
      'role_permissions',
      'permissions',
      'roles',
      'applications',
      'identities',
      'credentials',
      'users',
      'organizations',
    ]) {
      this.addSql(`drop table if exists "${table}" cascade;`);
    }
  }
}
