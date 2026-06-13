# Amazon SP-API Backend

Express + TypeScript API for the Amazon Seller dashboard. Pulls data from Amazon SP-API on a schedule, stores it in Neon PostgreSQL via Sequelize, and serves REST endpoints to the frontend.

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js, Express, TypeScript |
| ORM | Sequelize |
| Database | PostgreSQL (Neon) |
| Deploy | Render |

**Key principle:** Background workers pull from Amazon and store in the DB. The API only reads from the database — never calls Amazon on user requests.

## Setup

### Prerequisites

- Node.js 18+
- Neon PostgreSQL account (pooled connection string)

### Install & run

```bash
cp .env.example .env
# Edit .env: DATABASE_URL, JWT_SECRET (32+ chars), ENCRYPTION_KEY (exactly 32 chars)

npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Server runs at `http://localhost:3001`

**Default admin login** (after seed):
- Email: `admin@example.com`
- Password: `Admin123!`

## Environment Variables

Copy from `.env.example`:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon pooled connection string |
| `JWT_SECRET` | Random secret, min 32 characters |
| `ENCRYPTION_KEY` | Exactly 32 characters (refresh token encryption) |
| `AMAZON_CLIENT_ID` | SP-API client ID (optional until sync) |
| `AMAZON_CLIENT_SECRET` | SP-API client secret |
| `AMAZON_REGION` | AWS region, e.g. `us-east-1` |
| `FRONTEND_URL` | Vercel URL for CORS |
| `PORT` | Default `3001` |
| `NODE_ENV` | `development` or `production` |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user |
| GET | `/api/accounts` | Seller accounts |
| PATCH | `/api/accounts/:id` | Update account (admin) |
| GET | `/api/dashboard/summary` | Dashboard KPIs |
| GET | `/api/orders` | Orders (paginated) |
| GET | `/api/inventory` | Inventory snapshots |
| GET | `/api/finance/events` | Financial events |
| GET | `/api/finance/pnl` | P&L summary |
| GET | `/api/sync/status` | Sync job status |
| POST | `/api/sync/trigger` | Manual sync (admin) |

## Amazon SP-API (when ready)

1. Register a Private App in Seller Central → Develop Apps
2. Self-authorize each seller account and collect refresh tokens
3. Add `AMAZON_CLIENT_ID` and `AMAZON_CLIENT_SECRET` to `.env`
4. Store encrypted refresh tokens per seller account in the database

Sync workers start automatically once credentials are configured.

## Deploy on Render

- **Build command:** `npm install && npm run build`
- **Start command:** `npm run start`
- **Release command (optional):** `npm run db:migrate`
- Set all env vars from `.env.example`
- Set `FRONTEND_URL` to your Vercel domain for CORS
- Use Neon's **pooled** connection string for `DATABASE_URL`

## Security

- Never commit `.env`
- Refresh tokens encrypted at rest (AES-256-GCM)
- JWT expires in 15 minutes
- Admin role required for sync trigger and account updates
