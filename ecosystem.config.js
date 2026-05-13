module.exports = {
  apps: [
    {
      name: 'gymtracker',
      script: 'apps/api/dist/main.js',
      env_production: {
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: '/var/data/gymtracker/db.sqlite',
        PHOTOS_DIR: '/var/data/gymtracker/photos',
      },
    },
  ],
}
