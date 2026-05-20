import express, { type Request } from "express";
import { clone, createId, db, findBalance, getWallet, portfolioValueUsd, publicUser } from "../data/store";
import { marketMeta } from "../data/market-simulator";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { notifyUser } from "../services/notifications";
import type { Asset, KycStatus } from "../models";
import { badRequest, created, notFound, ok } from "../utils/http";
import { isAssetSymbol, isBoolean, isEnumValue, isHttpUrlOrStoragePath, isNonEmptyString, isNonNegativeNumber, isPositiveNumber } from "../utils/validation";

export const adminRouter = express.Router();

adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

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
  const users = db.users.filter((user) => user.role === "customer").map(publicUser);
  return ok(res, users, { count: users.length });
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
  return ok(res, clone(db.kycSubmissions), { count: db.kycSubmissions.length });
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

  submission.status = status;
  submission.reviewedAt = new Date().toISOString();
  submission.reviewerNote = reviewerNote || null;

  const user = db.users.find((item) => item.id === submission.userId);
  if (user) user.kycStatus = status;

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
  return ok(res, clone(db.transactions), { count: db.transactions.length });
});

adminRouter.get("/withdrawals", (req, res) => {
  return ok(res, clone(db.withdrawalRequests), { count: db.withdrawalRequests.length });
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

  withdrawal.status = status;
  withdrawal.reviewedAt = new Date().toISOString();
  withdrawal.reviewerNote = reviewerNote || null;

  if (status === "approved") {
    balance.locked = Math.max(0, balance.locked - lockedAmount);
  } else {
    balance.locked = Math.max(0, balance.locked - lockedAmount);
    balance.available += lockedAmount;
  }

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
  return ok(res, clone(db.assets), { count: db.assets.length, market: marketMeta() });
});

adminRouter.post("/assets", (req: Request<unknown, unknown, Omit<Asset, "id">>, res) => {
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

  asset.isActive = req.body.isActive;
  return ok(res, clone(asset));
});

adminRouter.get("/fees", (req, res) => {
  return ok(res, clone(db.feeSettings));
});

adminRouter.patch("/fees", (req, res) => {
  const allowed = ["buyFeePercent", "sellFeePercent", "swapFeePercent", "withdrawalFlatUsd", "spreadPercent"] as const;
  let updated = false;
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

  return ok(res, clone(db.feeSettings));
});
