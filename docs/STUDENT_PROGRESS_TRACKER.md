# Student API And Figma Progress Tracker

Use this document as the format for student progress reports. Fill the tables directly so every submission is easy to compare.

## Student Summary

| Field | Response |
| --- | --- |
| Student/team name |  |
| App repo/link |  |
| Figma file/page used |  |
| Current completion percentage |  |
| Date submitted |  |
| Main blocker |  |

## Status Labels

Use these exact labels in the `Status` column.

| Status | Meaning |
| --- | --- |
| Not started | No UI or API work yet |
| UI only | Screen exists but no real API integration |
| API connected | Screen fetches/submits real API data |
| States handled | Loading, empty, error, and success states are handled |
| Complete | UI, API, validation, states, and navigation are working |

## Figma Reference

| Design area | Figma group/page | Status | Notes |
| --- | --- | --- | --- |
| Auth | `Auth States / Updated` |  |  |
| Home | `Home States / Updated` |  |  |
| KYC | `KYC In-App Flow / Updated` |  |  |
| KYC gates | `KYC Entry Points / Gates` |  |  |
| Market | `Market Flow / Updated` |  |  |
| Trade | `Trade Flow / Updated` |  |  |
| Wallet | `Wallet Flow / Updated` |  |  |
| Profile/security | `Profile Security Flow / Updated` |  |  |

Design rule: match the existing Figma style. Do not create a new design system, and do not build admin screens in the mobile app.

## Main Tabs

| Tab | Implemented? | API connected? | Notes |
| --- | --- | --- | --- |
| Home |  |  |  |
| Market |  |  |  |
| Trade |  |  |  |
| Wallet |  |  |  |
| Profile |  |  |  |

## Screen Progress

| Flow | Screen | Expected API endpoint(s) | Status | Tested states | Remaining work |
| --- | --- | --- | --- | --- | --- |
| Auth | Register | `POST /auth/validate-signup`, `POST /auth/register` |  |  |  |
| Auth | OTP verification | `POST /auth/otp/request`, `POST /auth/otp/verify` |  |  |  |
| Auth | Login | `POST /auth/login` |  |  |  |
| Auth | Session handling | `POST /auth/refresh`, `GET /auth/session`, `POST /auth/logout` |  |  |  |
| Security | 2FA setup | `POST /auth/2fa/setup`, `POST /auth/2fa/enable` |  |  |  |
| Security | 2FA status/recovery | `GET /auth/2fa/status`, `POST /auth/2fa/recovery-codes/regenerate`, `POST /auth/2fa/disable` |  |  |  |
| Home | Dashboard | `GET /wallet`, `GET /market/trending`, `GET /me/notifications` |  |  |  |
| KYC | Start/status | `GET /me` |  |  |  |
| KYC | Upload file | `POST /auth/kyc/uploads` |  |  | Use multipart `file` upload |
| KYC | Submit review | `POST /auth/kyc` |  |  |  |
| Market | Asset list | `GET /market/assets`, `GET /market/assets?include=sparkline` |  |  |  |
| Market | Trending | `GET /market/trending` |  |  |  |
| Market | Asset details | `GET /market/assets/:symbol` |  |  |  |
| Market | Live prices | `GET /market/prices`, `GET /market/stream` |  |  |  |
| Market | Charts/order book/trades | `GET /market/assets/:symbol/candles`, `GET /market/assets/:symbol/order-book`, `GET /market/assets/:symbol/trades` |  |  |  |
| Market | Watchlist | `GET /me/watchlist`, `POST /me/watchlist/:symbol`, `DELETE /me/watchlist/:symbol` |  |  |  |
| Wallet | Overview | `GET /wallet` |  |  |  |
| Wallet | Portfolio history | `GET /wallet/portfolio/history` |  |  |  |
| Wallet | Deposit address | `GET /wallet/deposit-addresses`, `GET /wallet/deposit-addresses/:symbol` |  |  |  |
| Wallet | Sandbox deposit | `POST /wallet/deposit/simulate` |  |  |  |
| Wallet | Internal transfer | `POST /wallet/transfers` |  |  |  |
| Wallet | Withdrawal | `POST /wallet/withdrawals` |  |  |  |
| Wallet | Transaction history/detail | `GET /wallet/transactions`, `GET /wallet/transactions/:transactionId` |  |  |  |
| Trade | Quote form | `POST /trade/quotes` |  |  |  |
| Trade | Quote preview/expiry | `GET /trade/quotes/:quoteId` |  |  |  |
| Trade | PIN confirmation/receipt | `POST /trade/execute` |  |  |  |
| Profile | Profile overview/edit | `GET /me`, `PATCH /me` |  |  |  |
| Profile | Settings/PIN | `GET /me/settings`, `PATCH /me/settings`, `PATCH /me/pin` |  |  |  |
| Profile | Devices | `GET /me/devices`, `POST /me/devices`, `DELETE /me/devices/:deviceId` |  |  |  |
| Profile | Price alerts | `GET /me/price-alerts`, `POST /me/price-alerts`, `PATCH /me/price-alerts/:alertId`, `DELETE /me/price-alerts/:alertId` |  |  |  |
| Profile | Notifications | `GET /me/notifications`, `PATCH /me/notifications/:notificationId/read`, `PATCH /me/notifications/read-all` |  |  |  |

## API Checklist

### System And Setup

| Task | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| Check API health | `GET /health` |  |  |
| Load API docs | `GET /docs` |  |  |
| Load OpenAPI file | `GET /openapi.yaml` |  |  |
| Load crypto icons | `GET /assets/:fileName` |  |  |

### Authentication

| Task | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| Validate signup email/phone | `POST /auth/validate-signup` |  |  |
| Register account | `POST /auth/register` |  | Register does not return tokens |
| Request email OTP | `POST /auth/otp/request` |  |  |
| Verify email OTP and receive tokens | `POST /auth/otp/verify` |  | First token pair is returned here |
| Login | `POST /auth/login` |  | Login is blocked until email is verified |
| Refresh tokens | `POST /auth/refresh` |  |  |
| Check current session | `GET /auth/session` |  |  |
| Logout | `POST /auth/logout` |  |  |

### 2FA And Security

| Task | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| Start 2FA setup | `POST /auth/2fa/setup` |  | Creates and stores a pending secret |
| Show 2FA status | `GET /auth/2fa/status` |  | Does not return actual recovery codes |
| Enable 2FA | `POST /auth/2fa/enable` |  | Shows recovery codes once |
| Verify login 2FA challenge | `POST /auth/2fa/verify` |  | Accepts authenticator code or recovery code |
| Regenerate recovery codes | `POST /auth/2fa/recovery-codes/regenerate` |  | Invalidates old codes |
| Disable 2FA | `POST /auth/2fa/disable` |  |  |
| Update transaction PIN | `PATCH /me/pin` |  |  |

### KYC

| Task | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| Upload selfie image | `POST /auth/kyc/uploads` |  | Required multipart `file` upload |
| Upload document front image | `POST /auth/kyc/uploads` |  | Required multipart `file` upload |
| Upload document back image | `POST /auth/kyc/uploads` |  | Optional multipart `file` upload |
| Submit KYC | `POST /auth/kyc` |  | KYC happens inside the app, not during account creation |

### Market

| Task | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| Asset list | `GET /market/assets` |  |  |
| Asset list with sparklines | `GET /market/assets?include=sparkline` |  | Avoids N+1 chart requests |
| Trending assets | `GET /market/trending` |  | Includes hero/top-gainer metadata |
| Live prices | `GET /market/prices` |  |  |
| Live price stream | `GET /market/stream` |  | SSE stream |
| Asset details | `GET /market/assets/:symbol` |  |  |
| Candlestick chart | `GET /market/assets/:symbol/candles` |  |  |
| Order book | `GET /market/assets/:symbol/order-book` |  |  |
| Recent market trades | `GET /market/assets/:symbol/trades` |  |  |
| Watchlist list | `GET /me/watchlist` |  |  |
| Add to watchlist | `POST /me/watchlist/:symbol` |  |  |
| Remove from watchlist | `DELETE /me/watchlist/:symbol` |  |  |

### Wallet

| Task | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| Wallet overview | `GET /wallet` |  |  |
| Portfolio history | `GET /wallet/portfolio/history` |  |  |
| Deposit address list | `GET /wallet/deposit-addresses` |  |  |
| Deposit address detail | `GET /wallet/deposit-addresses/:symbol` |  |  |
| Simulate sandbox deposit | `POST /wallet/deposit/simulate` |  | Use USDT |
| Request withdrawal | `POST /wallet/withdrawals` |  | Requires KYC limits |
| Transaction history | `GET /wallet/transactions` |  |  |
| Transaction detail | `GET /wallet/transactions/:transactionId` |  |  |

### Trade

| Task | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| Create quote | `POST /trade/quotes` |  | Quote-first flow |
| Get quote detail/expiry | `GET /trade/quotes/:quoteId` |  | Show expired state |
| Execute quote with PIN | `POST /trade/execute` |  | Use `Idempotency-Key` |

### Profile And Settings

| Task | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| Profile overview | `GET /me` |  |  |
| Edit profile | `PATCH /me` |  |  |
| Get settings | `GET /me/settings` |  |  |
| Update settings | `PATCH /me/settings` |  |  |
| List devices | `GET /me/devices` |  |  |
| Register device token | `POST /me/devices` |  |  |
| Delete device | `DELETE /me/devices/:deviceId` |  |  |
| List price alerts | `GET /me/price-alerts` |  |  |
| Create price alert | `POST /me/price-alerts` |  |  |
| Update price alert | `PATCH /me/price-alerts/:alertId` |  |  |
| Delete price alert | `DELETE /me/price-alerts/:alertId` |  |  |
| List notifications | `GET /me/notifications` |  |  |
| Mark one notification read | `PATCH /me/notifications/:notificationId/read` |  |  |
| Mark all notifications read | `PATCH /me/notifications/read-all` |  |  |

## UI State Checklist

| Area | Loading | Empty | Error | Success | Auth blocked | KYC/limit blocked | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth |  |  |  |  |  |  |  |
| KYC |  |  |  |  |  |  |  |
| Home |  |  |  |  |  |  |  |
| Market |  |  |  |  |  |  |  |
| Wallet |  |  |  |  |  |  |  |
| Trade |  |  |  |  |  |  |  |
| Profile |  |  |  |  |  |  |  |
| Notifications |  |  |  |  |  |  |  |

## Milestone Tracker

| Milestone | Required work | Status | Evidence/link | Remaining work |
| --- | --- | --- | --- | --- |
| 1. Auth foundation | Register, OTP verification, login, token storage, logout |  |  |  |
| 2. Home and market | Home dashboard, market list, asset details, watchlist, live prices |  |  |  |
| 3. Wallet | Wallet overview, portfolio chart, deposit QR/copy, sandbox deposit, transaction history/detail |  |  |  |
| 4. KYC and limits | KYC status, uploads, submit KYC, pending/rejected/approved states, limit blocks |  |  |  |
| 5. Trade | Buy/sell/swap form, quote preview, expiry, PIN confirmation, receipt |  |  |  |
| 6. Profile and security | Profile, settings, 2FA, devices, price alerts, notifications |  |  |  |

## Final Demo Checklist

| Demo requirement | Done? | Notes |
| --- | --- | --- |
| Register -> verify email -> login |  |  |
| Browse market list and asset details |  |  |
| Add/remove watchlist asset |  |  |
| View wallet and transaction history |  |  |
| Start KYC and submit required images |  |  |
| Create a trade quote and handle expiry |  |  |
| Execute a trade with PIN when allowed |  |  |
| Create/edit/delete price alerts |  |  |
| View notifications and mark them read |  |  |
| Show 2FA status and device list |  |  |

## Remaining Work Summary

| Area | Done | Remaining | Blocker | Help needed from instructor |
| --- | --- | --- | --- | --- |
| Auth |  |  |  |  |
| KYC |  |  |  |  |
| Market |  |  |  |  |
| Wallet |  |  |  |  |
| Trade |  |  |  |  |
| Profile |  |  |  |  |
| Notifications |  |  |  |  |
| UI states |  |  |  |  |
| Figma matching |  |  |  |  |
