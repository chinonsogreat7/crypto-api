const { spawnSync } = require("node:child_process");

if (!process.env.DATABASE_URL) {
  console.log("Skipping Render database compatibility SQL because DATABASE_URL is missing.");
  process.exit(0);
}

const sql = `
DO $$
BEGIN
  IF to_regclass('"Session"') IS NOT NULL THEN
    ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "refreshToken" TEXT;
    UPDATE "Session" SET "refreshToken" = "token" || '-refresh' WHERE "refreshToken" IS NULL OR "refreshToken" = '';
    ALTER TABLE "Session" ALTER COLUMN "refreshToken" SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "Session_refreshToken_key" ON "Session" ("refreshToken");

    ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "accessTokenExpiresAt" TIMESTAMP(3);
    UPDATE "Session" SET "accessTokenExpiresAt" = TIMESTAMP '2099-01-01 00:00:00' WHERE "accessTokenExpiresAt" IS NULL;
    ALTER TABLE "Session" ALTER COLUMN "accessTokenExpiresAt" SET NOT NULL;

    ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" TIMESTAMP(3);
    UPDATE "Session" SET "refreshTokenExpiresAt" = TIMESTAMP '2099-01-31 00:00:00' WHERE "refreshTokenExpiresAt" IS NULL;
    ALTER TABLE "Session" ALTER COLUMN "refreshTokenExpiresAt" SET NOT NULL;

    ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3);
    UPDATE "Session" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;
    ALTER TABLE "Session" ALTER COLUMN "createdAt" SET NOT NULL;

    ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);
    UPDATE "Session" SET "lastUsedAt" = CURRENT_TIMESTAMP WHERE "lastUsedAt" IS NULL;
    ALTER TABLE "Session" ALTER COLUMN "lastUsedAt" SET NOT NULL;
  END IF;
END $$;
`;

const result = spawnSync("npx", ["prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--stdin"], {
  input: sql,
  stdio: ["pipe", "inherit", "inherit"],
  encoding: "utf8",
  shell: process.platform === "win32"
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log("Render database compatibility SQL applied.");
