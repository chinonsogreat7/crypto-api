import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";

interface IdempotencyRecord {
  fingerprint: string;
  statusCode: number;
  body: unknown;
  createdAt: number;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const records = new Map<string, IdempotencyRecord>();

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function fingerprint(req: Request): string {
  return createHash("sha256")
    .update(stableStringify({ method: req.method, path: req.originalUrl, body: req.body }))
    .digest("hex");
}

function cleanExpiredRecords(now: number): void {
  for (const [key, record] of records) {
    if (now - record.createdAt > IDEMPOTENCY_TTL_MS) {
      records.delete(key);
    }
  }
}

function ownerKey(req: Request): string {
  const forwardedFor = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  return req.user?.id || forwardedFor || req.ip || req.socket.remoteAddress || "anonymous";
}

export function idempotency(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const rawKey = req.get("idempotency-key");
    if (!rawKey) return next();

    const key = rawKey.trim();
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
      return res.status(400).json({
        error: {
          code: "INVALID_IDEMPOTENCY_KEY",
          message: "Idempotency-Key must be 8 to 128 characters and may contain letters, numbers, '.', '_', ':', or '-'.",
          requestId: req.requestId
        }
      });
    }

    const now = Date.now();
    cleanExpiredRecords(now);

    const recordKey = `${scope}:${ownerKey(req)}:${key}`;
    const requestFingerprint = fingerprint(req);
    const existing = records.get(recordKey);

    if (existing) {
      if (existing.fingerprint !== requestFingerprint) {
        return res.status(409).json({
          error: {
            code: "IDEMPOTENCY_KEY_CONFLICT",
            message: "This Idempotency-Key was already used with a different request body.",
            requestId: req.requestId
          }
        });
      }

      res.setHeader("Idempotency-Replayed", "true");
      return res.status(existing.statusCode).json(existing.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        records.set(recordKey, {
          fingerprint: requestFingerprint,
          statusCode: res.statusCode,
          body,
          createdAt: Date.now()
        });
      }

      return originalJson(body);
    };

    return next();
  };
}
