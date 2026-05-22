export const SUPPORTED_FIAT_CURRENCIES = ["USD", "NGN", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF"] as const;
export type FiatCurrency = (typeof SUPPORTED_FIAT_CURRENCIES)[number];
export type AssetSymbol =
  | "BTC"
  | "ETH"
  | "USDC"
  | "USDT"
  | "BNB"
  | "SOL"
  | "XRP"
  | "ADA"
  | "DOGE"
  | "AVAX"
  | "DOT"
  | "LTC"
  | "TRX"
  | "MATIC"
  | "LINK";
export type KycStatus = "not_started" | "pending" | "approved" | "rejected";
export type TransactionType = "buy" | "sell" | "swap" | "deposit" | "withdrawal";
export type TransactionStatus = "pending" | "completed" | "failed" | "cancelled" | "requires_review";
export type UserRole = "customer" | "admin";

export interface AuditLog {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: UserRole | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown | null;
  after: unknown | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  role: UserRole;
  fullName: string;
  email: string;
  phone: string;
  password: string;
  pin: string;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorRecoveryCodes: string[];
  kycStatus: KycStatus;
  avatarUrl: string | null;
  watchlist: AssetSymbol[];
  settings: UserSettings;
  createdAt: string;
}

export type PublicUser = Omit<User, "password" | "pin" | "twoFactorSecret" | "twoFactorRecoveryCodes">;

export interface UserSettings {
  language: "en";
  fiatCurrency: FiatCurrency;
  theme: "system" | "light" | "dark";
  pushNotifications: boolean;
  biometricEnabled: boolean;
}

export interface Session {
  token: string;
  userId: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface Asset {
  id: string;
  symbol: AssetSymbol;
  name: string;
  network: string;
  priceUsd: number;
  change24h: number;
  isActive: boolean;
  minBuyUsd: number;
  minSellUsd: number;
  iconUrl: string;
}

export interface WalletBalance {
  assetSymbol: AssetSymbol | FiatCurrency;
  available: number;
  locked: number;
}

export interface Wallet {
  id: string;
  userId: string;
  fiatCurrency: FiatCurrency;
  depositAddresses: DepositAddress[];
  balances: WalletBalance[];
}

export interface DepositAddress {
  assetSymbol: AssetSymbol;
  network: string;
  address: string;
  qrPayload: string;
}

export interface FeeSettings {
  buyFeePercent: number;
  sellFeePercent: number;
  swapFeePercent: number;
  withdrawalFlatUsd: number;
  spreadPercent: number;
}

export interface Quote {
  id: string;
  type: "buy" | "sell" | "swap";
  fromAsset: AssetSymbol | FiatCurrency;
  toAsset: AssetSymbol | FiatCurrency;
  fromAmount: number;
  toAmount: number;
  rate: number;
  feeAmount: number;
  expiresAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  fromAsset: AssetSymbol | FiatCurrency;
  toAsset: AssetSymbol | FiatCurrency;
  fromAmount: number;
  toAmount: number;
  feeAmount: number;
  rate: number;
  reference: string;
  note: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface KycSubmission {
  id: string;
  userId: string;
  legalName: string;
  country: string;
  documentType: "national_id" | "passport" | "drivers_license";
  documentNumber: string;
  selfieImageUrl: string | null;
  documentImageUrl: string | null;
  status: KycStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewerNote: string | null;
}

export interface PriceAlert {
  id: string;
  userId: string;
  assetSymbol: AssetSymbol;
  direction: "above" | "below";
  targetPriceUsd: number;
  isActive: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  assetSymbol: AssetSymbol;
  amount: number;
  feeAssetAmount: number;
  address: string;
  network: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  reviewerNote: string | null;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: "price_alert" | "transaction" | "security" | "kyc";
  isRead: boolean;
  createdAt: string;
}

export interface DeviceToken {
  id: string;
  userId: string;
  expoPushToken: string;
  platform: "ios" | "android" | "web";
  createdAt: string;
  lastSeenAt: string;
}

export interface TwoFactorChallenge {
  id: string;
  userId: string;
  attemptsRemaining: number;
  expiresAt: string;
}

export interface Database {
  users: User[];
  sessions: Session[];
  assets: Asset[];
  wallets: Wallet[];
  quotes: Quote[];
  transactions: Transaction[];
  kycSubmissions: KycSubmission[];
  withdrawalRequests: WithdrawalRequest[];
  notifications: Notification[];
  deviceTokens: DeviceToken[];
  priceAlerts: PriceAlert[];
  twoFactorChallenges: TwoFactorChallenge[];
  auditLogs: AuditLog[];
  feeSettings: FeeSettings;
}
