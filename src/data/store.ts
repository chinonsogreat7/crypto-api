import { randomUUID } from "crypto";
import type {
  AssetSymbol,
  Database,
  FiatCurrency,
  PublicUser,
  Quote,
  Transaction,
  User,
  Wallet
} from "../models";
import { initialData } from "./initial-data";

export const db: Database = clone(initialData);

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
  db.feeSettings = nextDb.feeSettings;
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 10)}`;
}

export function publicUser(user: User): PublicUser {
  const { password, pin, ...safeUser } = user;
  return clone(safeUser);
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function findUserByToken(token: string): User | null {
  const session = db.sessions.find((item) => item.token === token);
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
      depositAddresses: [
        {
          assetSymbol: "USDC",
          network: "Base Sepolia",
          address: `0x${randomUUID().replace(/-/g, "").slice(0, 40).padEnd(40, "0")}`,
          qrPayload: "ethereum:demo"
        }
      ],
      balances: [{ assetSymbol: "USD", available: 0, locked: 0 }]
    };
    db.wallets.push(wallet);
  }
  return wallet;
}

export function getAssetPrice(symbol: AssetSymbol | FiatCurrency): number {
  if (symbol === "USD" || symbol === "NGN") return symbol === "USD" ? 1 : 0.00065;
  const asset = db.assets.find((item) => item.symbol === symbol);
  if (!asset || !asset.isActive) throw new Error(`Asset ${symbol} is not supported.`);
  return asset.priceUsd;
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
