import { spawnSync } from "child_process";
import path from "path";

const databasePath = path.join(process.cwd(), "prisma", "dev.db");

const sql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "role" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "phone" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "pin" TEXT NOT NULL,
  "kycStatus" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "watchlist" TEXT NOT NULL,
  "settings" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Session" (
  "token" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Asset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "symbol" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "network" TEXT NOT NULL,
  "priceUsd" REAL NOT NULL,
  "change24h" REAL NOT NULL,
  "isActive" BOOLEAN NOT NULL,
  "minBuyUsd" REAL NOT NULL,
  "minSellUsd" REAL NOT NULL,
  "iconUrl" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "Wallet" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "fiatCurrency" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WalletBalance" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "walletId" TEXT NOT NULL,
  "assetSymbol" TEXT NOT NULL,
  "available" REAL NOT NULL,
  "locked" REAL NOT NULL,
  FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE ("walletId", "assetSymbol")
);

CREATE TABLE IF NOT EXISTS "DepositAddress" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "walletId" TEXT NOT NULL,
  "assetSymbol" TEXT NOT NULL,
  "network" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "qrPayload" TEXT NOT NULL,
  FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE ("walletId", "assetSymbol", "network")
);

CREATE TABLE IF NOT EXISTS "Quote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "fromAsset" TEXT NOT NULL,
  "toAsset" TEXT NOT NULL,
  "fromAmount" REAL NOT NULL,
  "toAmount" REAL NOT NULL,
  "rate" REAL NOT NULL,
  "feeAmount" REAL NOT NULL,
  "expiresAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Transaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "fromAsset" TEXT NOT NULL,
  "toAsset" TEXT NOT NULL,
  "fromAmount" REAL NOT NULL,
  "toAmount" REAL NOT NULL,
  "feeAmount" REAL NOT NULL,
  "rate" REAL NOT NULL,
  "reference" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL,
  "completedAt" DATETIME,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "KycSubmission" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "documentNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "submittedAt" DATETIME NOT NULL,
  "reviewedAt" DATETIME,
  "reviewerNote" TEXT,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WithdrawalRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "assetSymbol" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "feeAssetAmount" REAL NOT NULL,
  "address" TEXT NOT NULL,
  "network" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL,
  "reviewedAt" DATETIME,
  "reviewerNote" TEXT,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL,
  "createdAt" DATETIME NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "FeeSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "buyFeePercent" REAL NOT NULL,
  "sellFeePercent" REAL NOT NULL,
  "swapFeePercent" REAL NOT NULL,
  "withdrawalFlatUsd" REAL NOT NULL,
  "spreadPercent" REAL NOT NULL
);
`;

const result = spawnSync("sqlite3", [databasePath], {
  input: sql,
  encoding: "utf8"
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

console.log(`SQLite schema ready at ${databasePath}`);
