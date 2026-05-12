# Server Setup: gymtracker on Ubuntu Server

This document is for Claude running on the Ubuntu Server. Follow every step in order.
The goal: clone the repo, install dependencies, configure PM2 and Nginx, and wire up
auto-deploy via the existing GitHub Actions workflow.

---

## Context

- **App**: NestJS/Fastify API + React/Vite frontend (npm workspaces monorepo)
- **Database**: SQLite at `/var/data/gymtracker/db.sqlite`
- **Photos**: uploaded files at `/var/data/gymtracker/photos/`
- **Process manager**: PM2 (`ecosystem.config.js` in repo root)
- **Repo path on server**: `/var/www/gymtracker`
- **API port**: 3000 (internal only, never exposed directly)
- **Web server**: Nginx — serves frontend static files and proxies `/api/` to port 3000

The GitHub Actions workflow (`.github/workflows/deploy.yml`) already exists. It SSHs into
this server and runs: `git pull → npm ci → npm run build → npm run db:migrate → pm2 reload`.
Our job here is to make the server ready for that to work.

---

## Step 1 — System packages

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx
node -v   # expect v22.x
```

## Step 2 — PM2

```bash
sudo npm install -g pm2
pm2 -v
```

## Step 3 — Create directories

```bash
sudo mkdir -p /var/www/gymtracker
sudo mkdir -p /var/data/gymtracker/photos

# Replace "ubuntu" with the actual non-root user if different
sudo chown -R $USER:$USER /var/www/gymtracker
sudo chown -R $USER:$USER /var/data/gymtracker
```

## Step 4 — Clone the repository

```bash
git clone https://github.com/f13r/gymtracker.git /var/www/gymtracker
# If the repo is private, set up a deploy key first (see Step 4a below)
```

### Step 4a — Deploy key (only if repo is private)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
# Add that public key to GitHub repo → Settings → Deploy keys (read-only is enough)

# Tell git to use it
cat >> ~/.ssh/config << 'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentityOnly yes
EOF

git clone git@github.com:f13r/gymtracker.git /var/www/gymtracker
```

## Step 5 — Create the API .env file

```bash
cat > /var/www/gymtracker/apps/api/.env << 'EOF'
DATABASE_URL=/var/data/gymtracker/db.sqlite
PHOTOS_DIR=/var/data/gymtracker/photos
PORT=3000
NODE_ENV=production
EOF
```

## Step 6 — First build

```bash
cd /var/www/gymtracker
npm ci
npm run build
```

Both `apps/api/dist/` and `apps/web/dist/` must exist after this. Verify:

```bash
ls apps/api/dist/main.js
ls apps/web/dist/index.html
```

## Step 7 — Run database migrations

```bash
cd /var/www/gymtracker
npm run db:migrate
ls /var/data/gymtracker/db.sqlite   # file must exist now
```

## Step 8 — Start the API with PM2

```bash
cd /var/www/gymtracker
pm2 start ecosystem.config.js --env production
pm2 status   # "gymtracker" should be "online"
pm2 logs gymtracker --lines 20   # check for errors
```

Enable PM2 to survive reboots:

```bash
pm2 save
pm2 startup
# Run the printed sudo command exactly as shown
```

## Step 9 — Configure Nginx

```bash
sudo tee /etc/nginx/sites-available/gymtracker > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    root /var/www/gymtracker/apps/web/dist;
    index index.html;

    # Uploaded photos served directly by Nginx
    location /photos/ {
        alias /var/data/gymtracker/photos/;
        expires 30d;
        add_header Cache-Control "public";
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }

    # React SPA — all other routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/gymtracker /etc/nginx/sites-enabled/gymtracker
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## Step 10 — Smoke test

```bash
# API health
curl http://localhost:3000/api/health

# Via Nginx
curl http://localhost/api/health

# Frontend served
curl -s http://localhost/ | grep -o '<title>.*</title>'
```

All three should return non-error responses.

## Step 11 — SSH key for GitHub Actions

The GitHub Actions workflow authenticates to this server via SSH. Generate a dedicated key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_actions_deploy -N ""
cat ~/.ssh/github_actions_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Print the private key — you will paste it into GitHub secrets
cat ~/.ssh/github_actions_deploy
```

In the GitHub repository go to **Settings → Secrets and variables → Actions** and create:

| Secret name | Value |
|---|---|
| `SERVER_HOST` | This server's public IP address |
| `SERVER_USER` | The Linux username used above (e.g. `ubuntu`) |
| `SERVER_SSH_KEY` | The full private key printed above (including `-----BEGIN...` lines) |

## Step 12 — Verify auto-deploy works

Push any trivial commit to `main` from your dev machine, then on the server:

```bash
pm2 logs gymtracker --lines 30
```

You should see a fresh restart. Check the app is still responding:

```bash
curl http://localhost/api/health
```

---

## Maintenance reference

| Task | Command |
|---|---|
| View API logs | `pm2 logs gymtracker` |
| Restart API | `pm2 restart gymtracker` |
| Check PM2 status | `pm2 status` |
| Reload Nginx | `sudo systemctl reload nginx` |
| Manual deploy | `cd /var/www/gymtracker && git pull && npm ci && npm run build && npm run db:migrate && pm2 reload ecosystem.config.js --env production` |
| Open SQLite shell | `sqlite3 /var/data/gymtracker/db.sqlite` |
