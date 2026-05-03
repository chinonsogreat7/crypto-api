# Crypto Trade API Guide

This guide explains the API in the same language students will use while building the mobile app and admin dashboard. The project is a sandbox, so balances and trades are simulated, but Prisma and SQLite now persist the demo state across server restarts. That makes it safe for learning while still teaching realistic API design.

## Base URL

Local development:

```http
http://localhost:4200
```

Hosted Render deployment:

```http
https://YOUR-RENDER-SERVICE.onrender.com
```

Interactive Swagger documentation is available at `/docs` on either base URL. The raw OpenAPI file is available at `/openapi.yaml`.

## Authentication

Most customer routes need this header:

```http
Authorization: Bearer demo-user-token
```

Admin routes need this header:

```http
Authorization: Bearer demo-admin-token
```

The hosted admin dashboard at `/admin-ui/` is protected by a login screen. Use the seeded admin account:

```text
Email: admin@cryptoclass.test
Password: admin123
```

The API returns errors with this structure:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient balance."
  }
}
```

Successful responses use a `data` wrapper:

```json
{
  "data": {}
}
```

List responses may also include `meta`:

```json
{
  "data": [],
  "meta": {
    "count": 0
  }
}
```

## Screen-To-Endpoint Map

| Screen or flow | Endpoint(s) |
| --- | --- |
| Splash and onboarding | Static app content for now |
| Sign up | `POST /auth/register` |
| Sign in | `POST /auth/login` |
| OTP | `POST /auth/otp/request`, `POST /auth/otp/verify` |
| KYC submission | `POST /auth/kyc` |
| Home dashboard | `GET /wallet`, `GET /market/trending`, `GET /me/notifications` |
| Market list | `GET /market/assets` |
| Asset details | `GET /market/assets/:symbol` |
| Simulated live prices | `GET /market/prices` |
| Watchlist | `GET /me/watchlist`, `POST /me/watchlist/:symbol`, `DELETE /me/watchlist/:symbol` |
| Wallet | `GET /wallet` |
| Deposit or QR code | `GET /wallet/deposit-addresses`, `GET /wallet/deposit-addresses/:symbol` |
| Mock fund wallet | `POST /wallet/deposit/simulate` |
| Withdrawal | `POST /wallet/withdrawals` |
| Buy, sell, swap preview | `POST /trade/quotes` |
| Buy, sell, swap confirmation | `POST /trade/execute` |
| Activity list | `GET /wallet/transactions` |
| Transaction details | `GET /wallet/transactions/:transactionId` |
| Profile | `GET /me`, `PATCH /me` |
| Settings | `GET /me/settings`, `PATCH /me/settings`, `PATCH /me/pin` |
| Notifications | `GET /me/notifications`, `PATCH /me/notifications/:notificationId/read`, `PATCH /me/notifications/read-all` |
| Admin dashboard | `GET /admin/dashboard` |
| Admin users | `GET /admin/users`, `GET /admin/users/:userId` |
| Admin KYC review | `GET /admin/kyc`, `PATCH /admin/kyc/:kycId` |
| Admin withdrawals | `GET /admin/withdrawals`, `PATCH /admin/withdrawals/:withdrawalId` |
| Admin assets and fees | `GET /admin/assets`, `POST /admin/assets`, `PATCH /admin/assets/:symbol`, `PATCH /admin/fees` |

## Auth Flow

### Register

```http
POST /auth/register
Content-Type: application/json

{
  "fullName": "Ada Student",
  "email": "ada@example.com",
  "phone": "+2348010000001",
  "password": "password123"
}
```

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "student@cryptoclass.test",
  "password": "password123"
}
```

The demo user starts with PIN `1234`. The admin starts with password `admin123`.

### KYC

```http
POST /auth/kyc
Authorization: Bearer demo-user-token
Content-Type: application/json

{
  "legalName": "Ada Student",
  "country": "Nigeria",
  "documentType": "national_id",
  "documentNumber": "NIN-000-000"
}
```

The user cannot execute trades until KYC is approved. For the classroom demo, approve it with:

```http
PATCH /admin/kyc/kyc_student
Authorization: Bearer demo-admin-token
Content-Type: application/json

{
  "status": "approved",
  "reviewerNote": "Approved for classroom demo."
}
```

## Simulated Live Market Prices

The backend runs a free classroom market simulator. Asset prices move automatically every few seconds, and all wallet values, trade quotes, market lists, and admin asset screens read from the same changing prices.

Students can poll this endpoint from the mobile app:

```http
GET /market/prices
```

The response includes `meta.market.lastUpdatedAt` and `meta.market.tickIntervalMs`, so students can show when prices were last refreshed and choose a sensible polling interval.

This is not connected to real exchanges. It is designed to behave like a live market feed without API keys, rate limits, or real-money risk.

Admins can pause an asset with `PATCH /admin/assets/:symbol` and `{ "isActive": false }`. Paused assets remain visible in the admin console, but they disappear from customer market endpoints and cannot be used for new quotes or trades. Set `{ "isActive": true }` to allow the asset again.

## Trading Flow

The trading flow is intentionally split into two steps.

First, create a quote. This gives the user a short-lived preview of the rate, fees, and expected amount.

```http
POST /trade/quotes
Authorization: Bearer demo-user-token
Content-Type: application/json

{
  "type": "swap",
  "fromAsset": "ETH",
  "toAsset": "USDC",
  "fromAmount": 0.1
}
```

Then execute the quote with the transaction PIN.

```http
POST /trade/execute
Authorization: Bearer demo-user-token
Content-Type: application/json

{
  "quoteId": "quote_example",
  "pin": "1234"
}
```

This design teaches an important fintech concept: the preview step and execution step should be separate because rates and fees can expire.

## Wallet Flow

`GET /wallet` returns balances and total portfolio value.

`POST /wallet/deposit/simulate` adds fake USD to the user wallet so students can test buy flows without real payments.

```http
POST /wallet/deposit/simulate
Authorization: Bearer demo-user-token
Content-Type: application/json

{
  "amount": 500
}
```

`GET /wallet/deposit-addresses/:symbol` returns a demo address and QR payload for a crypto deposit screen. These are not real custody addresses.

## Withdrawal Flow

Customers submit withdrawal requests:

```http
POST /wallet/withdrawals
Authorization: Bearer demo-user-token
Content-Type: application/json

{
  "assetSymbol": "ETH",
  "amount": 0.05,
  "address": "0xabc123...",
  "network": "Ethereum Sepolia"
}
```

The withdrawal stays pending until an admin approves or rejects it:

```http
PATCH /admin/withdrawals/wd_example
Authorization: Bearer demo-admin-token
Content-Type: application/json

{
  "status": "approved",
  "reviewerNote": "Looks good."
}
```

This teaches why financial operations often need a back-office workflow.

## Profile, Settings, And Notifications

Use `GET /me` for profile data and `PATCH /me` for editable profile fields.

Use `GET /me/settings` and `PATCH /me/settings` for language, fiat currency, theme, push notification, price alert, and biometric preferences.

Use `GET /me/notifications` to populate the notifications screen.

## Admin Responsibilities

The admin API is not just an extra feature. It helps students understand how fintech products are operated after users start transacting.

Admins can:

- review KYC submissions
- inspect users and wallets
- monitor transaction history
- approve or reject withdrawals
- manage supported assets
- update fee and spread settings

## What Is Still Mocked

The following are intentionally simulated:

- prices
- crypto balances
- wallet addresses
- deposits
- trades
- withdrawals
- KYC verification
- notifications

In production, these would connect to providers such as custody services, blockchain RPC/indexing providers, KYC vendors, payment providers, and internal risk systems.

## Persistence Layer

The project now uses Prisma Client with a local SQLite database. The route handlers still use a small in-memory domain store while requests are being processed, then successful mutations are saved to SQLite. On startup, the server hydrates that store from SQLite.

This is a teaching bridge. It lets students see persistence without forcing every lesson to start with advanced repository patterns. A later refactor can move each route to direct Prisma queries and database transactions.
