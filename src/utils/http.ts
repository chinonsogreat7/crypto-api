import type { Response } from "express";

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  return res.json({ data, meta: { requestId: res.req.requestId, ...(meta || {}) } });
}

export function created<T>(res: Response, data: T) {
  return res.status(201).json({ data, meta: { requestId: res.req.requestId } });
}

export function badRequest(res: Response, message: string, code = "BAD_REQUEST") {
  return res.status(400).json({ error: { code, message, requestId: res.req.requestId } });
}

export function forbidden(res: Response, message: string, code = "FORBIDDEN") {
  return res.status(403).json({ error: { code, message, requestId: res.req.requestId } });
}

export function notFound(res: Response, message: string, code = "NOT_FOUND") {
  return res.status(404).json({ error: { code, message, requestId: res.req.requestId } });
}
