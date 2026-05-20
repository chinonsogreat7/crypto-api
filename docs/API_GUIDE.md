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
| Session refresh, check, and logout | `POST /auth/refresh`, `GET /auth/session`, `POST /auth/logout` |
| OTP | `POST /auth/otp/request`, `POST /auth/otp/verify` |
| KYC submission | `POST /auth/kyc` |
| Home dashboard | `GET /wallet`, `GET /market/trending`, `GET /me/notifications` |
| Market list | `GET /market/assets` |
| Asset details | `GET /market/assets/:symbol` |
| Simulated live prices | `GET /market/prices` |
| Watchlist | `GET /me/watchlist`, `POST /me/watchlist/:symbol`, `DELETE /me/watchlist/:symbol` |
| Wallet | `GET /wallet` |
| Portfolio chart | `GET /wallet/portfolio/history` |
| Deposit or QR code | `GET /wallet/deposit-addresses`, `GET /wallet/deposit-addresses/:symbol` |
| Mock fund wallet | `POST /wallet/deposit/simulate` |
| Withdrawal | `POST /wallet/withdrawals` |
| Buy, sell, swap preview | `POST /trade/quotes` |
| Buy, sell, swap confirmation | `POST /trade/execute` |
| Activity list | `GET /wallet/transactions` |
| Transaction details | `GET /wallet/transactions/:transactionId` |
| Profile | `GET /me`, `PATCH /me` |
| Settings | `GET /me/settings`, `PATCH /me/settings`, `PATCH /me/pin` |
| Price alerts | `GET /me/price-alerts`, `POST /me/price-alerts`, `PATCH /me/price-alerts/:alertId`, `DELETE /me/price-alerts/:alertId` |
| Push token registration | `POST /me/devices` |
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

Registration validates that `email` looks like an email address, `phone` uses international format such as `+2348010000001`, and `password` is at least 8 characters. This is intentionally strict so students learn to handle validation errors before sending weak data to the API.

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "loginType": "email",
  "identifier": "student@cryptoclass.test",
  "password": "password123"
}
```

Use `loginType: "email"` when `identifier` is an email address, or `loginType: "phone"` when `identifier` is a phone number. The older `email` field still works for backward compatibility, but new apps should use `loginType` and `identifier`.

Successful register, login, and 2FA verify responses now return both a short-lived access token and a longer-lived refresh token:

```json
{
  "data": {
    "accessToken": "access_...",
    "token": "access_...",
    "refreshToken": "refresh_...",
    "tokenType": "Bearer",
    "expiresAt": "2026-05-20T12:15:00.000Z",
    "expiresInSeconds": 900,
    "refreshTokenExpiresAt": "2026-06-19T12:00:00.000Z"
  }
}
```

Use `accessToken` in `Authorization: Bearer ...` for protected requests. The `token` field is kept as a compatibility alias for older lessons.

When the access token expires, send the refresh token to rotate both tokens:

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "refresh_..."
}
```

After refresh succeeds, store the new `accessToken` and new `refreshToken`, then discard the old ones. Use `GET /auth/session` to check whether a stored access token is still valid, and `POST /auth/logout` to revoke the current token pair.

If optional authenticator 2FA is enabled, login returns a challenge instead of a token:

```json
{
  "data": {
    "requiresTwoFactor": true,
    "challengeId": "2fa_abc123",
    "expiresAt": "2026-05-03T14:55:00.000Z"
  }
}
```

The demo user starts with PIN `1234`. The admin starts with password `admin123`.

### Optional Authenticator 2FA

Start setup while authenticated:

```http
POST /auth/2fa/setup
Authorization: Bearer demo-user-token
```

Show the returned `otpauthUri` as a QR code in the Expo app. Then enable 2FA with the 6-digit code from the authenticator app:

```http
POST /auth/2fa/enable
Authorization: Bearer demo-user-token
Content-Type: application/json

{
  "code": "123456"
}
```

When login returns `requiresTwoFactor`, complete login with:

```http
POST /auth/2fa/verify
Content-Type: application/json

{
  "challengeId": "2fa_abc123",
  "code": "123456"
}
```

### KYC

```http
POST /auth/kyc
Authorization: Bearer demo-user-token
Content-Type: application/json

{
  "legalName": "Ada Student",
  "country": "Nigeria",
  "documentType": "national_id",
  "documentNumber": "NIN-000-000",
  "selfieImageUrl": "https://example.com/uploads/ada-selfie.jpg",
  "documentImageUrl": "https://example.com/uploads/ada-national-id.jpg"
}
```

`selfieImageUrl` and `documentImageUrl` are optional URL fields for classroom demos. In a production app, these would normally come from a secure upload service instead of arbitrary public URLs.

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

Supported asset logos are served by this backend at `/assets/:symbol.svg`, for example `/assets/btc.svg`. The seeded `iconUrl` fields already point to those backend-hosted SVG files so every student app uses the same visuals. The bundled SVGs are sourced from [CryptoLogos](https://cryptologos.cc/).

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

## Expo Push Notifications

Expo mobile apps should request notification permission, get an Expo push token, and register it with the API:

```http
POST /me/devices
Authorization: Bearer demo-user-token
Content-Type: application/json

{
  "expoPushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "ios"
}
```

The API always creates in-app notifications in `GET /me/notifications`. Real Expo push delivery is optional and only runs when `ENABLE_PUSH_NOTIFICATIONS=true` is set on the backend. Current push triggers include KYC review, withdrawal review, completed deposits, completed trades, and triggered price alerts.

`GET /wallet` returns balances and total portfolio value.

`POST /wallet/deposit/simulate` creates a pending fake USD deposit so students can test polling and status updates without real payments.

```http
POST /wallet/deposit/simulate
Authorization: Bearer demo-user-token
Content-Type: application/json

{
  "amount": 500,
  "settlementDelaySeconds": 5
}
```

The response includes a `pollingUrl`. Poll that transaction until its `status` changes from `pending` to `completed`; then refresh `GET /wallet` to show the credited balance.

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

Use `GET /me` for profile data and `PATCH /me` for editable profile fields. Profile updates use the same validation rules as registration: names must be 2-80 characters, phone numbers must use international format such as `+2348010000001`, and avatar URLs must be http(s) URLs or API storage paths.

Use `GET /me/settings` and `PATCH /me/settings` for language, fiat currency, theme, push notification, price alert, and biometric preferences.

Use `GET /me/notifications` to populate the notifications screen.

## Data Fetching Lessons

The API now includes common mobile data fetching patterns:

- `GET /market/assets?page=1&limit=10&search=btc&sort=priceUsd&order=desc`
- `GET /wallet/transactions?page=1&limit=20&type=buy&status=completed`
- `GET /wallet/portfolio/history?range=1M`
- `GET /trade/quotes/:quoteId`

These endpoints help students practice search inputs, filters, infinite scroll, chart ranges, countdown timers, and refetching expired quote data.

## Validation Rules

Mutation endpoints validate request bodies consistently:

- strings must be meaningful and within route-specific length limits
- email and phone fields must use valid formats
- numeric fields must be JSON numbers, not strings like `"500"`
- booleans must be real booleans, not `"true"` or `"false"` strings
- enum fields must match the documented values
- asset symbols must use uppercase ticker-like values such as `BTC`
- withdrawal addresses must look like blockchain addresses
- image and avatar URLs must be http(s) URLs or demo `/storage/files/...` paths

Validation errors use the normal error wrapper with a clear `code` and `message`, so mobile screens can show field errors and keep invalid submissions out of the app state.

## Price Alerts

Students can build a price-alert form and list screen:

```http
POST /me/price-alerts
Authorization: Bearer demo-user-token
Content-Type: application/json

{
  "assetSymbol": "BTC",
  "direction": "above",
  "targetPriceUsd": 72000
}
```

Use `GET /me/price-alerts`, `PATCH /me/price-alerts/:alertId`, and `DELETE /me/price-alerts/:alertId` for the rest of the CRUD flow. Active alerts trigger automatically when simulated market prices cross the target, then the API creates a `price_alert` notification.

## KYC Upload Storage

KYC uploads use a storage URL flow. In local teaching mode, the API returns demo `/storage/...` URLs. When Cloudinary is configured, the same endpoint returns signed direct-upload instructions for Cloudinary and places files in per-user folders:

```text
kyc/<userId>/<documentKind>
```

Configure Cloudinary with either `CLOUDINARY_URL` or the split variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. You can override the root folder with `CLOUDINARY_KYC_FOLDER`.

```http
POST /auth/kyc/uploads
Authorization: Bearer demo-user-token
Content-Type: application/json

{
  "fileName": "student-national-id.png",
  "contentType": "image/png",
  "documentKind": "document_front"
}
```

The response returns `uploadUrl`, `method`, and either demo headers or Cloudinary `formFields`. In the mobile app, request upload instructions, upload the file, then submit the resulting Cloudinary `secure_url` or demo `publicUrl` in `POST /auth/kyc`.

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
- KYC file storage
- price alert triggers
- notifications

In production, these would connect to providers such as custody services, blockchain RPC/indexing providers, KYC vendors, payment providers, and internal risk systems.

## Persistence Layer

The project now uses Prisma Client with a local SQLite database. The route handlers still use a small in-memory domain store while requests are being processed, then successful mutations are saved to SQLite. On startup, the server hydrates that store from SQLite.

This is a teaching bridge. It lets students see persistence without forcing every lesson to start with advanced repository patterns. A later refactor can move each route to direct Prisma queries and database transactions.
