import express, { type Request } from "express";
import { clone, createId, db, findBalance, getAssetPrice, getWallet, portfolioValueUsd } from "../data/store";
import { requireAuth } from "../middleware/auth";
import type { AssetSymbol, WithdrawalRequest } from "../models";
import { badRequest, created, notFound, ok } from "../utils/http";
import { paginate, sortDirection } from "../utils/pagination";

export const walletRouter = express.Router();

walletRouter.use(requireAuth);

walletRouter.get("/", (req, res) => {
  const wallet = getWallet(req.user.id);
  return ok(res, {
    wallet: clone(wallet),
    portfolioValueUsd: Number(portfolioValueUsd(req.user.id).toFixed(2))
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
  const currentValue = portfolioValueUsd(req.user.id);
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
    const valueUsd = Math.max(0, currentValue * (1 + wave + drift));
    return {
      time: new Date(now - age * stepMs).toISOString(),
      valueUsd: Number(valueUsd.toFixed(2))
    };
  });

  return ok(res, history, {
    count: history.length,
    range: selectedRange,
    latestValueUsd: Number(currentValue.toFixed(2))
  });
});

walletRouter.get("/transactions/:transactionId", (req, res) => {
  const transaction = db.transactions.find((item) => item.id === req.params.transactionId && item.userId === req.user.id);
  if (!transaction) {
    return notFound(res, "Transaction was not found.", "TRANSACTION_NOT_FOUND");
  }

  return ok(res, clone(transaction));
});

walletRouter.post("/deposit/simulate", (req: Request<unknown, unknown, { amount?: number }>, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return badRequest(res, "amount must be greater than zero.");
  }

  const wallet = getWallet(req.user.id);
  const usd = findBalance(wallet, "USD");
  usd.available += amount;

  const transaction = {
    id: createId("txn"),
    userId: req.user.id,
    type: "deposit" as const,
    status: "completed" as const,
    fromAsset: "USD" as const,
    toAsset: "USD" as const,
    fromAmount: amount,
    toAmount: amount,
    feeAmount: 0,
    rate: 1,
    reference: `CRT-DEP-${Date.now()}`,
    note: "Sandbox deposit",
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  };
  db.transactions.unshift(transaction);

  return created(res, { transaction, wallet: clone(wallet) });
});

walletRouter.post("/withdrawals", (req: Request<unknown, unknown, { assetSymbol?: AssetSymbol; amount?: number; address?: string; network?: string }>, res) => {
  const { assetSymbol, address, network } = req.body;
  const amount = Number(req.body.amount);

  if (!assetSymbol || !address || !network || !Number.isFinite(amount) || amount <= 0) {
    return badRequest(res, "assetSymbol, amount, address, and network are required.");
  }

  if (!db.assets.some((asset) => asset.symbol === assetSymbol && asset.isActive)) {
    return badRequest(res, "assetSymbol is not supported.", "UNSUPPORTED_ASSET");
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
