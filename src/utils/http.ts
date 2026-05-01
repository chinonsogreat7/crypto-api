import type { Response } from "express";

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  return res.json({ data, ...(meta ? { meta } : {}) });
}

export function created<T>(res: Response, data: T) {
  return res.status(201).json({ data });
}

export function badRequest(res: Response, message: string, code = "BAD_REQUEST") {
  return res.status(400).json({ error: { code, message } });
}

export function notFound(res: Response, message: string, code = "NOT_FOUND") {
  return res.status(404).json({ error: { code, message } });
}
