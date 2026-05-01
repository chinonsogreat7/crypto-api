# Student Lesson Plan

This project is best taught in layers. Each layer introduces one backend concept and one mobile integration concept.

## Lesson 1: Reading API Documentation

Students should start with `GET /health`, `GET /market/assets`, and Swagger at `/docs`. The goal is to understand routes, methods, headers, request bodies, and response wrappers.

## Lesson 2: Authentication

Use `POST /auth/login` and store the returned token on the client. Then call `GET /me` with the bearer token. Students should learn why protected routes reject requests without `Authorization`.

## Lesson 3: Wallet And Market Data

Build the home screen using `GET /wallet`, `GET /market/trending`, and `GET /me/notifications`. Students should learn how one screen often consumes multiple endpoints.

## Lesson 4: Asset Details And Watchlist

Use `GET /market/assets/:symbol` for the asset detail screen. Add and remove watched coins with the watchlist endpoints. This teaches list state and server-side preferences.

## Lesson 5: Quote Before Execution

Create a quote with `POST /trade/quotes`. Students should show the rate, fee, expected receive amount, and expiry time. This teaches preview screens and quote expiration.

## Lesson 6: Execute A Trade

Approve KYC from the admin API, then execute the quote with `POST /trade/execute`. Students should handle success and failure states, especially wrong PIN, expired quote, KYC required, and insufficient balance.

## Lesson 7: Transactions

Use `GET /wallet/transactions` and `GET /wallet/transactions/:transactionId`. Students should understand transaction statuses and why transaction details need references, timestamps, fees, and rates.

## Lesson 8: Deposits And Withdrawals

Use `GET /wallet/deposit-addresses/:symbol` for QR/deposit screens. Use `POST /wallet/withdrawals` and approve the request from admin. This introduces pending operations.

## Lesson 9: Admin Operations

Build a simple admin dashboard. Use `/admin/dashboard`, `/admin/users`, `/admin/kyc`, `/admin/withdrawals`, `/admin/assets`, and `/admin/fees`. Students should understand that fintech apps need operations tooling.

## Lesson 10: Production Discussion

Discuss what would change in production: database transactions, idempotency keys, audit logs, webhook reconciliation, custody, private keys, KYC providers, fraud checks, rate limiting, and monitoring.
