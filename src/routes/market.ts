import express from "express";
import { clone, db } from "../data/store";
import { assetCandles, assetHistory, assetOrderBook, assetRecentTrades, assetSparkline, CANDLE_INTERVALS, marketMeta } from "../data/market-simulator";
import { badRequest, notFound, ok } from "../utils/http";
import { numberQuery, paginate, sortDirection } from "../utils/pagination";
import { isEnumValue } from "../utils/validation";

export const marketRouter = express.Router();

function includesSparkline(req: express.Request, defaultValue = false): boolean {
  const include = typeof req.query.include === "string" ? req.query.include : "";
  if (!include) return defaultValue;

  return include
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .includes("sparkline");
}

function listAsset(asset: (typeof db.assets)[number], withSparkline: boolean) {
  return {
    ...asset,
    ...(withSparkline ? { sparkline: assetSparkline(asset.symbol) } : {})
  };
}

function findActiveAsset(symbol: string) {
  return db.assets.find((item) => item.symbol.toLowerCase() === symbol.toLowerCase() && item.isActive);
}

marketRouter.get("/assets", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.toLowerCase() : typeof req.query.search === "string" ? req.query.search.toLowerCase() : "";
  const sort = typeof req.query.sort === "string" ? req.query.sort : "symbol";
  const direction = sortDirection(req);
  const withSparkline = includesSparkline(req);
  const assets = db.assets.filter((asset) => {
    return asset.isActive && (!q || asset.name.toLowerCase().includes(q) || asset.symbol.toLowerCase().includes(q));
  });

  const sortedAssets = assets.sort((a, b) => {
    if (sort === "priceUsd" || sort === "change24h" || sort === "minBuyUsd") {
      return (a[sort] - b[sort]) * direction;
    }

    return a.symbol.localeCompare(b.symbol) * direction;
  });

  const { data, meta } = paginate(sortedAssets, req, 20);
  return ok(res, clone(data.map((asset) => listAsset(asset, withSparkline))), {
    ...meta,
    market: marketMeta(),
    query: q || null,
    sort,
    order: direction === 1 ? "asc" : "desc",
    include: withSparkline ? ["sparkline"] : []
  });
});

marketRouter.get("/assets/:symbol/candles", (req, res) => {
  const asset = findActiveAsset(req.params.symbol);
  if (!asset) {
    return notFound(res, "Asset was not found.", "ASSET_NOT_FOUND");
  }

  const interval = typeof req.query.interval === "string" ? req.query.interval : "1m";
  if (!isEnumValue(interval, CANDLE_INTERVALS)) {
    return badRequest(res, `interval must be one of ${CANDLE_INTERVALS.join(", ")}.`, "INVALID_CANDLE_INTERVAL");
  }

  const limit = Math.max(1, Math.min(200, Math.floor(numberQuery(req, "limit", 50))));
  const candles = assetCandles(asset.symbol, interval, limit);

  return ok(res, candles, { count: candles.length, symbol: asset.symbol, interval, market: marketMeta() });
});

marketRouter.get("/assets/:symbol/order-book", (req, res) => {
  const asset = findActiveAsset(req.params.symbol);
  if (!asset) {
    return notFound(res, "Asset was not found.", "ASSET_NOT_FOUND");
  }

  const levels = Math.max(1, Math.min(50, Math.floor(numberQuery(req, "levels", 12))));
  const orderBook = assetOrderBook(asset.symbol, levels);
  if (!orderBook) {
    return notFound(res, "Asset was not found.", "ASSET_NOT_FOUND");
  }

  return ok(res, orderBook, { symbol: asset.symbol, levels, market: marketMeta() });
});

marketRouter.get("/assets/:symbol/trades", (req, res) => {
  const asset = findActiveAsset(req.params.symbol);
  if (!asset) {
    return notFound(res, "Asset was not found.", "ASSET_NOT_FOUND");
  }

  const limit = Math.max(1, Math.min(100, Math.floor(numberQuery(req, "limit", 30))));
  const trades = assetRecentTrades(asset.symbol, limit);

  return ok(res, trades, { count: trades.length, symbol: asset.symbol, market: marketMeta() });
});

marketRouter.get("/assets/:symbol", (req, res) => {
  const asset = findActiveAsset(req.params.symbol);
  if (!asset) {
    return notFound(res, "Asset was not found.", "ASSET_NOT_FOUND");
  }

  return ok(res, {
    ...clone(asset),
    chart: assetHistory(asset.symbol)
  });
});

marketRouter.get("/prices", (req, res) => {
  const prices = db.assets
    .filter((asset) => asset.isActive)
    .map((asset) => ({
      symbol: asset.symbol,
      name: asset.name,
      priceUsd: asset.priceUsd,
      change24h: asset.change24h,
      updatedAt: marketMeta().lastUpdatedAt
    }));

  return ok(res, prices, { count: prices.length, market: marketMeta() });
});

marketRouter.get("/trending", (req, res) => {
  const withSparkline = includesSparkline(req, true);
  const trending = clone(db.assets)
    .filter((asset) => asset.isActive)
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 4)
    .map((asset) => listAsset(asset, withSparkline));

  return ok(res, trending, { count: trending.length, market: marketMeta(), include: withSparkline ? ["sparkline"] : [] });
});
