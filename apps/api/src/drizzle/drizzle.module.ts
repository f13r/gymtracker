import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { DATABASE } from './drizzle.constants';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('DATABASE_URL');
        const sqlite = new Database(url);
        sqlite.pragma('journal_mode = WAL');
        sqlite.pragma('synchronous = NORMAL');
        sqlite.pragma('foreign_keys = ON');
        sqlite.pragma('busy_timeout = 5000');
        sqlite.pragma('cache_size = -64000');
        sqlite.pragma('temp_store = MEMORY');
        return drizzle(sqlite, { schema });
      },
    },
  ],
  exports: [DATABASE],
})
export class DrizzleModule {}
