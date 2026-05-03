import express from "express";
import { clone, db } from "../data/store";
import { assetHistory, marketMeta } from "../data/market-simulator";
import { notFound, ok } from "../utils/http";

export const marketRouter = express.Router();

marketRouter.get("/assets", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.toLowerCase() : "";
  const assets = db.assets.filter((asset) => {
    return asset.isActive && (!q || asset.name.toLowerCase().includes(q) || asset.symbol.toLowerCase().includes(q));
  });

  return ok(res, clone(assets), { count: assets.length, market: marketMeta() });
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
