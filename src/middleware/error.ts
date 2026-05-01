import type { NextFunction, Request, Response } from "express";

export function notFoundHandler(req: Request, res: Response) {
  return res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route matches ${req.method} ${req.originalUrl}`
    }
  });
}

export function errorHandler(err: Error & { status?: number; code?: string }, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);
  return res.status(err.status || 500).json({
    error: {
      code: err.code || "SERVER_ERROR",
      message: err.message || "Something went wrong."
    }
  });
}
