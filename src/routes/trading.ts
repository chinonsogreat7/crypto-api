import express, { type Request } from "express";
import {
  addQuote,
  addTransaction,
  createId,
  db,
  findBalance,
  getAssetPrice,
  getWallet
} from "../data/store";
import { requireAuth } from "../middleware/auth";
import { notifyUser } from "../services/notifications";
import type { AssetSymbol, FiatCurrency, Quote, Transaction } from "../models";
import { badRequest, created, notFound, ok } from "../utils/http";
import { isEnumValue, isPin, isPositiveNumber } from "../utils/validation";

export const tradingRouter = express.Router();

tradingRouter.use(requireAuth);

type TradeType = "buy" | "sell" | "swap";

interface QuoteBody {
  type?: TradeType;
  fromAsset?: AssetSymbol | FiatCurrency;
  toAsset?: AssetSymbol | FiatCurrency;
  fromAmount?: number;
}

interface ExecuteBody {
  quoteId?: string;
  pin?: string;
}

function feePercent(type: TradeType): number {
  if (type === "buy") return db.feeSettings.buyFeePercent;
  if (type === "sell") return db.feeSettings.sellFeePercent;
  return db.feeSettings.swapFeePercent;
}

function quoteResponse(quote: Quote) {
  const expiresInSeconds = Math.max(0, Math.ceil((new Date(quote.expiresAt).getTime() - Date.now()) / 1000));
  return {
    ...quote,
    expiresInSeconds,
    isExpired: expiresInSeconds === 0
  };
}

tradingRouter.post("/quotes", (req: Request<unknown, unknown, QuoteBody>, res) => {
  const { type, fromAsset, toAsset } = req.body;
  const fromAmount = req.body.fromAmount;

  if (!isEnumValue(type, ["buy", "sell", "swap"] as const) || !fromAsset || !toAsset || !isPositiveNumber(fromAmount, 1_000_000)) {
    return badRequest(res, "type, fromAsset, toAsset, and fromAmount are required.");
  }

  if (fromAsset === toAsset) {
    return badRequest(res, "fromAsset and toAsset must be different.", "SAME_ASSET");
  }

  const fromPrice = getAssetPrice(fromAsset);
  const toPrice = getAssetPrice(toAsset);
  const grossUsd = fromAmount * fromPrice;
  const feeAmount = grossUsd * (feePercent(type) / 100);
  const spreadAmount = grossUsd * (db.feeSettings.spreadPercent / 100);
  const netUsd = grossUsd - feeAmount - spreadAmount;
  const toAmount = netUsd / toPrice;

  const quote: Quote = {
    id: createId("quote"),
    type,
    fromAsset,
    toAsset,
    fromAmount,
    toAmount: Number(toAmount.toFixed(8)),
    rate: Number((fromPrice / toPrice).toFixed(8)),
    feeAmount: Number(feeAmount.toFixed(2)),
    expiresAt: new Date(Date.now() + 30 * 1000).toISOString()
  };

  addQuote(quote);
  return created(res, quoteResponse(quote));
});

tradingRouter.get("/quotes/:quoteId", (req, res) => {
  const quote = db.quotes.find((item) => item.id === req.params.quoteId);
  if (!quote) {
    return notFound(res, "Quote was not found.", "QUOTE_NOT_FOUND");
  }

  return ok(res, quoteResponse(quote));
});

tradingRouter.post("/execute", async (req: Request<unknown, unknown, ExecuteBody>, res) => {
  const { quoteId, pin } = req.body;
  if (!quoteId || !pin) {
    return badRequest(res, "quoteId and pin are required.");
  }

  if (!isPin(pin) || pin !== req.user.pin) {
    return badRequest(res, "Invalid transaction PIN.", "INVALID_PIN");
  }

  if (req.user.kycStatus !== "approved") {
    return badRequest(res, "KYC must be approved before trading.", "KYC_REQUIRED");
  }

  const quote = db.quotes.find((item) => item.id === quoteId);
  if (!quote) {
    return notFound(res, "Quote was not found.", "QUOTE_NOT_FOUND");
  }

  if (new Date(quote.expiresAt).getTime() < Date.now()) {
    return badRequest(res, "Quote has expired. Request a new quote.", "QUOTE_EXPIRED");
  }

  const wallet = getWallet(req.user.id);
  const fromBalance = findBalance(wallet, quote.fromAsset);
  const toBalance = findBalance(wallet, quote.toAsset);

  if (fromBalance.available < quote.fromAmount) {
    return badRequest(res, "Insufficient balance.", "INSUFFICIENT_BALANCE");
  }

  fromBalance.available -= quote.fromAmount;
  toBalance.available += quote.toAmount;

  const transaction: Transaction = {
    id: createId("txn"),
    userId: req.user.id,
    type: quote.type,
    status: "completed",
    fromAsset: quote.fromAsset,
    toAsset: quote.toAsset,
    fromAmount: quote.fromAmount,
    toAmount: quote.toAmount,
    feeAmount: quote.feeAmount,
    rate: quote.rate,
    reference: `CRT-${quote.type.toUpperCase()}-${Date.now()}`,
    note: "Sandbox trade execution",
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  };

  addTransaction(transaction);
  await notifyUser({
    userId: req.user.id,
    title: "Trade completed",
    body: `${quote.type.toUpperCase()} ${quote.fromAmount} ${quote.fromAsset} to ${quote.toAmount} ${quote.toAsset} completed.`,
    type: "transaction",
    data: { transactionId: transaction.id, type: transaction.type }
  });

  return created(res, { transaction, wallet });
});
