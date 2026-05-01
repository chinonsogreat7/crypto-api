import type {
  AssetSymbol,
  Database,
  FiatCurrency,
  KycStatus,
  TransactionStatus,
  TransactionType,
  UserRole,
  UserSettings
} from "../models";
import { initialData } from "./initial-data";
import { prisma } from "./prisma";
import { db, replaceDatabase } from "./store";

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export async function seedDatabase(data: Database = initialData): Promise<void> {
  await saveDatabase(data);
}

export async function bootstrapDatabase(): Promise<void> {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    await seedDatabase(initialData);
  }

  replaceDatabase(await loadDatabase());
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
    prisma.feeSettings.findUnique({ where: { id: "default" } })
  ]);

  return {
    users: users.map((user) => ({
      id: user.id,
      role: user.role as UserRole,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      password: user.password,
      pin: user.pin,
      kycStatus: user.kycStatus as KycStatus,
      avatarUrl: user.avatarUrl,
      watchlist: JSON.parse(user.watchlist) as AssetSymbol[],
      settings: JSON.parse(user.settings) as UserSettings,
      createdAt: user.createdAt.toISOString()
    })),
    sessions,
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

export async function saveCurrentDatabase(): Promise<void> {
  await saveDatabase(db);
}

export async function saveDatabase(data: Database): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany();
    await tx.withdrawalRequest.deleteMany();
    await tx.kycSubmission.deleteMany();
    await tx.transaction.deleteMany();
    await tx.quote.deleteMany();
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

    await tx.feeSettings.create({
      data: {
        id: "default",
        ...data.feeSettings
      }
    });
  });
}
