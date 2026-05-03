# Crypto Trade API

Crypto Trade API is a TypeScript teaching backend for a mobile crypto trading app. It is designed around a student-friendly sandbox: no real money, no real private keys, and no live trading. Students still learn the important API concepts behind buy, sell, swap, wallets, balances, KYC, transactions, fees, and admin operations.

## Quick Start

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

The API runs on `http://localhost:4200` by default.

Useful URLs:

- `GET /health`
- `GET /docs`
- `GET /openapi.yaml`
- `GET /market/prices`
- `GET /admin-ui`

Database commands:

- `npm run db:push` creates or updates the local SQLite schema.
- `npm run db:seed` resets the demo data.
- `npm run prisma:studio` opens Prisma Studio for browsing the SQLite data.

Detailed guides:

- [API Guide](docs/API_GUIDE.md)
- [Student Lesson Plan](docs/LESSON_PLAN.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

## Demo Tokens

Admin UI login:

```text
Email: admin@cryptoclass.test
Password: admin123
```

Customer routes:

```http
Authorization: Bearer demo-user-token
```

Admin routes:

```http
Authorization: Bearer demo-admin-token
```

## Project Scope

The mobile app side covers onboarding, auth, OTP, profile, settings, notifications, watchlist, wallet, market, buy, sell, swap, activity, transaction details, deposit addresses, and withdrawals.

The admin side covers dashboard metrics, users, KYC reviews, assets, fee settings, transactions, deposit simulation, and withdrawal approval.

## Teaching Path

1. Start with public market data and auth.
2. Add wallets, balances, and transaction history.
3. Introduce quote generation for buy, sell, and swap.
4. Execute sandbox trades and write ledger entries.
5. Add admin review flows for KYC and withdrawals.
6. Discuss how this would change with real providers, real compliance, and real custody.

## API Completeness For The Current UI

The API now has enough coverage for the Figma starter screens plus the missing flows we identified. Students can build the current screens and extend the UI with swap, transaction details, deposit, withdraw, KYC, and admin review screens.

This is still a sandbox. Production crypto apps need real KYC providers, custody or non-custodial signing, blockchain indexing, webhook reconciliation, fraud checks, stronger authentication, and compliance review.
