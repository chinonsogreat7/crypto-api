# Deployment Guide

This project can be deployed with a free web service plus a free hosted database.

Recommended stack:

- Render free web service for the API and admin UI.
- Neon free Postgres for the database.

## 1. Push To GitHub

The project repo is:

```text
https://github.com/chinonsogreat7/crypto-api.git
```

This repo should contain the crypto API at the repository root:

```text
package.json
src/
prisma/
public/
render.yaml
```

## 2. Create A Free Neon Database

Create a project on Neon and copy the Postgres connection string. It should look like:

```text
postgresql://USER:PASSWORD@HOST.neon.tech/DATABASE?sslmode=require
```

## 3. Use Postgres For Deployment

Render should receive this environment variable:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST.neon.tech/DATABASE?sslmode=require
```

For Render deployment, Prisma uses the included Postgres schema:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

The Render Blueprint copies `prisma/schema.postgres.prisma` over `prisma/schema.prisma` during the build. This lets local classroom development keep the SQLite setup while the hosted service uses Neon Postgres.

## 4. Deploy On Render

Use the root-level `render.yaml` Blueprint in this repo.

Render service settings:

```text
Branch: main
Build command: npm ci --include=dev && npm run render-build
Start command: npm start
Health check path: /health
Auto-Deploy: On Commit
```

After creating the service, set `DATABASE_URL` in Render environment variables.

To add it in Render, open the service and go to **Environment > Environment Variables > Add Environment Variable**:

```text
Key: DATABASE_URL
Value: postgresql://USER:PASSWORD@HOST.neon.tech/DATABASE?sslmode=require
```

After saving, choose **Save, rebuild, and deploy** so Prisma can create the database tables during the next build.

Optional live market pricing:

```text
MARKET_PRICE_SOURCE=coingecko
MARKET_LIVE_REFRESH_INTERVAL_MS=60000
COINGECKO_API_KEY=your_demo_api_key
```

`MARKET_PRICE_SOURCE=coingecko` is the default. The API falls back to the classroom simulator if CoinGecko is unavailable. Set `MARKET_PRICE_SOURCE=simulated` only when you intentionally want seeded demo prices instead of real market prices.

Optional token lifetime settings:

```text
ACCESS_TOKEN_TTL_SECONDS=86400
REFRESH_TOKEN_TTL_SECONDS=2592000
```

`ACCESS_TOKEN_TTL_SECONDS` defaults to 24 hours for classroom convenience. `REFRESH_TOKEN_TTL_SECONDS` defaults to 30 days.

Optional Expo push delivery:

```text
ENABLE_PUSH_NOTIFICATIONS=true
```

Leave this unset or set it to `false` if students only need in-app notifications through `GET /me/notifications`.

If Render logs show `Cannot find module '/opt/render/project/src/dist/src/server.js'`, the service is only installing dependencies and is not compiling TypeScript. Update the Render Build Command to the value above, then redeploy.

The repo also includes a guarded `postinstall` fallback for Render. If the dashboard accidentally keeps `npm install` as the Build Command, Render still runs the TypeScript build because it sets `RENDER=true` during builds. Local installs skip this fallback.

If Render logs show `Environment variable not found: DATABASE_URL`, the Postgres connection string has not been added to the service environment yet.

With `autoDeployTrigger: commit` in `render.yaml`, Render deploys automatically whenever a commit is pushed to the linked `main` branch. If the service was created manually instead of from the Blueprint, enable this in the Render Dashboard under **Settings > Auto-Deploy > On Commit**.

## 5. Seed Demo Data

After the first deploy, open Render Shell and run:

```bash
npm run db:seed
```

Do this once. Do not seed on every deploy unless you want to reset the demo database.

## 6. URLs To Share

After deploy, students can use:

```text
https://YOUR-RENDER-SERVICE.onrender.com/docs
https://YOUR-RENDER-SERVICE.onrender.com/admin-ui/
https://YOUR-RENDER-SERVICE.onrender.com/health
```

Demo auth headers:

```http
Authorization: Bearer demo-user-token
```

```http
Authorization: Bearer demo-admin-token
```

Admin UI login:

```text
Email: admin@cryptoclass.test
Password: admin123
```

## Notes For Free Hosting

Render free services sleep after inactivity. The first request after sleep can be slow.

Do not use local SQLite for the hosted student version unless you are fine with data being reset. Use Neon Postgres for shared classroom use.
