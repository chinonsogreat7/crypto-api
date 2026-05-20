import express from "express";
import { clone, db } from "../data/store";
import { assetHistory, marketMeta } from "../data/market-simulator";
import { notFound, ok } from "../utils/http";
import { paginate, sortDirection } from "../utils/pagination";

export const marketRouter = express.Router();

marketRouter.get("/assets", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.toLowerCase() : typeof req.query.search === "string" ? req.query.search.toLowerCase() : "";
  const sort = typeof req.query.sort === "string" ? req.query.sort : "symbol";
  const direction = sortDirection(req);
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
  return ok(res, clone(data), { ...meta, market: marketMeta(), query: q || null, sort, order: direction === 1 ? "asc" : "desc" });
});

marketRouter.get("/assets/:symbol", (req, res) => {
  const asset = db.assets.find((item) => item.symbol.toLowerCase() === req.params.symbol.toLowerCase() && item.isActive);
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
  const trending = clone(db.assets)
    .filter((asset) => asset.isActive)
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 4);

  return ok(res, trending, { count: trending.length, market: marketMeta() });
});
