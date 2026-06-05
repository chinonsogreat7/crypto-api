import type { Database } from "../models";

const now = new Date().toISOString();

export const initialData: Database = {
  users: [
    {
      id: "usr_student",
      role: "customer",
      fullName: "Ada Student",
      email: "student@cryptoclass.test",
      emailVerified: true,
      phone: "+2348010000001",
      password: "password123",
      pin: "1234",
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: [],
      kycStatus: "pending",
      avatarUrl: null,
      watchlist: ["BTC", "ETH", "SOL"],
      settings: {
        language: "en",
        fiatCurrency: "USD",
        theme: "system",
        pushNotifications: true,
        biometricEnabled: false
      },
      createdAt: now
    },
    {
      id: "usr_admin",
      role: "admin",
      fullName: "Class Admin",
      email: "admin@cryptoclass.test",
      emailVerified: true,
      phone: "+2348010000002",
      password: "admin123",
      pin: "0000",
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: [],
      kycStatus: "approved",
      avatarUrl: null,
      watchlist: [],
      settings: {
        language: "en",
        fiatCurrency: "USD",
        theme: "dark",
        pushNotifications: false,
        biometricEnabled: false
      },
      createdAt: now
    }
  ],
  sessions: [
    {
      token: "demo-user-token",
      userId: "usr_student",
      refreshToken: "demo-user-refresh-token",
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
      refreshTokenExpiresAt: "2099-01-31T00:00:00.000Z",
      createdAt: now,
      lastUsedAt: now
    },
    {
      token: "demo-admin-token",
      userId: "usr_admin",
      refreshToken: "demo-admin-refresh-token",
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
      refreshTokenExpiresAt: "2099-01-31T00:00:00.000Z",
      createdAt: now,
      lastUsedAt: now
    }
  ],
  assets: [
    {
      id: "asset_btc",
      symbol: "BTC",
      name: "Bitcoin",
      network: "Bitcoin",
      priceUsd: 68450,
      change24h: 2.4,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/btc.svg"
    },
    {
      id: "asset_eth",
      symbol: "ETH",
      name: "Ethereum",
      network: "Ethereum",
      priceUsd: 3420,
      change24h: -1.1,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/eth.svg"
    },
    {
      id: "asset_usdc",
      symbol: "USDC",
      name: "USD Coin",
      network: "Base",
      priceUsd: 1,
      change24h: 0.01,
      isActive: true,
      minBuyUsd: 5,
      minSellUsd: 5,
      iconUrl: "/assets/usdc.svg"
    },
    {
      id: "asset_sol",
      symbol: "SOL",
      name: "Solana",
      network: "Solana",
      priceUsd: 152,
      change24h: 4.2,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/sol.svg"
    },
    {
      id: "asset_usdt",
      symbol: "USDT",
      name: "Tether",
      network: "Ethereum",
      priceUsd: 1,
      change24h: 0.02,
      isActive: true,
      minBuyUsd: 5,
      minSellUsd: 5,
      iconUrl: "/assets/usdt.svg"
    },
    {
      id: "asset_bnb",
      symbol: "BNB",
      name: "BNB",
      network: "BNB Smart Chain",
      priceUsd: 612,
      change24h: 1.3,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/bnb.svg"
    },
    {
      id: "asset_xrp",
      symbol: "XRP",
      name: "XRP",
      network: "XRP Ledger",
      priceUsd: 0.58,
      change24h: -0.4,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/xrp.svg"
    },
    {
      id: "asset_ada",
      symbol: "ADA",
      name: "Cardano",
      network: "Cardano",
      priceUsd: 0.45,
      change24h: 0.9,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/ada.svg"
    },
    {
      id: "asset_doge",
      symbol: "DOGE",
      name: "Dogecoin",
      network: "Dogecoin",
      priceUsd: 0.16,
      change24h: 2.8,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/doge.svg"
    },
    {
      id: "asset_avax",
      symbol: "AVAX",
      name: "Avalanche",
      network: "Avalanche Fuji",
      priceUsd: 34.5,
      change24h: -1.6,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/avax.svg"
    },
    {
      id: "asset_dot",
      symbol: "DOT",
      name: "Polkadot",
      network: "Polkadot",
      priceUsd: 6.8,
      change24h: 0.5,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/dot.svg"
    },
    {
      id: "asset_ltc",
      symbol: "LTC",
      name: "Litecoin",
      network: "Litecoin",
      priceUsd: 84,
      change24h: -0.2,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/ltc.svg"
    },
    {
      id: "asset_trx",
      symbol: "TRX",
      name: "TRON",
      network: "TRON Nile",
      priceUsd: 0.12,
      change24h: 1.1,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/trx.svg"
    },
    {
      id: "asset_link",
      symbol: "LINK",
      name: "Chainlink",
      network: "Ethereum",
      priceUsd: 18.4,
      change24h: 1.7,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/link.svg"
    },
    {
      id: "asset_matic",
      symbol: "MATIC",
      name: "Polygon",
      network: "Polygon",
      priceUsd: 0.72,
      change24h: -0.8,
      isActive: true,
      minBuyUsd: 10,
      minSellUsd: 10,
      iconUrl: "/assets/matic.svg"
    }
  ],
  wallets: [
    {
      id: "wallet_student",
      userId: "usr_student",
      fiatCurrency: "USD",
      depositAddresses: [
        {
          assetSymbol: "BTC",
          network: "Bitcoin",
          address: "tb1qstudentdemo000000000000000000000000000",
          qrPayload: "bitcoin:tb1qstudentdemo000000000000000000000000000"
        },
        {
          assetSymbol: "ETH",
          network: "Ethereum Sepolia",
          address: "0x1111111111111111111111111111111111111111",
          qrPayload: "ethereum:0x1111111111111111111111111111111111111111@11155111"
        },
        {
          assetSymbol: "USDC",
          network: "Base Sepolia",
          address: "0x2222222222222222222222222222222222222222",
          qrPayload: "ethereum:0x2222222222222222222222222222222222222222@84532"
        }
      ],
      balances: [
        { assetSymbol: "USD", available: 2500, locked: 0 },
        { assetSymbol: "BTC", available: 0.035, locked: 0 },
        { assetSymbol: "ETH", available: 1.25, locked: 0 },
        { assetSymbol: "USDC", available: 420, locked: 0 },
        { assetSymbol: "SOL", available: 8, locked: 0 },
        { assetSymbol: "MATIC", available: 120, locked: 0 },
        { assetSymbol: "LINK", available: 30, locked: 0 }
      ]
    }
  ],
  quotes: [],
  transactions: [
    {
      id: "txn_seed_buy",
      userId: "usr_student",
      type: "buy",
      status: "completed",
      fromAsset: "USD",
      toAsset: "BTC",
      fromAmount: 250,
      toAmount: 0.00362,
      feeAmount: 2.5,
      rate: 68450,
      reference: "CRT-BUY-1001",
      note: "Seed buy transaction",
      createdAt: now,
      completedAt: now
    }
  ],
  kycSubmissions: [
    {
      id: "kyc_student",
      userId: "usr_student",
      legalName: "Ada Student",
      country: "Nigeria",
      documentType: "national_id",
      documentNumber: "NIN-000-000",
      selfieImageUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&h=240&fit=crop&crop=faces",
      documentImageUrl: "https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=480&h=300&fit=crop",
      documentBackImageUrl: null,
      status: "pending",
      submittedAt: now,
      reviewedAt: null,
      reviewerNote: null
    }
  ],
  withdrawalRequests: [],
  notifications: [
    {
      id: "ntf_kyc_pending",
      userId: "usr_student",
      title: "KYC under review",
      body: "Your identity submission is waiting for admin review.",
      type: "kyc",
      isRead: false,
      createdAt: now
    },
    {
      id: "ntf_price_btc",
      userId: "usr_student",
      title: "BTC is up 2.4%",
      body: "Bitcoin moved above your watchlist alert threshold.",
      type: "price_alert",
      isRead: false,
      createdAt: now
    }
  ],
  deviceTokens: [],
  priceAlerts: [
    {
      id: "alert_btc_above",
      userId: "usr_student",
      assetSymbol: "BTC",
      direction: "above",
      targetPriceUsd: 70000,
      isActive: true,
      triggeredAt: null,
      createdAt: now
    }
  ],
  twoFactorChallenges: [],
  auditLogs: [],
  feeSettings: {
    buyFeePercent: 1,
    sellFeePercent: 1,
    swapFeePercent: 0.6,
    withdrawalFlatUsd: 3,
    spreadPercent: 0.5
  }
};
