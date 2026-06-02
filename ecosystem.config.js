module.exports = {
  apps: [
    {
      name: 'gymtracker',
      // Run from apps/api so the runtime loads the same apps/api/.env that
      // drizzle-kit migrate uses — a single source of truth for DATABASE_URL
      // (Postgres). Do NOT set DATABASE_URL here: a pm2 env var overrides .env
      // in @nestjs/config, and a value set here would shadow the real one.
      cwd: 'apps/api',
      script: 'dist/main.js',
      env_production: {
        NODE_ENV: 'production',
        PORT: '3000',
        PHOTOS_DIR: '/var/data/gymtracker/photos',
      },
    },
  ],
}
