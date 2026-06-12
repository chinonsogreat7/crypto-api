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
    "message": "Insufficient balance.",
    "requestId": "2eb23e65-7c23-4c51-bcbf-7bb2ad2a815e"
  }
}
```

Successful responses use a `data` wrapper:

```json
{
  "data": {},
  "meta": {
    "requestId": "2eb23e65-7c23-4c51-bcbf-7bb2ad2a815e"
  }
}
```

List responses include `meta` with the request ID. Paginated list responses also include counts and page details:

```json
{
  "data": [],
  "meta": {
    "requestId": "2eb23e65-7c23-4c51-bcbf-7bb2ad2a815e",
    "count": 0,
    "total": 0,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

## Screen-To-Endpoint Map

| Screen or flow | Endpoint(s) |
| --- | --- |
| Splash and onboarding | Static app content for now |
| Sign up validation | `POST /auth/validate-signup` |
| Sign up | `POST /auth/register` |
| Sign in | `POST /auth/login` |
| Session refresh, check, and logout | `POST /auth/refresh`, `GET /auth/session`, `POST /auth/logout` |
| OTP | `POST /auth/otp/request`, `POST /auth/otp/verify` |
| KYC submission | `POST /auth/kyc` |
| Home dashboard | `GET /wallet`, `GET /market/trending`, `GET /me/notifications` |
| Market list | `GET /market/assets` |
| Asset details | `GET /market/assets/:symbol` |
| Live market prices | `GET /market/prices` |
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
| Push devices | `GET /me/devices`, `POST /me/devices`, `DELETE /me/devices/:deviceId` |
| Notifications | `GET /me/notifications`, `PATCH /me/notifications/:notificationId/read`, `PATCH /me/notifications/read-all` |
| Admin dashboard | `GET /admin/dashboard` |
| Admin users | `GET /admin/users`, `GET /admin/users/:userId` |
| Admin KYC review | `GET /admin/kyc`, `PATCH /admin/kyc/:kycId` |
| Admin withdrawals | `GET /admin/withdrawals`, `PATCH /admin/withdrawals/:withdrawalId` |
| Admin assets and fees | `GET /admin/assets`, `POST /admin/assets`, `PATCH /admin/assets/:symbol`, `PATCH /admin/fees` |
| Admin audit trail | `GET /admin/audit-logs` |

## Auth Flow

### Validate Signup Fields

Use this before submitting the full registration form so the app can show field-level feedback while the student is still on the signup screen.

```http
POST /auth/validate-signup
Content-Type: application/json

{
  "email": "ada@example.com",
  "phone": "+2348010000001"
}
```

You may send only `email`, only `phone`, or both. The endpoint uses the same normalization and validation rules as `POST /auth/register`.

```json
{
  "data": {
    "email": {
      "value": "ada@example.com",
      "normalized": "ada@example.com",
      "valid": true,
      "available": true,
      "code": "AVAILABLE",
      "message": "Email is available."
    },
    "phone": {
      "value": "+2348010000001",
      "normalized": "+2348010000001",
      "valid": true,
      "available": false,
      "code": "PHONE_EXISTS",
      "message": "A user with this phone number already exists."
    },
    "canRegister": false
  }
}
```

Frontend rule: enable the final Create Account button only when every field returned has `valid: true` and `available: true`. Still keep the normal `POST /auth/register` error handling, because another user could register the same email or phone after your validation request.

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

Registration does not return an access token or refresh token. The user must verify their email first:

```json
{
  "data": {
    "user": {
      "id": "usr_...",
      "email": "ada@example.com",
      "emailVerified": false
    },
    "emailVerificationRequired": true,
    "nextStep": "verify_email",
    "otp": {
      "requestPath": "/auth/otp/request",
      "verifyPath": "/auth/otp/verify",
      "expiresInSeconds": 300
    }
  }
}
```

After registration, call `POST /auth/otp/request`, then `POST /auth/otp/verify` with the demo OTP code. OTP verification marks the email as verified and returns the first token pair for that newly verified account. Login is blocked with `EMAIL_NOT_VERIFIED` until this step is complete.

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

Successful email verification, login, and 2FA verify responses return both a short-lived access token and a longer-lived refresh token:

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
    "attemptsRemaining": 5,
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

The enable response returns one-time recovery codes. Show them once and ask the student to store them somewhere safe:

```json
{
  "data": {
    "enabled": true,
    "recoveryCodes": ["A1B2C-D3E4F", "8A9B0-C1D2E"],
    "recoveryCodeCount": 8
  }
}
```

The API stores recovery codes as hashes, so it cannot return the original codes later. Use the status endpoint to decide what to show in the security screen:

```http
GET /auth/2fa/status
Authorization: Bearer demo-user-token
```

```json
{
  "data": {
    "twoFactorEnabled": true,
    "twoFactorSetupStarted": true,
    "recoveryCodesConfigured": true,
    "recoveryCodesRemaining": 8
  }
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

If the user loses their authenticator app, they can send one unused recovery code instead:

```http
POST /auth/2fa/verify
Content-Type: application/json

{
  "challengeId": "2fa_abc123",
  "recoveryCode": "A1B2C-D3E4F"
}
```

Invalid 2FA attempts reduce `attemptsRemaining`; after 5 bad attempts, the challenge is removed and the user must start login again. Regenerate recovery codes with `POST /auth/2fa/recovery-codes/regenerate` while authenticated, using the password plus a current authenticator code. Regeneration invalidates all old recovery codes.

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
  "documentImageUrl": "https://example.com/uploads/ada-national-id-front.jpg",
  "documentBackImageUrl": "https://example.com/uploads/ada-national-id-back.jpg"
}
```

`selfieImageUrl` and `documentImageUrl` are required. `documentImageUrl` is the front of the ID document. `documentBackImageUrl` is optional and should be sent when the selected document has a back side. In production-style flows, these URLs should come from the KYC upload flow instead of arbitrary public URLs.

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

## Live Market Prices

By default, the backend refreshes supported asset prices from CoinGecko and all wallet values, trade quotes, market lists, and admin asset screens read from those same prices. If the live provider is unavailable, the API falls back to the classroom price simulator so lessons and demos keep working.

Market source details are returned in `meta.market`:

```json
{
  "mode": "live_market",
  "source": "CoinGecko simple price API",
  "lastUpdatedAt": "2026-06-03T10:00:00.000Z",
  "tickIntervalMs": 60000,
  "lastError": null
}
```

Set `MARKET_PRICE_SOURCE=simulated` if you intentionally want the older classroom-only simulator. You can also set `MARKET_LIVE_REFRESH_INTERVAL_MS`, `COINGECKO_API_KEY`, or `COINGECKO_PRO_API_KEY` in deployment.

Supported asset logos are served by this backend at `/assets/:symbol.svg`, for example `/assets/btc.svg`. The seeded `iconUrl` fields already point to those backend-hosted SVG files so every student app uses the same visuals. The bundled SVGs are sourced from [CryptoLogos](https://cryptologos.cc/).

Use `GET /market/assets?include=sparkline` when building list rows that need small chart previews. This avoids the N+1 request pattern where a screen fetches `/market/assets` and then calls `/market/assets/:symbol` for every coin just to draw row charts. `GET /market/trending` includes the same lightweight `sparkline` data by default for home screens and top-coin sections. Keep `GET /market/assets/:symbol` for the full detail screen chart.

Trade screens that look like an exchange can use these market-data endpoints:

- `GET /market/assets/:symbol/candles?interval=1m&limit=50` for candlestick charts
- `GET /market/assets/:symbol/order-book?levels=12` for bid and ask rows
- `GET /market/assets/:symbol/trades?limit=30` for recent market trades

These endpoints are still REST/polling friendly. For a beginner class, poll them using `meta.market.tickIntervalMs`; later, they can be upgraded to Server-Sent Events or WebSockets without changing the quote and execution flow.

Asset detail screens should use `GET /market/assets/:symbol`. In addition to the base asset record and chart points, the response includes derived `stats` such as `marketCapUsd`, `volume24hUsd`, `circulatingSupply`, `maxSupply`, `allTimeHighUsd`, `high24hUsd`, `low24hUsd`, `about`, `websiteUrl`, and `explorerUrl`. Prices and 24h change come from the live feed when available; supply/about metadata is still classroom-friendly reference data.

Students can poll this endpoint from the mobile app:

```http
GET /market/prices
```

The response includes `meta.market.lastUpdatedAt` and `meta.market.tickIntervalMs`, so students can show when prices were last refreshed and choose a sensible polling interval.

For real-time list prices and chart refreshes, use the Server-Sent Events stream:

```http
GET /market/stream
Accept: text/event-stream
```

The stream emits `prices` events with the same row shape as `/market/prices`. On mobile, this can power moving prices and sparklines without firing one request per asset. Use REST for quotes/trades, and use the stream only for market display data.

For market list screens, use `GET /market/trending`. It includes row `sparkline` data by default and returns `meta.featured` for the hero card:

```json
{
  "meta": {
    "featured": {
      "type": "top_gainer",
      "symbol": "SOL",
      "name": "Solana",
      "priceUsd": 152,
      "change24h": 4.2,
      "reason": "Highest 24h percentage gain among active assets"
    }
  }
}
```

That means the green “Top Gainer” card in the design should come from `meta.featured`, while the list rows should come from `data`.

The API still does not execute real exchange trades. The live feed is for display, quotes, and classroom realism; buy/sell/swap execution remains sandboxed.

## Verification Levels And Limits

KYC is an in-app flow, not part of account creation. Users can register, sign in, browse markets, view wallets, and learn the app before submitting identity documents. The current verification state is returned from `GET /me` as both `kycStatus` and a richer `verification` object with the user's tier, level, feature flags, and transaction limits.

The sandbox uses these teaching tiers:

| Tier | KYC status | What it allows |
| --- | --- | --- |
| Starter | `not_started` or `rejected` | Browse markets and create small sandbox deposits up to $100. Trading and withdrawals are locked. |
| Review in progress | `pending` | User has submitted KYC. Sandbox deposits are allowed up to $250 while trade and withdrawal stay locked. |
| Verified | `approved` | Trading up to $5,000 per quote, withdrawals up to $2,500 per request, and sandbox deposits up to $10,000. |

Use the `verification` object to drive UI gates. For example, Trade and Withdraw screens should show a verification-required prompt when `canTrade` or `canWithdraw` is false, and should show limit messaging when an amount is above the returned limit.

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
Idempotency-Key: trade-confirm-001
Content-Type: application/json

{
  "quoteId": "quote_example",
  "pin": "1234"
}
```

This design teaches an important fintech concept: the preview step and execution step should be separate because rates and fees can expire.

## Retry Safety And Rate Limits

Sensitive mutation routes support `Idempotency-Key` so mobile apps can safely retry after a network timeout without creating duplicate records:

- `POST /trade/execute`
- `POST /wallet/deposit/simulate`
- `POST /wallet/withdrawals`
- `POST /auth/kyc`

Use a unique key per user action. If the same key and same request body are sent again, the API replays the original successful response. If the same key is reused with a different body, the API returns `409 IDEMPOTENCY_KEY_CONFLICT`.

Abuse-sensitive endpoints also have lightweight classroom rate limits: login, registration, refresh, OTP, 2FA verification, KYC upload creation, quote creation, trade execution, simulated deposits, and withdrawal requests. When a client exceeds a limit, the API returns `429 RATE_LIMITED` with `retryAfterSeconds`.

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

List registered devices:

```http
GET /me/devices
Authorization: Bearer demo-user-token
```

Remove a device when a user logs out of a device or disables push on that device:

```http
DELETE /me/devices/device_abc123
Authorization: Bearer demo-user-token
```

The API always creates in-app notifications in `GET /me/notifications`. Real Expo push delivery is optional and only runs when `ENABLE_PUSH_NOTIFICATIONS=true` is set on the backend. Current push triggers include KYC review, withdrawal review, completed deposits, completed trades, and triggered price alerts.

`GET /wallet` returns balances, `portfolioValueUsd`, and a display-currency portfolio value using the user's selected `fiatCurrency` from settings. For example, if settings use `EUR`, the response includes `portfolioValue` and `portfolioCurrency: "EUR"` while still keeping the USD value for compatibility.

`POST /wallet/deposit/simulate` creates a pending fake USDT deposit so students can test polling and status updates without real payments.

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

Use `GET /me/settings` and `PATCH /me/settings` for language, fiat currency, theme, push notification, and biometric preferences. Supported fiat display currencies are `USD`, `NGN`, `EUR`, `GBP`, `CAD`, `AUD`, `JPY`, and `CHF`.

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

Use `GET /me/price-alerts`, `PATCH /me/price-alerts/:alertId`, and `DELETE /me/price-alerts/:alertId` for the rest of the CRUD flow. Active alerts trigger automatically when market prices cross the target, then the API creates a `price_alert` notification.

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
- inspect immutable audit logs for admin actions

Admin list endpoints now accept backend pagination and filters. Add `page` and `limit` to page server-side, and use `q` for text search on users, KYC, transactions, withdrawals, assets, and audit logs. Status-style filters are supported where they make sense, for example `GET /admin/kyc?status=pending&page=1&limit=20`, `GET /admin/users?kycStatus=approved`, `GET /admin/withdrawals?status=pending`, and `GET /admin/audit-logs?action=kyc.review`.

Admin mutations that approve KYC, review withdrawals, create or pause assets, or update fees write audit records with the actor, action, entity, old value, new value, request ID, IP, user agent, and timestamp. Fetch them with:

```http
GET /admin/audit-logs?page=1&limit=20
Authorization: Bearer demo-admin-token
```

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
