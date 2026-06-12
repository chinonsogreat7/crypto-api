# Student API And Figma Progress Tracker

Use this guide to report your implementation progress. Your report should show what screens you have built, which API endpoints are connected, what states you tested, and what is still remaining.

## Submission Format

Each student or team should submit progress in this format:

```md
## Student/Team
Name:
App repo/link:
Figma reference used:
Current completion: __%

## Completed Screens
- Auth / Login: done, connected to POST /auth/login
- Market / Asset Details: UI done, API not connected yet

## Completed API Integrations
- POST /auth/login: done
- GET /market/assets: done
- POST /trade/quotes: in progress

## Tested States
- Loading: yes/no
- Empty: yes/no
- Error: yes/no
- Success: yes/no
- Authenticated/unauthenticated: yes/no

## What Is Remaining
- Add KYC upload flow
- Add trade PIN confirmation
- Add notification read state

## Blockers
- I do not understand how to use Idempotency-Key
- I need help with SSE market stream
```

## Figma Reference

Use the shared Figma crypto trading mobile app file as the visual reference. Do not create a new design system. Match the existing style, spacing, bottom tabs, dark theme, crypto cards, chart style, inputs, and buttons.

Known design groups from our current design work:

- `Auth States / Updated`
- `Home States / Updated`
- `KYC In-App Flow / Updated`
- `KYC Entry Points / Gates`
- `Market Flow / Updated`
- `Trade Flow / Updated`
- `Wallet Flow / Updated`
- `Profile Security Flow / Updated`

Main app tabs:

- Home
- Market
- Trade
- Wallet
- Profile

Do not build admin screens in the mobile app.

## Completion Rubric

Use these labels when reporting each screen or flow:

| Status | Meaning |
| --- | --- |
| Not started | No UI or API work yet |
| UI only | Screen exists but no real API integration |
| API connected | Screen fetches/submits real API data |
| States handled | Loading, empty, error, and success states are handled |
| Complete | UI, API, validation, states, and navigation are working |

## API Progress Checklist

### 1. System And Setup

| Task | Endpoint | Status |
| --- | --- | --- |
| Check API health | `GET /health` |  |
| Load API docs | `GET /docs` |  |
| Load OpenAPI file | `GET /openapi.yaml` |  |
| Load crypto icons | `GET /assets/:fileName` |  |

### 2. Authentication

| Task | Endpoint | Status |
| --- | --- | --- |
| Validate signup email/phone | `POST /auth/validate-signup` |  |
| Register account | `POST /auth/register` |  |
| Request email OTP | `POST /auth/otp/request` |  |
| Verify email OTP and receive tokens | `POST /auth/otp/verify` |  |
| Login | `POST /auth/login` |  |
| Refresh tokens | `POST /auth/refresh` |  |
| Check current session | `GET /auth/session` |  |
| Logout | `POST /auth/logout` |  |

Important auth notes:

- Register does not return tokens.
- Email OTP verification returns the first token pair.
- Login is blocked until email is verified.
- Store `accessToken` and `refreshToken` securely.

### 3. 2FA And Security

| Task | Endpoint | Status |
| --- | --- | --- |
| Start 2FA setup | `POST /auth/2fa/setup` |  |
| Show 2FA status | `GET /auth/2fa/status` |  |
| Enable 2FA | `POST /auth/2fa/enable` |  |
| Verify login 2FA challenge | `POST /auth/2fa/verify` |  |
| Regenerate recovery codes | `POST /auth/2fa/recovery-codes/regenerate` |  |
| Disable 2FA | `POST /auth/2fa/disable` |  |
| Update transaction PIN | `PATCH /me/pin` |  |

Important 2FA notes:

- Recovery codes are shown only when enabling or regenerating them.
- The API does not return existing recovery codes later because it stores only hashed codes.
- Use `GET /auth/2fa/status` to know whether recovery codes exist and how many remain.

### 4. KYC

| Task | Endpoint | Status |
| --- | --- | --- |
| Create upload instructions | `POST /auth/kyc/uploads` |  |
| Upload selfie/front/back image | Cloudinary or demo upload URL |  |
| Submit KYC | `POST /auth/kyc` |  |

KYC submission requirements:

- `selfieImageUrl` is required.
- `documentImageUrl` is required and represents the front of the document.
- `documentBackImageUrl` is optional.
- KYC happens inside the app, not during account creation.
- Trading and withdrawals are limited until KYC is approved.

### 5. Home

| Screen data | Endpoint | Status |
| --- | --- | --- |
| Portfolio summary | `GET /wallet` |  |
| Trending assets | `GET /market/trending` |  |
| Recent notifications | `GET /me/notifications` |  |
| Recent transactions | `GET /wallet/transactions` |  |

Expected states:

- Loading dashboard
- Empty wallet
- KYC/limit prompt
- Network error

### 6. Market

| Task | Endpoint | Status |
| --- | --- | --- |
| Asset list | `GET /market/assets` |  |
| Asset list with sparklines | `GET /market/assets?include=sparkline` |  |
| Trending assets | `GET /market/trending` |  |
| Live prices | `GET /market/prices` |  |
| Live price stream | `GET /market/stream` |  |
| Asset details | `GET /market/assets/:symbol` |  |
| Candlestick chart | `GET /market/assets/:symbol/candles` |  |
| Order book | `GET /market/assets/:symbol/order-book` |  |
| Recent market trades | `GET /market/assets/:symbol/trades` |  |
| Watchlist list | `GET /me/watchlist` |  |
| Add to watchlist | `POST /me/watchlist/:symbol` |  |
| Remove from watchlist | `DELETE /me/watchlist/:symbol` |  |

Expected states:

- Loading list
- Empty search
- Asset paused/not found
- Positive and negative price movement
- Sparkline/chart rendered

### 7. Wallet

| Task | Endpoint | Status |
| --- | --- | --- |
| Wallet overview | `GET /wallet` |  |
| Portfolio history | `GET /wallet/portfolio/history` |  |
| Deposit address list | `GET /wallet/deposit-addresses` |  |
| Deposit address detail | `GET /wallet/deposit-addresses/:symbol` |  |
| Simulate sandbox deposit | `POST /wallet/deposit/simulate` |  |
| Request withdrawal | `POST /wallet/withdrawals` |  |
| Transaction history | `GET /wallet/transactions` |  |
| Transaction detail | `GET /wallet/transactions/:transactionId` |  |

Expected states:

- Empty balance
- Deposit pending
- Deposit completed
- Withdrawal validation error
- KYC limit blocked
- Transaction detail receipt

### 8. Trade

| Task | Endpoint | Status |
| --- | --- | --- |
| Create quote | `POST /trade/quotes` |  |
| Get quote detail/expiry | `GET /trade/quotes/:quoteId` |  |
| Execute quote with PIN | `POST /trade/execute` |  |

Trade flow:

```text
Trade form -> Quote preview -> Confirm with transaction PIN -> Receipt
```

Important trade notes:

- Do not execute directly from the first form.
- Always show quote preview first.
- Sensitive execute requests should send an `Idempotency-Key`.
- Handle quote expiry and show “Get new quote”.

Expected states:

- Quote loading
- Quote expired
- Invalid amount
- KYC/limit blocked
- Incorrect PIN
- Success receipt
- Failure receipt

### 9. Profile And Settings

| Task | Endpoint | Status |
| --- | --- | --- |
| Profile overview | `GET /me` |  |
| Edit profile | `PATCH /me` |  |
| Get settings | `GET /me/settings` |  |
| Update settings | `PATCH /me/settings` |  |
| List devices | `GET /me/devices` |  |
| Register device token | `POST /me/devices` |  |
| Delete device | `DELETE /me/devices/:deviceId` |  |
| List price alerts | `GET /me/price-alerts` |  |
| Create price alert | `POST /me/price-alerts` |  |
| Update price alert | `PATCH /me/price-alerts/:alertId` |  |
| Delete price alert | `DELETE /me/price-alerts/:alertId` |  |
| List notifications | `GET /me/notifications` |  |
| Mark one notification read | `PATCH /me/notifications/:notificationId/read` |  |
| Mark all notifications read | `PATCH /me/notifications/read-all` |  |

Expected states:

- Profile loading
- Edit validation errors
- Notification unread/read state
- Empty notifications
- Empty price alerts
- Delete confirmation

## Suggested Student Milestones

### Milestone 1: Auth Foundation

- Register
- Email OTP verification
- Login
- Token storage
- Logout

### Milestone 2: Home And Market

- Home dashboard
- Market list
- Asset details
- Watchlist
- Live price refresh or stream

### Milestone 3: Wallet

- Wallet overview
- Portfolio chart
- Deposit address and QR/copy screen
- Sandbox deposit
- Transaction history/detail

### Milestone 4: KYC And Limits

- KYC intro/status
- Upload selfie and document front
- Optional document back
- Submit KYC
- Show pending/rejected/approved states
- Handle transaction limit blocks

### Milestone 5: Trade

- Buy/sell/swap form
- Quote preview
- Expiry state
- PIN confirmation
- Success/failure receipt

### Milestone 6: Profile, Security, Notifications

- Profile overview
- Edit settings
- 2FA setup/status/regenerate/disable
- Devices
- Price alerts
- Notifications

## Final Demo Requirements

Each student should be able to demo:

- Register -> verify email -> login
- Browse market list and asset details
- Add/remove watchlist asset
- View wallet and transaction history
- Start KYC and submit required images
- Create a trade quote and handle expiry
- Execute a trade with PIN when allowed
- Create/edit/delete price alerts
- View notifications and mark them read
- Show 2FA status and device list

## Remaining Work Template

Use this table at the end of every report:

| Area | Done | Remaining | Blocker |
| --- | --- | --- | --- |
| Auth |  |  |  |
| KYC |  |  |  |
| Market |  |  |  |
| Wallet |  |  |  |
| Trade |  |  |  |
| Profile |  |  |  |
| Notifications |  |  |  |
| UI states |  |  |  |
| Figma matching |  |  |  |

