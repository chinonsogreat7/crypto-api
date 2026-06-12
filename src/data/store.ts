import { createHash, randomUUID } from "crypto";
import type {
  AssetSymbol,
  Database,
  FiatCurrency,
  PublicUser,
  Quote,
  Transaction,
  User,
  Wallet,
  DepositAddress
} from "../models";
import { verificationProfileForUser } from "../services/verification";
import { initialData } from "./initial-data";

export const db: Database = clone(initialData);

function deterministicHex(userId: string, assetSymbol: string, length: number): string {
  return createHash("sha256").update(`${userId}:${assetSymbol}:deposit-address`).digest("hex").slice(0, length);
}

function deterministicAddress(userId: string, assetSymbol: AssetSymbol): string {
  if (assetSymbol === "BTC") {
    return `tb1q${deterministicHex(userId, assetSymbol, 36)}`;
  }
  return `0x${deterministicHex(userId, assetSymbol, 40)}`;
}

function qrPayloadFor(assetSymbol: AssetSymbol, address: string): string {
  if (assetSymbol === "BTC") return `bitcoin:${address}`;
  if (assetSymbol === "USDC") return `ethereum:${address}@84532`;
  return `ethereum:${address}@11155111`;
}

export function defaultDepositAddresses(userId: string): DepositAddress[] {
  return [
    {
      assetSymbol: "BTC",
      network: "Bitcoin",
      address: deterministicAddress(userId, "BTC"),
      qrPayload: qrPayloadFor("BTC", deterministicAddress(userId, "BTC"))
    },
    {
      assetSymbol: "ETH",
      network: "Ethereum Sepolia",
      address: deterministicAddress(userId, "ETH"),
      qrPayload: qrPayloadFor("ETH", deterministicAddress(userId, "ETH"))
    },
    {
      assetSymbol: "USDC",
      network: "Base Sepolia",
      address: deterministicAddress(userId, "USDC"),
      qrPayload: qrPayloadFor("USDC", deterministicAddress(userId, "USDC"))
    },
    {
      assetSymbol: "USDT",
      network: "Ethereum Sepolia",
      address: deterministicAddress(userId, "USDT"),
      qrPayload: qrPayloadFor("USDT", deterministicAddress(userId, "USDT"))
    }
  ];
}

export function replaceDatabase(nextDb: Database): void {
  db.users = nextDb.users;
  db.sessions = nextDb.sessions;
  db.assets = nextDb.assets;
  db.wallets = nextDb.wallets;
  db.quotes = nextDb.quotes;
  db.transactions = nextDb.transactions;
  db.kycSubmissions = nextDb.kycSubmissions;
  db.withdrawalRequests = nextDb.withdrawalRequests;
  db.notifications = nextDb.notifications;
  db.deviceTokens = nextDb.deviceTokens;
  db.priceAlerts = nextDb.priceAlerts;
  db.twoFactorChallenges = [];
  db.auditLogs = nextDb.auditLogs;
  db.feeSettings = nextDb.feeSettings;
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 10)}`;
}

export function publicUser(user: User): PublicUser {
  const { password, pin, twoFactorSecret, twoFactorRecoveryCodes, ...safeUser } = user;
  return clone({
    ...safeUser,
    verification: verificationProfileForUser(user)
  });
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function findSessionByToken(token: string) {
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  return session;
}

export function findUserByToken(token: string): User | null {
  const session = findSessionByToken(token);
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}

export function getWallet(userId: string): Wallet {
  let wallet = db.wallets.find((item) => item.userId === userId);
  if (!wallet) {
    wallet = {
      id: createId("wallet"),
      userId,
      fiatCurrency: "USD",
      depositAddresses: defaultDepositAddresses(userId),
      balances: [{ assetSymbol: "USDT", available: 0, locked: 0 }]
    };
    db.wallets.push(wallet);
  }
  normalizeWalletFundingAsset(wallet);
  return wallet;
}

export function activeAssetSymbols(): AssetSymbol[] {
  return db.assets.filter((asset) => asset.isActive).map((asset) => asset.symbol);
}

export function isActiveAssetSymbol(value: unknown): value is AssetSymbol {
  return typeof value === "string" && activeAssetSymbols().includes(value as AssetSymbol);
}

function normalizeWalletFundingAsset(wallet: Wallet): void {
  const usdBalance = wallet.balances.find((item) => item.assetSymbol === "USD");
  if (usdBalance) {
    const usdtBalance = wallet.balances.find((item) => item.assetSymbol === "USDT");
    if (usdtBalance) {
      usdtBalance.available += usdBalance.available;
      usdtBalance.locked += usdBalance.locked;
    } else {
      wallet.balances.push({ assetSymbol: "USDT", available: usdBalance.available, locked: usdBalance.locked });
    }
    wallet.balances = wallet.balances.filter((item) => item.assetSymbol !== "USD");
  }

  const existingSymbols = new Set(wallet.depositAddresses.map((item) => item.assetSymbol));
  for (const address of defaultDepositAddresses(wallet.userId)) {
    if (!existingSymbols.has(address.assetSymbol)) {
      wallet.depositAddresses.push(address);
    }
  }
  normalizeSharedDemoAddresses(wallet);
}

function normalizeSharedDemoAddresses(wallet: Wallet): void {
  if (wallet.userId === "usr_student") return;

  const sharedDemoAddresses = new Set([
    "tb1qstudentdemo000000000000000000000000000",
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
    "0x4444444444444444444444444444444444444444"
  ]);
  const nextDefaults = new Map(defaultDepositAddresses(wallet.userId).map((address) => [address.assetSymbol, address]));

  wallet.depositAddresses = wallet.depositAddresses.map((address) => {
    if (!sharedDemoAddresses.has(address.address.toLowerCase()) && address.qrPayload !== "ethereum:demo") {
      return address;
    }
    return nextDefaults.get(address.assetSymbol) || address;
  });
}

const fiatPriceUsd: Record<FiatCurrency, number> = {
  USD: 1,
  NGN: 0.00065,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.66,
  JPY: 0.0064,
  CHF: 1.12
};

export function getAssetPrice(symbol: AssetSymbol | FiatCurrency): number {
  if (symbol in fiatPriceUsd) return fiatPriceUsd[symbol as FiatCurrency];
  const asset = db.assets.find((item) => item.symbol === symbol);
  if (!asset || !asset.isActive) throw new Error(`Asset ${symbol} is not supported.`);
  return asset.priceUsd;
}

export function convertUsdToFiat(valueUsd: number, currency: FiatCurrency): number {
  return valueUsd / getAssetPrice(currency);
}

export function findBalance(wallet: Wallet, symbol: AssetSymbol | FiatCurrency) {
  let balance = wallet.balances.find((item) => item.assetSymbol === symbol);
  if (!balance) {
    balance = { assetSymbol: symbol, available: 0, locked: 0 };
    wallet.balances.push(balance);
  }
  return balance;
}

export function addQuote(quote: Quote): Quote {
  db.quotes.push(quote);
  return quote;
}

export function addTransaction(transaction: Transaction): Transaction {
  db.transactions.unshift(transaction);
  return transaction;
}

export function portfolioValueUsd(userId: string): number {
  const wallet = getWallet(userId);
  return wallet.balances.reduce((sum, balance) => {
    return sum + balance.available * getAssetPrice(balance.assetSymbol);
  }, 0);
}

export function portfolioValue(userId: string, currency: FiatCurrency): number {
  return convertUsdToFiat(portfolioValueUsd(userId), currency);
}
