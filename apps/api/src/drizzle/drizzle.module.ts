import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { join } from 'path'

import { DATABASE } from './drizzle.constants'
import * as schema from './schema'

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const pool = new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') })
        const db = drizzle(pool, { schema })
        await migrate(db, { migrationsFolder: join(__dirname, 'migrations') })
        return db
      },
    },
  ],
  exports: [DATABASE],
})
export class DrizzleModule {}
