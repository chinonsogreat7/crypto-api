export function isNonEmptyString(value: unknown, minLength = 1, maxLength = 120): value is string {
  return typeof value === "string" && value.trim().length >= minLength && value.trim().length <= maxLength;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isEmail(value: unknown): value is string {
  if (!isNonEmptyString(value, 3, 254)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizePhone(value: string): string {
  return value.trim().replace(/[()\s-]/g, "");
}

export function isPhoneNumber(value: unknown): value is string {
  if (!isNonEmptyString(value, 8, 20)) return false;
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));
}

export function isStrongEnoughPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 72;
}

export function isPin(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{4,6}$/.test(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isPositiveNumber(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max;
}

export function isNonNegativeNumber(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

export function isEnumValue<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && allowed.includes(value);
}

export function isAssetSymbol(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9]{2,10}$/.test(value);
}

export function isBlockchainAddress(value: unknown): value is string {
  if (!isNonEmptyString(value, 8, 120)) return false;
  const trimmed = value.trim();
  return /^(0x[a-fA-F0-9]{20,64}|[A-Za-z0-9:_-]{8,120})$/.test(trimmed);
}

export function isHttpUrlOrStoragePath(value: unknown): value is string {
  if (!isNonEmptyString(value, 1, 500)) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith("/storage/files/")) return true;
  if (!URL.canParse(trimmed)) return false;
  const parsed = new URL(trimmed);
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}
