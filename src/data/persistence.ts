import type {
  AuditLog,
  AssetSymbol,
  Database,
  FiatCurrency,
  KycStatus,
  PriceAlert,
  TransactionStatus,
  TransactionType,
  UserRole,
  UserSettings
} from "../models";
import { initialData } from "./initial-data";
import { prisma } from "./prisma";
import { clone, db, replaceDatabase } from "./store";

type PersistedSession = Awaited<ReturnType<typeof prisma.session.findMany>>[number];
type PersistedAuditLog = Awaited<ReturnType<typeof prisma.auditLog.findMany>>[number];

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function sessionFromRecord(session: PersistedSession) {
  const now = new Date().toISOString();
  return {
    token: session.token,
    userId: session.userId,
    refreshToken: session.refreshToken || `${session.token}-refresh`,
    accessTokenExpiresAt: (session.accessTokenExpiresAt || new Date("2099-01-01T00:00:00.000Z")).toISOString(),
    refreshTokenExpiresAt: (session.refreshTokenExpiresAt || new Date("2099-01-31T00:00:00.000Z")).toISOString(),
    createdAt: (session.createdAt || new Date(now)).toISOString(),
    lastUsedAt: (session.lastUsedAt || new Date(now)).toISOString()
  };
}

function parseJson(value: string | null): unknown | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseMetadata(value: string | null): Record<string, unknown> {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

function auditLogFromRecord(log: PersistedAuditLog): AuditLog {
  return {
    id: log.id,
    actorUserId: log.actorUserId,
    actorEmail: log.actorEmail,
    actorRole: log.actorRole as AuditLog["actorRole"],
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    before: parseJson(log.beforeJson),
    after: parseJson(log.afterJson),
    metadata: parseMetadata(log.metadataJson),
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    requestId: log.requestId,
    createdAt: log.createdAt.toISOString()
  };
}

export async function seedDatabase(data: Database = initialData): Promise<void> {
  await saveDatabase(data);
}

export async function bootstrapDatabase(): Promise<void> {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    await seedDatabase(initialData);
  } else {
    await syncDefaultAssets();
  }

  replaceDatabase(await loadDatabase());
}

async function syncDefaultAssets(): Promise<void> {
  for (const asset of initialData.assets) {
    const existing = await prisma.asset.findUnique({ where: { symbol: asset.symbol } });
    if (!existing) {
      await prisma.asset.create({ data: asset });
    }
  }
}

export async function loadDatabase(): Promise<Database> {
  const [
    users,
    sessions,
    assets,
    wallets,
    quotes,
    transactions,
    kycSubmissions,
    withdrawalRequests,
    notifications,
    deviceTokens,
    priceAlerts,
    auditLogs,
    feeSettings
  ] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.session.findMany(),
    prisma.asset.findMany({ orderBy: { symbol: "asc" } }),
    prisma.wallet.findMany({
      include: { balances: true, depositAddresses: true },
      orderBy: { id: "asc" }
    }),
    prisma.quote.findMany(),
    prisma.transaction.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.kycSubmission.findMany({ orderBy: { submittedAt: "desc" } }),
    prisma.withdrawalRequest.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.notification.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.deviceToken.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.priceAlert.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.feeSettings.findUnique({ where: { id: "default" } })
  ]);

  return {
    users: users.map((user) => ({
      id: user.id,
      role: user.role as UserRole,
      fullName: user.fullName,
      email: user.email,
      emailVerified: user.emailVerified ?? true,
      phone: user.phone,
      password: user.password,
      pin: user.pin,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorSecret: user.twoFactorSecret,
      twoFactorRecoveryCodes: JSON.parse(user.twoFactorRecoveryCodes || "[]") as string[],
      kycStatus: user.kycStatus as KycStatus,
      avatarUrl: user.avatarUrl,
      watchlist: JSON.parse(user.watchlist) as AssetSymbol[],
      settings: JSON.parse(user.settings) as UserSettings,
      createdAt: user.createdAt.toISOString()
    })),
    sessions: sessions.map(sessionFromRecord),
    assets: assets.map((asset) => ({
      ...asset,
      symbol: asset.symbol as AssetSymbol
    })),
    wallets: wallets.map((wallet) => ({
      id: wallet.id,
      userId: wallet.userId,
      fiatCurrency: wallet.fiatCurrency as FiatCurrency,
      depositAddresses: wallet.depositAddresses.map((address) => ({
        assetSymbol: address.assetSymbol as AssetSymbol,
        network: address.network,
        address: address.address,
        qrPayload: address.qrPayload
      })),
      balances: wallet.balances.map((balance) => ({
        assetSymbol: balance.assetSymbol as AssetSymbol | FiatCurrency,
        available: balance.available,
        locked: balance.locked
      }))
    })),
    quotes: quotes.map((quote) => ({
      id: quote.id,
      type: quote.type as "buy" | "sell" | "swap",
      fromAsset: quote.fromAsset as AssetSymbol | FiatCurrency,
      toAsset: quote.toAsset as AssetSymbol | FiatCurrency,
      fromAmount: quote.fromAmount,
      toAmount: quote.toAmount,
      rate: quote.rate,
      feeAmount: quote.feeAmount,
      expiresAt: quote.expiresAt.toISOString()
    })),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      userId: transaction.userId,
      type: transaction.type as TransactionType,
      status: transaction.status as TransactionStatus,
      fromAsset: transaction.fromAsset as AssetSymbol | FiatCurrency,
      toAsset: transaction.toAsset as AssetSymbol | FiatCurrency,
      fromAmount: transaction.fromAmount,
      toAmount: transaction.toAmount,
      feeAmount: transaction.feeAmount,
      rate: transaction.rate,
      reference: transaction.reference,
      note: transaction.note,
      createdAt: transaction.createdAt.toISOString(),
      completedAt: toIso(transaction.completedAt)
    })),
    kycSubmissions: kycSubmissions.map((kyc) => ({
      id: kyc.id,
      userId: kyc.userId,
      legalName: kyc.legalName,
      country: kyc.country,
      documentType: kyc.documentType as "national_id" | "passport" | "drivers_license",
      documentNumber: kyc.documentNumber,
      selfieImageUrl: kyc.selfieImageUrl,
      documentImageUrl: kyc.documentImageUrl,
      documentBackImageUrl: kyc.documentBackImageUrl,
      status: kyc.status as KycStatus,
      submittedAt: kyc.submittedAt.toISOString(),
      reviewedAt: toIso(kyc.reviewedAt),
      reviewerNote: kyc.reviewerNote
    })),
    withdrawalRequests: withdrawalRequests.map((withdrawal) => ({
      id: withdrawal.id,
      userId: withdrawal.userId,
      assetSymbol: withdrawal.assetSymbol as AssetSymbol,
      amount: withdrawal.amount,
      feeAssetAmount: withdrawal.feeAssetAmount,
      address: withdrawal.address,
      network: withdrawal.network,
      status: withdrawal.status as "pending" | "approved" | "rejected",
      createdAt: withdrawal.createdAt.toISOString(),
      reviewedAt: toIso(withdrawal.reviewedAt),
      reviewerNote: withdrawal.reviewerNote
    })),
    notifications: notifications.map((notification) => ({
      id: notification.id,
      userId: notification.userId,
      title: notification.title,
      body: notification.body,
      type: notification.type as "price_alert" | "transaction" | "security" | "kyc",
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString()
    })),
    deviceTokens: deviceTokens.map((deviceToken) => ({
      id: deviceToken.id,
      userId: deviceToken.userId,
      expoPushToken: deviceToken.expoPushToken,
      platform: deviceToken.platform as "ios" | "android" | "web",
      createdAt: deviceToken.createdAt.toISOString(),
      lastSeenAt: deviceToken.lastSeenAt.toISOString()
    })),
    priceAlerts: priceAlerts.map((alert) => ({
      id: alert.id,
      userId: alert.userId,
      assetSymbol: alert.assetSymbol as PriceAlert["assetSymbol"],
      direction: alert.direction as PriceAlert["direction"],
      targetPriceUsd: alert.targetPriceUsd,
      isActive: alert.isActive,
      triggeredAt: toIso(alert.triggeredAt),
      createdAt: alert.createdAt.toISOString()
    })),
    twoFactorChallenges: [],
    auditLogs: auditLogs.map(auditLogFromRecord),
    feeSettings: feeSettings
      ? {
          buyFeePercent: feeSettings.buyFeePercent,
          sellFeePercent: feeSettings.sellFeePercent,
          swapFeePercent: feeSettings.swapFeePercent,
          withdrawalFlatUsd: feeSettings.withdrawalFlatUsd,
          spreadPercent: feeSettings.spreadPercent
        }
      : initialData.feeSettings
  };
}

let pendingSave: Database | null = null;
let saveDrain: Promise<void> | null = null;

export async function saveCurrentDatabase(): Promise<void> {
  pendingSave = clone(db);

  if (!saveDrain) {
    saveDrain = drainPendingSaves().finally(() => {
      saveDrain = null;
    });
  }

  await saveDrain;
}

async function drainPendingSaves(): Promise<void> {
  while (pendingSave) {
    const snapshot = pendingSave;
    pendingSave = null;
    await saveDatabase(snapshot);
  }
}

export async function saveDatabase(data: Database): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany();
    await tx.priceAlert.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.withdrawalRequest.deleteMany();
    await tx.kycSubmission.deleteMany();
    await tx.transaction.deleteMany();
    await tx.quote.deleteMany();
    await tx.deviceToken.deleteMany();
    await tx.depositAddress.deleteMany();
    await tx.walletBalance.deleteMany();
    await tx.wallet.deleteMany();
    await tx.session.deleteMany();
    await tx.asset.deleteMany();
    await tx.feeSettings.deleteMany();
    await tx.user.deleteMany();

    for (const user of data.users) {
      await tx.user.create({
        data: {
          ...user,
          twoFactorRecoveryCodes: JSON.stringify(user.twoFactorRecoveryCodes),
          watchlist: JSON.stringify(user.watchlist),
          settings: JSON.stringify(user.settings),
          createdAt: new Date(user.createdAt)
        }
      });
    }

    for (const session of data.sessions) {
      await tx.session.create({ data: session });
    }

    for (const asset of data.assets) {
      await tx.asset.create({ data: asset });
    }

    for (const wallet of data.wallets) {
      await tx.wallet.create({
        data: {
          id: wallet.id,
          userId: wallet.userId,
          fiatCurrency: wallet.fiatCurrency
        }
      });

      for (const balance of wallet.balances) {
        await tx.walletBalance.create({
          data: {
            id: `${wallet.id}_${balance.assetSymbol}`,
            walletId: wallet.id,
            assetSymbol: balance.assetSymbol,
            available: balance.available,
            locked: balance.locked
          }
        });
      }

      for (const address of wallet.depositAddresses) {
        await tx.depositAddress.create({
          data: {
            id: `${wallet.id}_${address.assetSymbol}_${address.network.replace(/\W/g, "_")}`,
            walletId: wallet.id,
            assetSymbol: address.assetSymbol,
            network: address.network,
            address: address.address,
            qrPayload: address.qrPayload
          }
        });
      }
    }

    for (const quote of data.quotes) {
      await tx.quote.create({
        data: {
          ...quote,
          expiresAt: new Date(quote.expiresAt)
        }
      });
    }

    for (const transaction of data.transactions) {
      await tx.transaction.create({
        data: {
          ...transaction,
          createdAt: new Date(transaction.createdAt),
          completedAt: toDate(transaction.completedAt)
        }
      });
    }

    for (const kyc of data.kycSubmissions) {
      await tx.kycSubmission.create({
        data: {
          ...kyc,
          submittedAt: new Date(kyc.submittedAt),
          reviewedAt: toDate(kyc.reviewedAt)
        }
      });
    }

    for (const withdrawal of data.withdrawalRequests) {
      await tx.withdrawalRequest.create({
        data: {
          ...withdrawal,
          createdAt: new Date(withdrawal.createdAt),
          reviewedAt: toDate(withdrawal.reviewedAt)
        }
      });
    }

    for (const notification of data.notifications) {
      await tx.notification.create({
        data: {
          ...notification,
          createdAt: new Date(notification.createdAt)
        }
      });
    }

    for (const deviceToken of data.deviceTokens) {
      await tx.deviceToken.create({
        data: {
          ...deviceToken,
          createdAt: new Date(deviceToken.createdAt),
          lastSeenAt: new Date(deviceToken.lastSeenAt)
        }
      });
    }

    for (const alert of data.priceAlerts) {
      await tx.priceAlert.create({
        data: {
          ...alert,
          triggeredAt: toDate(alert.triggeredAt),
          createdAt: new Date(alert.createdAt)
        }
      });
    }

    for (const log of data.auditLogs) {
      await tx.auditLog.create({
        data: {
          id: log.id,
          actorUserId: log.actorUserId,
          actorEmail: log.actorEmail,
          actorRole: log.actorRole,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          beforeJson: log.before === null ? null : JSON.stringify(log.before),
          afterJson: log.after === null ? null : JSON.stringify(log.after),
          metadataJson: JSON.stringify(log.metadata || {}),
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          requestId: log.requestId,
          createdAt: new Date(log.createdAt)
        }
      });
    }

    await tx.feeSettings.create({
      data: {
        id: "default",
        ...data.feeSettings
      }
    });
  }, { timeout: 15000 });
}
