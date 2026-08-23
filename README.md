# Furgle — Local Clone

A fully self-contained local clone of the "Furgle — Daily Returns Platform". No external API calls — everything runs locally against a SQLite database.

## Quick start

```bash
cd furgle
npm install
npm start
```

Then open:

- **Main site:** http://localhost:3000
- **Register:** http://localhost:3000/register
- **Admin panel:** http://localhost:3000/pentest/fuser/login

## Login credentials

| Role  | Phone       | Password   |
|-------|-------------|------------|
| Admin | 08123456789 | personally |

## Architecture

- **Frontend:** React SPA (static bundle in `static/`) — patched to use relative `/api` paths instead of the live domain.
- **Backend:** Express (`server.js` + `routes.js`) serving the local API.
- **Database:** SQLite via `better-sqlite3` (`naaturalis.db`), schema in `db.js`, seed data in `seed.js`.
- **Auth:** JWT (`auth.js`) with bcrypt password hashing.

## Database

The SQLite database is created and seeded automatically on first start. To reset to a clean state, delete `naaturalis.db` (and any `-wal`/`-shm` files) and restart.

## API endpoints

### Auth
`POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`, `POST /api/auth/change-password`

### User
`GET /api/products`, `GET/POST /api/investments`, `POST /api/invest`, `GET /api/deposits`, `POST /api/deposit/initialize`, `GET /api/deposit/verify/:ref`, `GET /api/withdrawals`, `POST /api/withdrawal/request`, `GET /api/referrals`, `POST /api/coupons/redeem`, `GET /api/transactions`, `GET /api/banks`, `POST /api/banks/resolve`, profile/PIN endpoints, `GET /api/announcements/next`, daily-claim endpoints, `GET /api/settings/public`

### Admin (requires admin JWT)
`GET /api/admin/stats/*`, users, deposits, withdrawals, investments, products, referrals, coupons, announcements, settings, activity, manual-adjustments, banks, password-resets, transactions, system endpoints.
