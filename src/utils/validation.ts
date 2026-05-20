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

export function isHttpUrlOrStoragePath(value: unknown): value is string {
  if (!isNonEmptyString(value, 1, 500)) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith("/storage/files/")) return true;
  if (!URL.canParse(trimmed)) return false;
  const parsed = new URL(trimmed);
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}
