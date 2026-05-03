import { db } from "./store";
import type { Asset, AssetSymbol } from "../models";

const TICK_INTERVAL_MS = Number(process.env.MARKET_TICK_INTERVAL_MS || 10000);
const MAX_HISTORY_POINTS = 48;
const STABLE_COINS = new Set(["USDC"]);

interface MarketPoint {
  time: string;
  priceUsd: number;
}

interface MarketState {
  isRunning: boolean;
  lastUpdatedAt: string | null;
  tickIntervalMs: number;
  history: Partial<Record<AssetSymbol, MarketPoint[]>>;
}

export const marketState: MarketState = {
  isRunning: false,
  lastUpdatedAt: null,
  tickIntervalMs: TICK_INTERVAL_MS,
  history: {}
};

let timer: NodeJS.Timeout | null = null;

function roundPrice(value: number): number {
  if (value >= 1000) return Number(value.toFixed(2));
  if (value >= 1) return Number(value.toFixed(4));
  return Number(value.toFixed(6));
}

function volatilityFor(asset: Asset): number {
  if (STABLE_COINS.has(asset.symbol)) return 0.00008;
  if (asset.symbol === "BTC" || asset.symbol === "ETH") return 0.0018;
  return 0.0035;
}

function pushHistory(asset: Asset, updatedAt: string): void {
  const history = marketState.history[asset.symbol] || [];
  history.push({
    time: updatedAt,
    priceUsd: asset.priceUsd
  });

  marketState.history[asset.symbol] = history.slice(-MAX_HISTORY_POINTS);
}

function seedHistory(): void {
  const updatedAt = new Date().toISOString();
  for (const asset of db.assets) {
    marketState.history[asset.symbol] = [{ time: updatedAt, priceUsd: asset.priceUsd }];
  }
  marketState.lastUpdatedAt = updatedAt;
}

export function simulateMarketTick(): void {
  const updatedAt = new Date().toISOString();

  for (const asset of db.assets) {
    if (!asset.isActive) continue;

    const volatility = volatilityFor(asset);
    const direction = Math.random() - 0.5;
    const drift = STABLE_COINS.has(asset.symbol) ? 0 : asset.change24h >= 0 ? 0.0001 : -0.0001;
    const movement = direction * volatility + drift;
    const nextPrice = Math.max(0.000001, asset.priceUsd * (1 + movement));
    const nextChange = asset.change24h + movement * 100;

    asset.priceUsd = roundPrice(nextPrice);
    asset.change24h = Number(Math.max(-18, Math.min(18, nextChange)).toFixed(2));
    pushHistory(asset, updatedAt);
  }

  marketState.lastUpdatedAt = updatedAt;
}

export function startMarketSimulator(): void {
  if (timer) return;

  seedHistory();
  marketState.isRunning = true;
  timer = setInterval(simulateMarketTick, TICK_INTERVAL_MS);
}

export function marketMeta() {
  return {
    mode: "simulated_live_market",
    source: "backend price simulator",
    lastUpdatedAt: marketState.lastUpdatedAt,
    tickIntervalMs: marketState.tickIntervalMs
  };
}

export function assetHistory(symbol: AssetSymbol): MarketPoint[] {
  return marketState.history[symbol] || [];
}
