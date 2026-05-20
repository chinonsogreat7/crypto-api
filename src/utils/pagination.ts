import type { Request } from "express";

export interface PaginationMeta {
  count: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function numberQuery(req: Request, key: string, fallback: number): number {
  const raw = req.query[key];
  const value = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

export function paginate<T>(items: T[], req: Request, defaultLimit = 20): { data: T[]; meta: PaginationMeta } {
  const page = Math.max(1, Math.floor(numberQuery(req, "page", 1)));
  const limit = Math.max(1, Math.min(100, Math.floor(numberQuery(req, "limit", defaultLimit))));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);

  return {
    data,
    meta: {
      count: data.length,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
}

export function sortDirection(req: Request): 1 | -1 {
  return req.query.order === "asc" ? 1 : -1;
}
