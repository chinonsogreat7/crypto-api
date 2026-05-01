import express from "express";
import { clone, db } from "../data/store";
import { notFound, ok } from "../utils/http";

export const marketRouter = express.Router();

marketRouter.get("/assets", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.toLowerCase() : "";
  const assets = db.assets.filter((asset) => {
    return asset.isActive && (!q || asset.name.toLowerCase().includes(q) || asset.symbol.toLowerCase().includes(q));
  });

  return ok(res, clone(assets), { count: assets.length });
});

marketRouter.get("/assets/:symbol", (req, res) => {
  const asset = db.assets.find((item) => item.symbol.toLowerCase() === req.params.symbol.toLowerCase());
  if (!asset) {
    return notFound(res, "Asset was not found.", "ASSET_NOT_FOUND");
  }

  return ok(res, {
    ...clone(asset),
    chart: [
      { time: "09:00", priceUsd: asset.priceUsd * 0.98 },
      { time: "10:00", priceUsd: asset.priceUsd * 1.01 },
      { time: "11:00", priceUsd: asset.priceUsd * 0.995 },
      { time: "12:00", priceUsd: asset.priceUsd }
    ]
  });
});

marketRouter.get("/trending", (req, res) => {
  const trending = clone(db.assets)
    .filter((asset) => asset.isActive)
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 4);

  return ok(res, trending);
});
