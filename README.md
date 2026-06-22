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
- Amazon SP-API Private App registered in Seller Central

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
| `AMAZON_CLIENT_ID` | SP-API LWA client ID |
| `AMAZON_CLIENT_SECRET` | SP-API LWA client secret |
| `AMAZON_REGION` | AWS region, e.g. `us-east-1` |
| `AMAZON_REDIRECT_URI` | OAuth callback (default: `{BACKEND_URL}/api/amazon/callback`) |
| `BACKEND_URL` | Public backend URL |
| `AWS_ROLE_ARN` | IAM role ARN for SP-API AssumeRole |
| `AWS_ACCESS_KEY_ID` | IAM user key for STS AssumeRole |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret |
| `FRONTEND_URL` | Vercel URL for CORS |
| `PORT` | Default `3001` |
| `NODE_ENV` | `development` or `production` |

## Amazon SP-API Setup

1. Register a **Private App** in Seller Central → Develop Apps
2. Add OAuth redirect URI: `http://localhost:3001/api/amazon/callback` (dev) or your Render URL in prod
3. Copy LWA Client ID and Secret to `.env`
4. Configure IAM user + role with SP-API permissions; set `AWS_*` env vars
5. In the dashboard UI: **Add Account** → **Connect Amazon** (OAuth per seller account)

Sync workers start automatically once credentials are configured.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user |
| GET | `/api/accounts` | Seller accounts |
| POST | `/api/accounts` | Create account slot (admin) |
| PATCH | `/api/accounts/:id` | Update account (admin) |
| DELETE | `/api/accounts/:id` | Delete account (admin) |
| GET | `/api/amazon/auth-url` | Get OAuth URL (admin) |
| GET | `/api/amazon/callback` | OAuth callback (public) |
| DELETE | `/api/amazon/disconnect/:accountId` | Disconnect account (admin) |
| GET | `/api/dashboard/summary` | Dashboard KPIs |
| GET | `/api/orders` | Orders (paginated) |
| GET | `/api/inventory` | Inventory snapshots |
| GET | `/api/products` | Product listings |
| GET | `/api/finance/events` | Financial events |
| GET | `/api/finance/pnl` | P&L summary |
| GET | `/api/sync/status` | Sync job status |
| POST | `/api/sync/trigger` | Manual sync (admin) |

## Deploy on Render

- **Build command:** `npm install && npm run build`
- **Start command:** `npm run start`
- **Release command (optional):** `npm run db:migrate`
- Set all env vars from `.env.example`
- Set `FRONTEND_URL` to your Vercel domain for CORS
- Register OAuth redirect: `https://<render-app>/api/amazon/callback`
- Use Neon's **pooled** connection string for `DATABASE_URL`

## Security

- Never commit `.env`
- Refresh tokens encrypted at rest (AES-256-GCM)
- JWT expires in 15 minutes
- Admin role required for sync trigger, account management, and OAuth
