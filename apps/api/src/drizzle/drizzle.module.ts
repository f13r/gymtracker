
import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import { DATABASE } from './drizzle.constants'
import * as schema from './schema'
import { mkdirSync } from 'fs'
import { dirname, isAbsolute, join, resolve } from 'path'

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('DATABASE_URL')
        const dbPath = isAbsolute(url) ? url : resolve(process.cwd(), url)
        mkdirSync(dirname(dbPath), { recursive: true })
        const sqlite = new Database(dbPath)
        sqlite.pragma('journal_mode = WAL')
        sqlite.pragma('synchronous = NORMAL')
        sqlite.pragma('foreign_keys = ON')
        sqlite.pragma('busy_timeout = 5000')
        sqlite.pragma('cache_size = -64000')
        sqlite.pragma('temp_store = MEMORY')
        const db = drizzle(sqlite, { schema })
        migrate(db, { migrationsFolder: join(__dirname, 'migrations') })
        return db
      },
    },
  ],
  exports: [DATABASE],
})
export class DrizzleModule {}
