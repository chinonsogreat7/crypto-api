import { db } from "./store";
import type { Asset, AssetSymbol } from "../models";
import { evaluatePriceAlerts } from "../services/price-alerts";

const TICK_INTERVAL_MS = Number(process.env.MARKET_TICK_INTERVAL_MS || 10000);
const MAX_HISTORY_POINTS = 48;
const STABLE_COINS = new Set(["USDC", "USDT"]);
const SUPPLY_BY_SYMBOL: Record<AssetSymbol, { circulatingSupply: number; maxSupply: number | null; allTimeHighUsd: number; about: string; websiteUrl: string; explorerUrl: string }> = {
  BTC: {
    circulatingSupply: 19_700_000,
    maxSupply: 21_000_000,
    allTimeHighUsd: 108_000,
    about: "Bitcoin is the first decentralized digital asset, designed as peer-to-peer money secured by proof of work.",
    websiteUrl: "https://bitcoin.org",
    explorerUrl: "https://mempool.space"
  },
  ETH: {
    circulatingSupply: 120_000_000,
    maxSupply: null,
    allTimeHighUsd: 4_891,
    about: "Ethereum is a smart contract network used for decentralized applications, tokens, and on-chain finance.",
    websiteUrl: "https://ethereum.org",
    explorerUrl: "https://etherscan.io"
  },
  USDC: {
    circulatingSupply: 32_000_000_000,
    maxSupply: null,
    allTimeHighUsd: 1.04,
    about: "USD Coin is a dollar-pegged stablecoin used for payments, settlement, and trading pairs.",
    websiteUrl: "https://www.circle.com/usdc",
    explorerUrl: "https://basescan.org"
  },
  USDT: {
    circulatingSupply: 110_000_000_000,
    maxSupply: null,
    allTimeHighUsd: 1.03,
    about: "Tether is a dollar-pegged stablecoin commonly used as quote currency across crypto markets.",
    websiteUrl: "https://tether.to",
    explorerUrl: "https://etherscan.io"
  },
  BNB: {
    circulatingSupply: 153_000_000,
    maxSupply: 200_000_000,
    allTimeHighUsd: 793,
    about: "BNB powers the BNB Smart Chain ecosystem and is used for fees, applications, and trading.",
    websiteUrl: "https://www.bnbchain.org",
    explorerUrl: "https://bscscan.com"
  },
  SOL: {
    circulatingSupply: 460_000_000,
    maxSupply: null,
    allTimeHighUsd: 295,
    about: "Solana is a high-throughput smart contract network used for fast, low-cost crypto applications.",
    websiteUrl: "https://solana.com",
    explorerUrl: "https://explorer.solana.com"
  },
  XRP: {
    circulatingSupply: 55_000_000_000,
    maxSupply: 100_000_000_000,
    allTimeHighUsd: 3.84,
    about: "XRP is a digital asset used on the XRP Ledger for fast settlement and payment experiments.",
    websiteUrl: "https://xrpl.org",
    explorerUrl: "https://xrpscan.com"
  },
  ADA: {
    circulatingSupply: 35_000_000_000,
    maxSupply: 45_000_000_000,
    allTimeHighUsd: 3.1,
    about: "Cardano is a proof-of-stake blockchain focused on smart contracts, governance, and research-driven upgrades.",
    websiteUrl: "https://cardano.org",
    explorerUrl: "https://cardanoscan.io"
  },
  DOGE: {
    circulatingSupply: 145_000_000_000,
    maxSupply: null,
    allTimeHighUsd: 0.73,
    about: "Dogecoin is a community-driven cryptocurrency originally launched as a meme coin.",
    websiteUrl: "https://dogecoin.com",
    explorerUrl: "https://dogechain.info"
  },
  AVAX: {
    circulatingSupply: 380_000_000,
    maxSupply: 720_000_000,
    allTimeHighUsd: 146,
    about: "Avalanche is a smart contract platform built for custom subnets, DeFi, and fast settlement.",
    websiteUrl: "https://avax.network",
    explorerUrl: "https://snowtrace.io"
  },
  DOT: {
    circulatingSupply: 1_300_000_000,
    maxSupply: null,
    allTimeHighUsd: 55,
    about: "Polkadot connects specialized blockchains through a shared security and interoperability model.",
    websiteUrl: "https://polkadot.network",
    explorerUrl: "https://polkadot.subscan.io"
  },
  LTC: {
    circulatingSupply: 74_000_000,
    maxSupply: 84_000_000,
    allTimeHighUsd: 412,
    about: "Litecoin is an early Bitcoin-inspired network designed for fast and inexpensive transfers.",
    websiteUrl: "https://litecoin.org",
    explorerUrl: "https://blockchair.com/litecoin"
  },
  TRX: {
    circulatingSupply: 88_000_000_000,
    maxSupply: null,
    allTimeHighUsd: 0.3,
    about: "TRON is a blockchain network commonly used for stablecoin transfers and decentralized applications.",
    websiteUrl: "https://tron.network",
    explorerUrl: "https://tronscan.org"
  },
  MATIC: {
    circulatingSupply: 9_900_000_000,
    maxSupply: 10_000_000_000,
    allTimeHighUsd: 2.92,
    about: "Polygon is an Ethereum scaling ecosystem used for low-cost applications and token transfers.",
    websiteUrl: "https://polygon.technology",
    explorerUrl: "https://polygonscan.com"
  },
  LINK: {
    circulatingSupply: 587_000_000,
    maxSupply: 1_000_000_000,
    allTimeHighUsd: 52.7,
    about: "Chainlink is an oracle network that connects smart contracts with off-chain data and services.",
    websiteUrl: "https://chain.link",
    explorerUrl: "https://etherscan.io"
  }
};
export const CANDLE_INTERVALS = ["1m", "5m", "15m", "1h", "1d"] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

const CANDLE_INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000
};

export interface MarketPoint {
  time: string;
  priceUsd: number;
}

export interface MarketCandle {
  time: string;
  openUsd: number;
  highUsd: number;
  lowUsd: number;
  closeUsd: number;
  volume: number;
}

export interface OrderBookLevel {
  priceUsd: number;
  amount: number;
  total: number;
}

export interface RecentMarketTrade {
  id: string;
  side: "buy" | "sell";
  priceUsd: number;
  amount: number;
  totalUsd: number;
  createdAt: string;
}

export interface AssetMarketStats {
  marketCapUsd: number;
  volume24hUsd: number;
  circulatingSupply: number;
  maxSupply: number | null;
  allTimeHighUsd: number;
  high24hUsd: number;
  low24hUsd: number;
  volumeToMarketCapRatio: number;
  about: string;
  websiteUrl: string;
  explorerUrl: string;
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

function assetMagnitude(asset: Asset): number {
  if (asset.symbol === "BTC") return 0.03;
  if (asset.symbol === "ETH" || asset.symbol === "BNB") return 0.4;
  if (STABLE_COINS.has(asset.symbol)) return 1500;
  return 120;
}

function pushHistory(asset: Asset, updatedAt: string): void {
  const history = marketState.history[asset.symbol] || [];
  history.push({
    time: updatedAt,
    priceUsd: asset.priceUsd
  });

  marketState.history[asset.symbol] = history.slice(-MAX_HISTORY_POINTS);
}

function buildSeedHistory(asset: Asset, updatedAt: string): MarketPoint[] {
  const points: number = 24;
  const changeRatio = asset.change24h / 100;
  const startPrice = asset.priceUsd / Math.max(0.000001, 1 + changeRatio);
  const updatedAtMs = new Date(updatedAt).getTime();

  return Array.from({ length: points }, (_, index) => {
    const progress = points === 1 ? 1 : index / (points - 1);
    const trendPrice = startPrice + (asset.priceUsd - startPrice) * progress;
    const wave = Math.sin(progress * Math.PI * 3) * volatilityFor(asset) * asset.priceUsd * 3;

    return {
      time: new Date(updatedAtMs - (points - 1 - index) * 60 * 60 * 1000).toISOString(),
      priceUsd: roundPrice(Math.max(0.000001, trendPrice + wave))
    };
  });
}

function seedHistory(): void {
  const updatedAt = new Date().toISOString();
  for (const asset of db.assets) {
    marketState.history[asset.symbol] = buildSeedHistory(asset, updatedAt);
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
  evaluatePriceAlerts({ persist: true }).catch((error) => {
    console.error("Failed to evaluate price alerts", error);
  });
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
  if (!marketState.history[symbol]?.length) {
    const asset = db.assets.find((item) => item.symbol === symbol);
    if (asset) {
      const updatedAt = new Date().toISOString();
      marketState.history[symbol] = buildSeedHistory(asset, updatedAt);
      marketState.lastUpdatedAt ||= updatedAt;
    }
  }

  return marketState.history[symbol] || [];
}

export function assetSparkline(symbol: AssetSymbol, points = 12): MarketPoint[] {
  return assetHistory(symbol).slice(-points);
}

export function assetCandles(symbol: AssetSymbol, interval: CandleInterval, limit = 50): MarketCandle[] {
  const asset = db.assets.find((item) => item.symbol === symbol);
  if (!asset) return [];

  const count = Math.max(1, Math.min(200, Math.floor(limit)));
  const intervalMs = CANDLE_INTERVAL_MS[interval];
  const endMs = Math.floor(Date.now() / intervalMs) * intervalMs;
  const spanRatio = Math.min(1, (intervalMs * count) / (24 * 60 * 60 * 1000));
  const startChangeRatio = (asset.change24h / 100) * spanRatio;
  const startPrice = asset.priceUsd / Math.max(0.000001, 1 + startChangeRatio);
  let previousClose = roundPrice(startPrice);

  return Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 1 : index / (count - 1);
    const wave = Math.sin(progress * Math.PI * 4 + symbol.length) * volatilityFor(asset) * asset.priceUsd * 5;
    const driftPrice = startPrice + (asset.priceUsd - startPrice) * progress;
    const closeUsd = index === count - 1 ? asset.priceUsd : roundPrice(Math.max(0.000001, driftPrice + wave));
    const wickSize = Math.max(closeUsd, previousClose) * volatilityFor(asset) * (1.8 + (index % 4) * 0.25);
    const highUsd = roundPrice(Math.max(closeUsd, previousClose) + wickSize);
    const lowUsd = roundPrice(Math.max(0.000001, Math.min(closeUsd, previousClose) - wickSize));
    const openUsd = previousClose;
    const candle: MarketCandle = {
      time: new Date(endMs - (count - 1 - index) * intervalMs).toISOString(),
      openUsd,
      highUsd,
      lowUsd,
      closeUsd,
      volume: Number((assetMagnitude(asset) * (1 + progress * 0.2 + (index % 5) * 0.03)).toFixed(6))
    };

    previousClose = closeUsd;
    return candle;
  });
}

export function assetOrderBook(symbol: AssetSymbol, levels = 12): { bids: OrderBookLevel[]; asks: OrderBookLevel[]; spreadUsd: number; midPriceUsd: number } | null {
  const asset = db.assets.find((item) => item.symbol === symbol);
  if (!asset) return null;
  const activeAsset = asset;

  const count = Math.max(1, Math.min(50, Math.floor(levels)));
  const step = Math.max(activeAsset.priceUsd * volatilityFor(activeAsset) * 1.2, activeAsset.priceUsd * 0.00005);

  function buildLevel(side: "bid" | "ask", index: number, runningTotal: number): OrderBookLevel {
    const distance = index + 1;
    const priceShift = step * distance;
    const priceUsd = roundPrice(side === "bid" ? activeAsset.priceUsd - priceShift : activeAsset.priceUsd + priceShift);
    const amount = Number((assetMagnitude(activeAsset) * (1 + index * 0.18)).toFixed(6));
    return {
      priceUsd,
      amount,
      total: Number((runningTotal + amount).toFixed(6))
    };
  }

  let bidTotal = 0;
  let askTotal = 0;
  const bids = Array.from({ length: count }, (_, index) => {
    const level = buildLevel("bid", index, bidTotal);
    bidTotal = level.total;
    return level;
  });
  const asks = Array.from({ length: count }, (_, index) => {
    const level = buildLevel("ask", index, askTotal);
    askTotal = level.total;
    return level;
  });

  return {
    bids,
    asks,
    spreadUsd: roundPrice(asks[0].priceUsd - bids[0].priceUsd),
    midPriceUsd: activeAsset.priceUsd
  };
}

export function assetRecentTrades(symbol: AssetSymbol, limit = 30): RecentMarketTrade[] {
  const asset = db.assets.find((item) => item.symbol === symbol);
  if (!asset) return [];

  const count = Math.max(1, Math.min(100, Math.floor(limit)));
  const now = Date.now();
  const step = Math.max(asset.priceUsd * volatilityFor(asset), asset.priceUsd * 0.00003);

  return Array.from({ length: count }, (_, index) => {
    const side = index % 3 === 0 ? "sell" : "buy";
    const direction = side === "buy" ? 1 : -1;
    const priceUsd = roundPrice(Math.max(0.000001, asset.priceUsd + direction * step * ((index % 7) + 1)));
    const amount = Number((assetMagnitude(asset) * (0.5 + (index % 6) * 0.17)).toFixed(6));

    return {
      id: `mtrade_${symbol.toLowerCase()}_${now - index * 12_000}`,
      side,
      priceUsd,
      amount,
      totalUsd: Number((priceUsd * amount).toFixed(2)),
      createdAt: new Date(now - index * 12_000).toISOString()
    };
  });
}

export function assetMarketStats(symbol: AssetSymbol): AssetMarketStats | null {
  const asset = db.assets.find((item) => item.symbol === symbol);
  const supply = SUPPLY_BY_SYMBOL[symbol];
  if (!asset || !supply) return null;

  const volatility = volatilityFor(asset);
  const high24hUsd = roundPrice(asset.priceUsd * (1 + Math.max(0.01, Math.abs(asset.change24h) / 100 + volatility * 8)));
  const low24hUsd = roundPrice(asset.priceUsd * (1 - Math.max(0.01, Math.abs(asset.change24h) / 140 + volatility * 6)));
  const marketCapUsd = Number((asset.priceUsd * supply.circulatingSupply).toFixed(2));
  const volume24hUsd = Number((marketCapUsd * (STABLE_COINS.has(symbol) ? 0.18 : 0.035 + Math.abs(asset.change24h) / 1000)).toFixed(2));

  return {
    marketCapUsd,
    volume24hUsd,
    circulatingSupply: supply.circulatingSupply,
    maxSupply: supply.maxSupply,
    allTimeHighUsd: supply.allTimeHighUsd,
    high24hUsd,
    low24hUsd,
    volumeToMarketCapRatio: Number((volume24hUsd / marketCapUsd).toFixed(4)),
    about: supply.about,
    websiteUrl: supply.websiteUrl,
    explorerUrl: supply.explorerUrl
  };
}
