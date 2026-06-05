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
  "emailVerified" BOOLEAN NOT NULL DEFAULT true,
  "phone" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "pin" TEXT NOT NULL,
  "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  "twoFactorSecret" TEXT,
  "twoFactorRecoveryCodes" TEXT NOT NULL DEFAULT '[]',
  "kycStatus" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "watchlist" TEXT NOT NULL,
  "settings" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Session" (
  "token" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL UNIQUE,
  "accessTokenExpiresAt" DATETIME NOT NULL,
  "refreshTokenExpiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL,
  "lastUsedAt" DATETIME NOT NULL,
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
  "selfieImageUrl" TEXT,
  "documentImageUrl" TEXT,
  "documentBackImageUrl" TEXT,
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

CREATE TABLE IF NOT EXISTS "DeviceToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "expoPushToken" TEXT NOT NULL UNIQUE,
  "platform" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL,
  "lastSeenAt" DATETIME NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PriceAlert" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "assetSymbol" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "targetPriceUsd" REAL NOT NULL,
  "isActive" BOOLEAN NOT NULL,
  "triggeredAt" DATETIME,
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

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorUserId" TEXT,
  "actorEmail" TEXT,
  "actorRole" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "beforeJson" TEXT,
  "afterJson" TEXT,
  "metadataJson" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "requestId" TEXT,
  "createdAt" DATETIME NOT NULL
);
`;

function runSql(input: string): string {
  const result = spawnSync("sqlite3", [databasePath], {
    input,
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    console.error(result.stderr);
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  const existing = runSql(`SELECT name FROM pragma_table_info('${table}') WHERE name = '${column}';`);
  if (!existing) {
    runSql(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition};`);
  }
}

runSql(sql);
addColumnIfMissing("KycSubmission", "selfieImageUrl", "TEXT");
addColumnIfMissing("KycSubmission", "documentImageUrl", "TEXT");
addColumnIfMissing("KycSubmission", "documentBackImageUrl", "TEXT");
addColumnIfMissing("User", "twoFactorEnabled", "BOOLEAN NOT NULL DEFAULT false");
addColumnIfMissing("User", "twoFactorSecret", "TEXT");
addColumnIfMissing("User", "twoFactorRecoveryCodes", "TEXT NOT NULL DEFAULT '[]'");
addColumnIfMissing("User", "emailVerified", "BOOLEAN NOT NULL DEFAULT true");
addColumnIfMissing("Session", "refreshToken", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("Session", "accessTokenExpiresAt", "DATETIME NOT NULL DEFAULT '2099-01-01T00:00:00.000Z'");
addColumnIfMissing("Session", "refreshTokenExpiresAt", "DATETIME NOT NULL DEFAULT '2099-01-31T00:00:00.000Z'");
addColumnIfMissing("Session", "createdAt", "DATETIME NOT NULL DEFAULT '2026-05-20T00:00:00.000Z'");
addColumnIfMissing("Session", "lastUsedAt", "DATETIME NOT NULL DEFAULT '2026-05-20T00:00:00.000Z'");
runSql(`UPDATE "Session" SET "refreshToken" = "token" || '-refresh' WHERE "refreshToken" = '';`);
runSql(`CREATE UNIQUE INDEX IF NOT EXISTS "Session_refreshToken_key" ON "Session" ("refreshToken");`);
runSql(`CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt");`);
runSql(`CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog" ("action");`);
runSql(`CREATE INDEX IF NOT EXISTS "AuditLog_entityType_idx" ON "AuditLog" ("entityType");`);
runSql(`CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_idx" ON "AuditLog" ("actorUserId");`);

console.log(`SQLite schema ready at ${databasePath}`);
