import type { KycStatus, TransactionLimits, User, VerificationProfile, VerificationTier } from "../models";

const LIMITS_BY_TIER: Record<VerificationTier, TransactionLimits> = {
  starter: {
    depositPerTransactionUsd: 100,
    tradePerTransactionUsd: 0,
    withdrawalPerTransactionUsd: 0,
    dailyWithdrawalUsd: 0
  },
  pending_review: {
    depositPerTransactionUsd: 250,
    tradePerTransactionUsd: 0,
    withdrawalPerTransactionUsd: 0,
    dailyWithdrawalUsd: 0
  },
  verified: {
    depositPerTransactionUsd: 10_000,
    tradePerTransactionUsd: 5_000,
    withdrawalPerTransactionUsd: 2_500,
    dailyWithdrawalUsd: 10_000
  }
};

function tierForStatus(status: KycStatus): VerificationTier {
  if (status === "approved") return "verified";
  if (status === "pending") return "pending_review";
  return "starter";
}

function labelForTier(tier: VerificationTier): string {
  if (tier === "verified") return "Verified";
  if (tier === "pending_review") return "Review in progress";
  return "Starter";
}

function levelForTier(tier: VerificationTier): number {
  if (tier === "verified") return 2;
  if (tier === "pending_review") return 1;
  return 0;
}

export function verificationProfileForStatus(status: KycStatus): VerificationProfile {
  const tier = tierForStatus(status);
  const limits = LIMITS_BY_TIER[tier];

  return {
    status,
    tier,
    level: levelForTier(tier),
    label: labelForTier(tier),
    limits,
    canTrade: limits.tradePerTransactionUsd > 0,
    canWithdraw: limits.withdrawalPerTransactionUsd > 0,
    canUseSandboxDeposits: limits.depositPerTransactionUsd > 0
  };
}

export function verificationProfileForUser(user: User): VerificationProfile {
  return verificationProfileForStatus(user.kycStatus);
}

export function limitExceededMessage(action: "deposit" | "trade" | "withdrawal", limitUsd: number): string {
  if (limitUsd <= 0) {
    return `Complete identity verification before you can ${action}.`;
  }

  return `This ${action} is above your current verification limit of $${limitUsd.toLocaleString()} per transaction.`;
}
