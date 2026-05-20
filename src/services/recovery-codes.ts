import { createHash, randomBytes } from "crypto";
import type { User } from "../models";

const RECOVERY_CODE_COUNT = 8;

function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

function createRecoveryCode(): string {
  const value = randomBytes(5).toString("hex").toUpperCase();
  return `${value.slice(0, 5)}-${value.slice(5)}`;
}

export function createRecoveryCodes() {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, createRecoveryCode);
  return {
    codes,
    hashes: codes.map(hashRecoveryCode)
  };
}

export function recoveryCodeCount(user: User): number {
  return user.twoFactorRecoveryCodes.length;
}

export function verifyAndConsumeRecoveryCode(user: User, code: string): boolean {
  const normalized = normalizeRecoveryCode(code);
  if (!/^[A-F0-9]{10}$/.test(normalized)) return false;

  const hash = hashRecoveryCode(normalized);
  const index = user.twoFactorRecoveryCodes.indexOf(hash);
  if (index === -1) return false;

  user.twoFactorRecoveryCodes.splice(index, 1);
  return true;
}
