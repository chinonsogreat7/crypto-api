import type { Database } from "../models";

const now = new Date().toISOString();

export const initialData: Database = {
  users: [
    {
      id: "usr_student",
      role: "customer",
      fullName: "Ada Student",
      email: "student@cryptoclass.test",
      phone: "+2348010000001",
      password: "password123",
      pin: "1234",
      kycStatus: "pending",
      avatarUrl: null,
      watchlist: ["BTC", "ETH", "SOL"],
      settings: {
        language: "en",
        fiatCurrency: "USD",
        theme: "system",
        priceAlerts: true,
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
      phone: "+2348010000002",
      password: "admin123",
      pin: "0000",
      kycStatus: "approved",
      avatarUrl: null,
      watchlist: [],
      settings: {
        language: "en",
        fiatCurrency: "USD",
        theme: "dark",
        priceAlerts: false,
        pushNotifications: false,
        biometricEnabled: false
      },
      createdAt: now
    }
  ],
  sessions: [
    { token: "demo-user-token", userId: "usr_student" },
    { token: "demo-admin-token", userId: "usr_admin" }
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
  feeSettings: {
    buyFeePercent: 1,
    sellFeePercent: 1,
    swapFeePercent: 0.6,
    withdrawalFlatUsd: 3,
    spreadPercent: 0.5
  }
};
