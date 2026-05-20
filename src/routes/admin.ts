import express, { type Request } from "express";
import { clone, createId, db, findBalance, getWallet, portfolioValueUsd, publicUser } from "../data/store";
import { marketMeta } from "../data/market-simulator";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { writeAuditLog } from "../services/audit";
import { notifyUser } from "../services/notifications";
import type { Asset, KycStatus, TransactionStatus, TransactionType, WithdrawalRequest } from "../models";
import { badRequest, created, notFound, ok } from "../utils/http";
import { paginate, type PaginationMeta } from "../utils/pagination";
import { isAssetSymbol, isBoolean, isEnumValue, isHttpUrlOrStoragePath, isNonEmptyString, isNonNegativeNumber, isPositiveNumber } from "../utils/validation";

export const adminRouter = express.Router();

adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

function stringQuery(req: Request, key: string): string | null {
  const value = req.query[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function matchesSearch(query: string | null, values: Array<string | number | null | undefined>): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return values.some((value) => String(value || "").toLowerCase().includes(needle));
}

function listResponse<T>(req: Request, items: T[], extraMeta: Record<string, unknown> = {}): { data: T[]; meta: PaginationMeta & Record<string, unknown> } {
  if (req.query.page !== undefined || req.query.limit !== undefined) {
    const { data, meta } = paginate(items, req);
    return { data, meta: { ...meta, ...extraMeta } };
  }

  return {
    data: items,
    meta: {
      count: items.length,
      total: items.length,
      page: 1,
      limit: Math.max(1, items.length),
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      ...extraMeta
    }
  };
}

adminRouter.get("/dashboard", (req, res) => {
  const customers = db.users.filter((user) => user.role === "customer");
  const completedVolumeUsd = db.transactions
    .filter((txn) => txn.status === "completed")
    .reduce((sum, txn) => sum + txn.fromAmount, 0);

  return ok(res, {
    users: customers.length,
    pendingKyc: db.kycSubmissions.filter((kyc) => kyc.status === "pending").length,
    pendingWithdrawals: db.withdrawalRequests.filter((wd) => wd.status === "pending").length,
    assets: db.assets.length,
    completedVolumeUsd: Number(completedVolumeUsd.toFixed(2))
  });
});

adminRouter.get("/users", (req, res) => {
  const q = stringQuery(req, "q");
  const status = stringQuery(req, "kycStatus");
  if (status && !isEnumValue(status, ["not_started", "pending", "approved", "rejected"] as const)) {
    return badRequest(res, "kycStatus must be not_started, pending, approved, or rejected.", "INVALID_KYC_STATUS");
  }

  const users = db.users
    .filter((user) => user.role === "customer")
    .filter((user) => !status || user.kycStatus === status)
    .filter((user) => matchesSearch(q, [user.fullName, user.email, user.phone, user.id]))
    .map(publicUser);
  const { data, meta } = listResponse(req, users, { query: q, kycStatus: status });
  return ok(res, data, meta);
});

adminRouter.get("/users/:userId", (req, res) => {
  const user = db.users.find((item) => item.id === req.params.userId);
  if (!user) {
    return notFound(res, "User was not found.", "USER_NOT_FOUND");
  }

  return ok(res, {
    user: publicUser(user),
    wallet: clone(getWallet(user.id)),
    portfolioValueUsd: Number(portfolioValueUsd(user.id).toFixed(2)),
    transactions: clone(db.transactions.filter((txn) => txn.userId === user.id)),
    kycSubmissions: clone(db.kycSubmissions.filter((kyc) => kyc.userId === user.id)),
    withdrawals: clone(db.withdrawalRequests.filter((withdrawal) => withdrawal.userId === user.id)),
    notifications: clone(db.notifications.filter((notification) => notification.userId === user.id)),
    priceAlerts: clone(db.priceAlerts.filter((alert) => alert.userId === user.id)),
    deviceTokens: clone(
      db.deviceTokens
        .filter((deviceToken) => deviceToken.userId === user.id)
        .map(({ expoPushToken, ...deviceToken }) => ({
          ...deviceToken,
          tokenEnding: expoPushToken.slice(-8)
        }))
    )
  });
});

adminRouter.get("/kyc", (req, res) => {
  const q = stringQuery(req, "q");
  const status = stringQuery(req, "status");
  if (status && !isEnumValue(status, ["not_started", "pending", "approved", "rejected"] as const)) {
    return badRequest(res, "status must be not_started, pending, approved, or rejected.", "INVALID_KYC_STATUS");
  }

  const submissions = db.kycSubmissions
    .filter((kyc) => !status || kyc.status === status)
    .filter((kyc) => matchesSearch(q, [kyc.legalName, kyc.country, kyc.documentType, kyc.documentNumber, kyc.userId, kyc.id]));
  const { data, meta } = listResponse(req, clone(submissions), { query: q, status });
  return ok(res, data, meta);
});

adminRouter.patch("/kyc/:kycId", async (req: Request<{ kycId: string }, unknown, { status?: KycStatus; reviewerNote?: string }>, res) => {
  const { status, reviewerNote } = req.body;
  if (!isEnumValue(status, ["approved", "rejected"] as const)) {
    return badRequest(res, "status must be approved or rejected.");
  }

  if (reviewerNote !== undefined && reviewerNote !== null && !isNonEmptyString(reviewerNote, 1, 240)) {
    return badRequest(res, "reviewerNote must be 1 to 240 characters when provided.", "INVALID_REVIEWER_NOTE");
  }

  const submission = db.kycSubmissions.find((item) => item.id === req.params.kycId);
  if (!submission) {
    return notFound(res, "KYC submission was not found.", "KYC_NOT_FOUND");
  }

  const user = db.users.find((item) => item.id === submission.userId);
  const before = clone({ submission, userKycStatus: user?.kycStatus || null });

  submission.status = status;
  submission.reviewedAt = new Date().toISOString();
  submission.reviewerNote = reviewerNote || null;

  if (user) user.kycStatus = status;
  writeAuditLog(req, {
    action: "kyc.review",
    entityType: "kyc_submission",
    entityId: submission.id,
    before,
    after: { submission, userKycStatus: user?.kycStatus || null },
    metadata: { status, reviewerNote: reviewerNote || null, targetUserId: submission.userId }
  });

  await notifyUser({
    userId: submission.userId,
    title: `KYC ${status}`,
    body: status === "approved" ? "Your account is ready for sandbox trading." : "Your KYC submission needs another review.",
    type: "kyc",
    data: { kycId: submission.id, status }
  });

  return ok(res, clone(submission));
});

adminRouter.get("/transactions", (req, res) => {
  const q = stringQuery(req, "q");
  const status = stringQuery(req, "status");
  const type = stringQuery(req, "type");
  if (status && !isEnumValue(status, ["pending", "completed", "failed", "cancelled", "requires_review"] as const)) {
    return badRequest(res, "status must be pending, completed, failed, cancelled, or requires_review.", "INVALID_TRANSACTION_STATUS");
  }
  if (type && !isEnumValue(type, ["buy", "sell", "swap", "deposit", "withdrawal"] as const)) {
    return badRequest(res, "type must be buy, sell, swap, deposit, or withdrawal.", "INVALID_TRANSACTION_TYPE");
  }

  const transactions = db.transactions
    .filter((txn) => !status || txn.status === (status as TransactionStatus))
    .filter((txn) => !type || txn.type === (type as TransactionType))
    .filter((txn) => matchesSearch(q, [txn.id, txn.userId, txn.type, txn.status, txn.fromAsset, txn.toAsset, txn.reference, txn.note]));
  const { data, meta } = listResponse(req, clone(transactions), { query: q, status, type });
  return ok(res, data, meta);
});

adminRouter.get("/withdrawals", (req, res) => {
  const q = stringQuery(req, "q");
  const status = stringQuery(req, "status");
  if (status && !isEnumValue(status, ["pending", "approved", "rejected"] as const)) {
    return badRequest(res, "status must be pending, approved, or rejected.", "INVALID_WITHDRAWAL_STATUS");
  }

  const withdrawals = db.withdrawalRequests
    .filter((withdrawal) => !status || withdrawal.status === (status as WithdrawalRequest["status"]))
    .filter((withdrawal) => matchesSearch(q, [withdrawal.id, withdrawal.userId, withdrawal.assetSymbol, withdrawal.address, withdrawal.network]));
  const { data, meta } = listResponse(req, clone(withdrawals), { query: q, status });
  return ok(res, data, meta);
});

adminRouter.patch("/withdrawals/:withdrawalId", async (req: Request<{ withdrawalId: string }, unknown, { status?: "approved" | "rejected"; reviewerNote?: string }>, res) => {
  const { status, reviewerNote } = req.body;
  if (!isEnumValue(status, ["approved", "rejected"] as const)) {
    return badRequest(res, "status must be approved or rejected.");
  }

  if (reviewerNote !== undefined && reviewerNote !== null && !isNonEmptyString(reviewerNote, 1, 240)) {
    return badRequest(res, "reviewerNote must be 1 to 240 characters when provided.", "INVALID_REVIEWER_NOTE");
  }

  const withdrawal = db.withdrawalRequests.find((item) => item.id === req.params.withdrawalId);
  if (!withdrawal) {
    return notFound(res, "Withdrawal was not found.", "WITHDRAWAL_NOT_FOUND");
  }

  if (withdrawal.status !== "pending") {
    return badRequest(res, "Withdrawal has already been reviewed.", "WITHDRAWAL_ALREADY_REVIEWED");
  }

  const wallet = getWallet(withdrawal.userId);
  const balance = findBalance(wallet, withdrawal.assetSymbol);
  const lockedAmount = withdrawal.amount + withdrawal.feeAssetAmount;
  const before = clone({ withdrawal, balance });

  withdrawal.status = status;
  withdrawal.reviewedAt = new Date().toISOString();
  withdrawal.reviewerNote = reviewerNote || null;

  if (status === "approved") {
    balance.locked = Math.max(0, balance.locked - lockedAmount);
  } else {
    balance.locked = Math.max(0, balance.locked - lockedAmount);
    balance.available += lockedAmount;
  }
  writeAuditLog(req, {
    action: "withdrawal.review",
    entityType: "withdrawal_request",
    entityId: withdrawal.id,
    before,
    after: { withdrawal, balance },
    metadata: { status, reviewerNote: reviewerNote || null, targetUserId: withdrawal.userId, lockedAmount }
  });

  await notifyUser({
    userId: withdrawal.userId,
    title: `Withdrawal ${status}`,
    body: `${withdrawal.amount} ${withdrawal.assetSymbol} withdrawal was ${status}.`,
    type: "transaction",
    data: { withdrawalId: withdrawal.id, status }
  });

  return ok(res, clone(withdrawal));
});

adminRouter.get("/assets", (req, res) => {
  const q = stringQuery(req, "q");
  const isActive = stringQuery(req, "isActive");
  if (isActive && !isEnumValue(isActive, ["true", "false"] as const)) {
    return badRequest(res, "isActive must be true or false.", "INVALID_ACTIVE_STATE");
  }

  const assets = db.assets
    .filter((asset) => isActive === null || asset.isActive === (isActive === "true"))
    .filter((asset) => matchesSearch(q, [asset.symbol, asset.name, asset.network, asset.id]));
  const { data, meta } = listResponse(req, clone(assets), { query: q, isActive, market: marketMeta() });
  return ok(res, data, meta);
});

adminRouter.post("/assets", (req: Request<Record<string, string>, unknown, Omit<Asset, "id">>, res) => {
  const { symbol, name, network, priceUsd, change24h, isActive, minBuyUsd, minSellUsd, iconUrl } = req.body;
  if (!isAssetSymbol(symbol) || !isNonEmptyString(name, 2, 80) || !isNonEmptyString(network, 2, 80) || !isPositiveNumber(priceUsd, 10_000_000)) {
    return badRequest(res, "symbol, name, network, and priceUsd are required.");
  }

  if (change24h !== undefined && (typeof change24h !== "number" || !Number.isFinite(change24h) || Math.abs(change24h) > 100)) {
    return badRequest(res, "change24h must be a number between -100 and 100.", "INVALID_CHANGE_24H");
  }

  if (isActive !== undefined && !isBoolean(isActive)) {
    return badRequest(res, "isActive must be true or false.", "INVALID_ACTIVE_STATE");
  }

  if (minBuyUsd !== undefined && !isPositiveNumber(minBuyUsd, 1_000_000)) {
    return badRequest(res, "minBuyUsd must be greater than zero.", "INVALID_MIN_BUY");
  }

  if (minSellUsd !== undefined && !isPositiveNumber(minSellUsd, 1_000_000)) {
    return badRequest(res, "minSellUsd must be greater than zero.", "INVALID_MIN_SELL");
  }

  if (iconUrl !== undefined) {
    if (typeof iconUrl !== "string") {
      return badRequest(res, "iconUrl must be an http(s) URL, storage path, or /assets path.", "INVALID_ICON_URL");
    }

    if (!iconUrl.startsWith("/assets/") && !isHttpUrlOrStoragePath(iconUrl)) {
      return badRequest(res, "iconUrl must be an http(s) URL, storage path, or /assets path.", "INVALID_ICON_URL");
    }
  }

  if (db.assets.some((asset) => asset.symbol === symbol)) {
    return badRequest(res, "An asset with this symbol already exists.", "ASSET_EXISTS");
  }

  const asset: Asset = {
    id: createId("asset"),
    symbol,
    name: name.trim(),
    network: network.trim(),
    priceUsd,
    change24h: change24h || 0,
    isActive: isActive ?? true,
    minBuyUsd: minBuyUsd || 10,
    minSellUsd: minSellUsd || 10,
    iconUrl: iconUrl || `/assets/${symbol.toLowerCase()}.svg`
  };

  db.assets.push(asset);
  writeAuditLog(req, {
    action: "asset.create",
    entityType: "asset",
    entityId: asset.id,
    after: asset,
    metadata: { symbol: asset.symbol }
  });
  return created(res, asset);
});

adminRouter.patch("/assets/:symbol", (req: Request<{ symbol: string }, unknown, { isActive?: boolean }>, res) => {
  if (typeof req.body.isActive !== "boolean") {
    return badRequest(res, "isActive must be true or false.");
  }

  const asset = db.assets.find((item) => item.symbol.toLowerCase() === req.params.symbol.toLowerCase());
  if (!asset) {
    return notFound(res, "Asset was not found.", "ASSET_NOT_FOUND");
  }

  const before = clone(asset);
  asset.isActive = req.body.isActive;
  writeAuditLog(req, {
    action: "asset.status_update",
    entityType: "asset",
    entityId: asset.id,
    before,
    after: asset,
    metadata: { symbol: asset.symbol, isActive: asset.isActive }
  });
  return ok(res, clone(asset));
});

adminRouter.get("/fees", (req, res) => {
  return ok(res, clone(db.feeSettings));
});

adminRouter.patch("/fees", (req, res) => {
  const allowed = ["buyFeePercent", "sellFeePercent", "swapFeePercent", "withdrawalFlatUsd", "spreadPercent"] as const;
  let updated = false;
  const before = clone(db.feeSettings);
  for (const key of allowed) {
    const value = req.body[key];
    if (value !== undefined) {
      if (!isNonNegativeNumber(value, 25)) {
        return badRequest(res, `${key} must be a number between 0 and 25.`, "INVALID_FEE_SETTING");
      }
      db.feeSettings[key] = value;
      updated = true;
    }
  }

  if (!updated) {
    return badRequest(res, "At least one fee setting is required.", "NO_FEE_SETTING");
  }

  writeAuditLog(req, {
    action: "fees.update",
    entityType: "fee_settings",
    entityId: "default",
    before,
    after: db.feeSettings,
    metadata: { fields: allowed.filter((key) => req.body[key] !== undefined) }
  });
  return ok(res, clone(db.feeSettings));
});

adminRouter.get("/audit-logs", (req, res) => {
  const q = stringQuery(req, "q");
  const action = stringQuery(req, "action");
  const entityType = stringQuery(req, "entityType");
  const actorUserId = stringQuery(req, "actorUserId");

  const logs = db.auditLogs
    .filter((log) => !action || log.action === action)
    .filter((log) => !entityType || log.entityType === entityType)
    .filter((log) => !actorUserId || log.actorUserId === actorUserId)
    .filter((log) => matchesSearch(q, [log.id, log.action, log.entityType, log.entityId, log.actorEmail, log.actorUserId, log.requestId]));
  const { data, meta } = listResponse(req, clone(logs), { query: q, action, entityType, actorUserId });
  return ok(res, data, meta);
});
