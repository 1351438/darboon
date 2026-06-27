import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { ALL_ENTITIES } from './entities';

/**
 * Standalone config consumed by the MikroORM CLI (migration:create, etc.).
 * The running app builds its options via config/database.config.ts instead.
 */
const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  entities: ALL_ENTITIES,
  extensions: [Migrator],
  migrations: {
    path: isProd ? './dist/migrations' : './src/migrations',
    glob: '!(*.d).{js,ts}',
    tableName: 'mikro_orm_migrations',
    transactional: true,
  },
  debug: !isProd,
});
