import type { NextFunction, Request, Response } from "express";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

function clientKey(req: Request, prefix: string): string {
  const authUser = req.user?.id;
  const forwardedFor = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || req.ip || req.socket.remoteAddress || "unknown";
  return `${prefix}:${authUser || ip}`;
}

export function rateLimit({ windowMs, maxRequests, keyPrefix }: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = clientKey(req, keyPrefix);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count <= maxRequests) {
      return next();
    }

    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please wait and try again.",
        retryAfterSeconds,
        requestId: req.requestId
      }
    });
  };
}
