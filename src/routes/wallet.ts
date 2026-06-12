import express, { type Request } from "express";
import { saveCurrentDatabase } from "../data/persistence";
import { activeAssetSymbols, clone, convertUsdToFiat, createId, db, findBalance, getAssetPrice, getWallet, isActiveAssetSymbol, portfolioValueUsd } from "../data/store";
import { requireAuth } from "../middleware/auth";
import { idempotency } from "../middleware/idempotency";
import { rateLimit } from "../middleware/rate-limit";
import { notifyUser } from "../services/notifications";
import { limitExceededMessage, verificationProfileForUser } from "../services/verification";
import type { AssetSymbol, Transaction, User, WithdrawalRequest } from "../models";
import { badRequest, created, forbidden, notFound, ok } from "../utils/http";
import { paginate, sortDirection } from "../utils/pagination";
import { isBlockchainAddress, isEmail, isNonEmptyString, isPhoneNumber, isPin, isPositiveNumber, normalizeEmail, normalizePhone } from "../utils/validation";

export const walletRouter = express.Router();

walletRouter.use(requireAuth);
const depositLimiter = rateLimit({ keyPrefix: "wallet.deposit", windowMs: 60 * 1000, maxRequests: 15 });
const withdrawalLimiter = rateLimit({ keyPrefix: "wallet.withdrawal", windowMs: 60 * 1000, maxRequests: 10 });
const transferLimiter = rateLimit({ keyPrefix: "wallet.transfer", windowMs: 60 * 1000, maxRequests: 15 });

const DEFAULT_DEPOSIT_SETTLEMENT_SECONDS = Number(process.env.DEPOSIT_SETTLEMENT_SECONDS || 5);

function depositSettlementSeconds(value: unknown): number {
  const seconds = value === undefined ? DEFAULT_DEPOSIT_SETTLEMENT_SECONDS : value;
  if (typeof seconds !== "number") return DEFAULT_DEPOSIT_SETTLEMENT_SECONDS;
  if (!Number.isFinite(seconds)) return DEFAULT_DEPOSIT_SETTLEMENT_SECONDS;
  return Math.max(0, Math.min(60, seconds));
}

function scheduleDepositSettlement(transactionId: string, delaySeconds: number): void {
  const delayMs = delaySeconds * 1000;
  const timer = setTimeout(async () => {
    const transaction = db.transactions.find((item) => item.id === transactionId);
    if (!transaction || transaction.type !== "deposit" || transaction.status !== "pending") return;

    const wallet = getWallet(transaction.userId);
    const balance = findBalance(wallet, transaction.toAsset);
    balance.available += transaction.toAmount;
    transaction.status = "completed";
    transaction.completedAt = new Date().toISOString();
    transaction.note = "Sandbox USDT deposit settled";

    await notifyUser({
      userId: transaction.userId,
      title: "USDT deposit completed",
      body: `${transaction.toAmount} ${transaction.toAsset} has been added to your sandbox wallet.`,
      type: "transaction",
      data: { transactionId: transaction.id, status: transaction.status }
    });
    await saveCurrentDatabase();
  }, delayMs);

  timer.unref?.();
}

function withdrawalUsedTodayUsd(userId: string): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return db.withdrawalRequests
    .filter((withdrawal) => withdrawal.userId === userId && withdrawal.status !== "rejected")
    .filter((withdrawal) => new Date(withdrawal.createdAt).getTime() >= startOfDay.getTime())
    .reduce((sum, withdrawal) => sum + withdrawal.amount * getAssetPrice(withdrawal.assetSymbol), 0);
}

function transferUsedTodayUsd(userId: string): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return db.transactions
    .filter((transaction) => transaction.userId === userId && transaction.type === "transfer" && transaction.status === "completed")
    .filter((transaction) => transaction.note?.startsWith("Internal transfer to "))
    .filter((transaction) => new Date(transaction.createdAt).getTime() >= startOfDay.getTime())
    .reduce((sum, transaction) => sum + transaction.fromAmount * getAssetPrice(transaction.fromAsset), 0);
}

function recipientMatchesWalletAddress(user: User, recipient: string): boolean {
  const wallet = db.wallets.find((item) => item.userId === user.id);
  return Boolean(wallet?.depositAddresses.some((address) => address.address.toLowerCase() === recipient.toLowerCase()));
}

function findTransferRecipient(recipient: string, senderId: string): User | null {
  const trimmed = recipient.trim();
  if (!trimmed) return null;

  const normalizedEmail = isEmail(trimmed) ? normalizeEmail(trimmed) : null;
  const normalizedPhone = isPhoneNumber(trimmed) ? normalizePhone(trimmed) : null;

  return (
    db.users.find((user) => {
      if (user.id === senderId || user.role !== "customer") return false;
      return user.id === trimmed || user.email === normalizedEmail || user.phone === normalizedPhone || recipientMatchesWalletAddress(user, trimmed);
    }) || null
  );
}

walletRouter.get("/", (req, res) => {
  const wallet = getWallet(req.user.id);
  const portfolioCurrency = req.user.settings.fiatCurrency;
  const currentValueUsd = portfolioValueUsd(req.user.id);
  return ok(res, {
    wallet: clone(wallet),
    portfolioValueUsd: Number(currentValueUsd.toFixed(2)),
    portfolioValue: Number(convertUsdToFiat(currentValueUsd, portfolioCurrency).toFixed(2)),
    portfolioCurrency,
    verification: verificationProfileForUser(req.user)
  });
});

walletRouter.get("/deposit-addresses", (req, res) => {
  const wallet = getWallet(req.user.id);
  return ok(res, clone(wallet.depositAddresses), { count: wallet.depositAddresses.length });
});

walletRouter.get("/deposit-addresses/:symbol", (req, res) => {
  const wallet = getWallet(req.user.id);
  const depositAddress = wallet.depositAddresses.find((item) => item.assetSymbol === req.params.symbol);
  if (!depositAddress) {
    return notFound(res, "Deposit address was not found for this asset.", "DEPOSIT_ADDRESS_NOT_FOUND");
  }

  return ok(res, clone(depositAddress));
});

walletRouter.get("/transactions", (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const direction = sortDirection(req);
  const transactions = db.transactions.filter((transaction) => {
    return transaction.userId === req.user.id && (!status || transaction.status === status) && (!type || transaction.type === type);
  }).sort((a, b) => {
    return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
  });

  const { data, meta } = paginate(transactions, req, 20);
  return ok(res, clone(data), { ...meta, status: status || null, type: type || null, order: direction === 1 ? "asc" : "desc" });
});

walletRouter.get("/portfolio/history", (req, res) => {
  const range = typeof req.query.range === "string" ? req.query.range.toUpperCase() : "1W";
  const allowedRanges = ["1D", "1W", "1M", "1Y"];
  const selectedRange = allowedRanges.includes(range) ? range : "1W";
  const portfolioCurrency = req.user.settings.fiatCurrency;
  const currentValueUsd = portfolioValueUsd(req.user.id);
  const pointsByRange: Record<string, number> = { "1D": 24, "1W": 7, "1M": 30, "1Y": 12 };
  const stepMsByRange: Record<string, number> = {
    "1D": 60 * 60 * 1000,
    "1W": 24 * 60 * 60 * 1000,
    "1M": 24 * 60 * 60 * 1000,
    "1Y": 30 * 24 * 60 * 60 * 1000
  };
  const points = pointsByRange[selectedRange];
  const stepMs = stepMsByRange[selectedRange];
  const now = Date.now();

  const history = Array.from({ length: points }, (_, index) => {
    const age = points - index - 1;
    const wave = Math.sin(index * 0.85) * 0.035;
    const drift = (index - points + 1) * 0.002;
    const valueUsd = Math.max(0, currentValueUsd * (1 + wave + drift));
    return {
      time: new Date(now - age * stepMs).toISOString(),
      valueUsd: Number(valueUsd.toFixed(2)),
      value: Number(convertUsdToFiat(valueUsd, portfolioCurrency).toFixed(2)),
      currency: portfolioCurrency
    };
  });

  return ok(res, history, {
    count: history.length,
    range: selectedRange,
    latestValueUsd: Number(currentValueUsd.toFixed(2)),
    latestValue: Number(convertUsdToFiat(currentValueUsd, portfolioCurrency).toFixed(2)),
    currency: portfolioCurrency
  });
});

walletRouter.get("/transactions/:transactionId", (req, res) => {
  const transaction = db.transactions.find((item) => item.id === req.params.transactionId && item.userId === req.user.id);
  if (!transaction) {
    return notFound(res, "Transaction was not found.", "TRANSACTION_NOT_FOUND");
  }

  return ok(res, clone(transaction));
});

walletRouter.post("/deposit/simulate", depositLimiter, idempotency("wallet.deposit.simulate"), (req: Request<unknown, unknown, { amount?: number; settlementDelaySeconds?: number }>, res) => {
  const amount = req.body.amount;
  if (!isPositiveNumber(amount, 1_000_000)) {
    return badRequest(res, "amount must be greater than zero.");
  }

  if (req.body.settlementDelaySeconds !== undefined && !isPositiveNumber(req.body.settlementDelaySeconds, 60)) {
    return badRequest(res, "settlementDelaySeconds must be a number between 1 and 60.", "INVALID_SETTLEMENT_DELAY");
  }

  const verification = verificationProfileForUser(req.user);
  if (amount > verification.limits.depositPerTransactionUsd) {
    return forbidden(res, limitExceededMessage("deposit", verification.limits.depositPerTransactionUsd), "KYC_DEPOSIT_LIMIT_EXCEEDED");
  }

  const wallet = getWallet(req.user.id);
  const settlementDelay = depositSettlementSeconds(req.body.settlementDelaySeconds);
  const estimatedCompletionAt = new Date(Date.now() + settlementDelay * 1000).toISOString();

  const transaction = {
    id: createId("txn"),
    userId: req.user.id,
    type: "deposit" as const,
    status: "pending" as const,
    fromAsset: "USDT" as const,
    toAsset: "USDT" as const,
    fromAmount: amount,
    toAmount: amount,
    feeAmount: 0,
    rate: 1,
    reference: `CRT-DEP-${Date.now()}`,
    note: "Sandbox USDT deposit pending settlement",
    createdAt: new Date().toISOString(),
    completedAt: null
  };
  db.transactions.unshift(transaction);
  scheduleDepositSettlement(transaction.id, settlementDelay);

  return created(res, {
    transaction,
    wallet: clone(wallet),
    estimatedCompletionAt,
    pollingUrl: `/wallet/transactions/${transaction.id}`
  });
});

walletRouter.post("/transfers", transferLimiter, idempotency("wallet.transfer.create"), async (req: Request<unknown, unknown, { assetSymbol?: AssetSymbol; amount?: number; recipient?: string; pin?: string; note?: string }>, res) => {
  const { assetSymbol, recipient, pin } = req.body;
  const amount = req.body.amount;

  if (!isActiveAssetSymbol(assetSymbol) || !isPositiveNumber(amount, 1_000_000) || !isNonEmptyString(recipient, 3, 254) || !isPin(pin)) {
    return badRequest(res, `assetSymbol, amount, recipient, and transaction PIN are required. assetSymbol must be one of: ${activeAssetSymbols().join(", ")}.`, "INVALID_TRANSFER_REQUEST");
  }

  if (pin !== req.user.pin) {
    return badRequest(res, "Invalid transaction PIN.", "INVALID_PIN");
  }

  const recipientUser = findTransferRecipient(recipient, req.user.id);
  if (!recipientUser) {
    return notFound(res, "Recipient was not found by email, phone, user id, or wallet address.", "RECIPIENT_NOT_FOUND");
  }

  const amountUsd = amount * getAssetPrice(assetSymbol);
  const verification = verificationProfileForUser(req.user);
  if (!verification.canWithdraw) {
    return forbidden(res, "KYC must be approved before internal transfers.", "KYC_REQUIRED");
  }

  if (amountUsd > verification.limits.withdrawalPerTransactionUsd) {
    return forbidden(res, limitExceededMessage("transfer", verification.limits.withdrawalPerTransactionUsd), "KYC_TRANSFER_LIMIT_EXCEEDED");
  }

  const usedTodayUsd = withdrawalUsedTodayUsd(req.user.id) + transferUsedTodayUsd(req.user.id);
  if (usedTodayUsd + amountUsd > verification.limits.dailyWithdrawalUsd) {
    return forbidden(res, `This transfer is above your remaining daily transfer limit of $${Math.max(0, verification.limits.dailyWithdrawalUsd - usedTodayUsd).toFixed(2)}.`, "KYC_DAILY_TRANSFER_LIMIT_EXCEEDED");
  }

  const senderWallet = getWallet(req.user.id);
  const recipientWallet = getWallet(recipientUser.id);
  const senderBalance = findBalance(senderWallet, assetSymbol);
  const recipientBalance = findBalance(recipientWallet, assetSymbol);

  if (senderBalance.available < amount) {
    return badRequest(res, "Insufficient balance.", "INSUFFICIENT_BALANCE");
  }

  senderBalance.available -= amount;
  recipientBalance.available += amount;

  const now = new Date().toISOString();
  const reference = `CRT-TRF-${Date.now()}`;
  const senderTransaction: Transaction = {
    id: createId("txn"),
    userId: req.user.id,
    type: "transfer",
    status: "completed",
    fromAsset: assetSymbol,
    toAsset: assetSymbol,
    fromAmount: amount,
    toAmount: amount,
    feeAmount: 0,
    rate: 1,
    reference,
    note: `Internal transfer to ${recipientUser.email}`,
    createdAt: now,
    completedAt: now
  };
  const recipientTransaction: Transaction = {
    ...senderTransaction,
    id: createId("txn"),
    userId: recipientUser.id,
    note: `Internal transfer from ${req.user.email}`
  };

  db.transactions.unshift(recipientTransaction, senderTransaction);

  await Promise.all([
    notifyUser({
      userId: req.user.id,
      title: "Transfer sent",
      body: `${amount} ${assetSymbol} was sent to ${recipientUser.fullName}.`,
      type: "transaction",
      data: { transactionId: senderTransaction.id, reference }
    }),
    notifyUser({
      userId: recipientUser.id,
      title: "Transfer received",
      body: `${amount} ${assetSymbol} was received from ${req.user.fullName}.`,
      type: "transaction",
      data: { transactionId: recipientTransaction.id, reference }
    })
  ]);

  return created(res, {
    transfer: {
      reference,
      assetSymbol,
      amount,
      recipient: {
        id: recipientUser.id,
        fullName: recipientUser.fullName,
        email: recipientUser.email,
        phone: recipientUser.phone
      }
    },
    transaction: senderTransaction,
    recipientTransaction,
    wallet: clone(senderWallet)
  });
});

walletRouter.post("/withdrawals", withdrawalLimiter, idempotency("wallet.withdrawal.create"), (req: Request<unknown, unknown, { assetSymbol?: AssetSymbol; amount?: number; address?: string; network?: string }>, res) => {
  const { assetSymbol, address, network } = req.body;
  const amount = req.body.amount;

  if (!isActiveAssetSymbol(assetSymbol) || !isPositiveNumber(amount, 1_000_000) || !isBlockchainAddress(address) || !isNonEmptyString(network, 2, 60)) {
    return badRequest(res, `assetSymbol, amount, address, and network are required. assetSymbol must be one of: ${activeAssetSymbols().join(", ")}.`, "UNSUPPORTED_ASSET");
  }

  const amountUsd = amount * getAssetPrice(assetSymbol);
  const verification = verificationProfileForUser(req.user);
  if (amountUsd > verification.limits.withdrawalPerTransactionUsd) {
    return forbidden(res, limitExceededMessage("withdrawal", verification.limits.withdrawalPerTransactionUsd), "KYC_WITHDRAWAL_LIMIT_EXCEEDED");
  }

  const usedTodayUsd = withdrawalUsedTodayUsd(req.user.id);
  if (usedTodayUsd + amountUsd > verification.limits.dailyWithdrawalUsd) {
    return forbidden(res, `This withdrawal is above your remaining daily withdrawal limit of $${Math.max(0, verification.limits.dailyWithdrawalUsd - usedTodayUsd).toFixed(2)}.`, "KYC_DAILY_WITHDRAWAL_LIMIT_EXCEEDED");
  }

  const wallet = getWallet(req.user.id);
  const balance = findBalance(wallet, assetSymbol);
  const feeInAsset = db.feeSettings.withdrawalFlatUsd / getAssetPrice(assetSymbol);
  const totalDebit = amount + feeInAsset;

  if (balance.available < totalDebit) {
    return badRequest(res, "Insufficient balance for withdrawal plus fee.", "INSUFFICIENT_BALANCE");
  }

  balance.available -= totalDebit;
  balance.locked += totalDebit;

  const withdrawal: WithdrawalRequest = {
    id: createId("wd"),
    userId: req.user.id,
    assetSymbol,
    amount,
    feeAssetAmount: Number(feeInAsset.toFixed(8)),
    address,
    network,
    status: "pending",
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewerNote: null
  };
  db.withdrawalRequests.unshift(withdrawal);

  return created(res, withdrawal);
});
