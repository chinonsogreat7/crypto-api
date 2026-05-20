import type { Request } from "express";
import { createId, db, clone } from "../data/store";
import type { AuditLog } from "../models";

interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export function writeAuditLog(req: Request, input: AuditInput): AuditLog {
  const actor = req.user || null;
  const log: AuditLog = {
    id: createId("audit"),
    actorUserId: actor?.id || null,
    actorEmail: actor?.email || null,
    actorRole: actor?.role || null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId || null,
    before: input.before === undefined ? null : clone(input.before),
    after: input.after === undefined ? null : clone(input.after),
    metadata: clone(input.metadata || {}),
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
    requestId: req.requestId || null,
    createdAt: new Date().toISOString()
  };

  db.auditLogs.unshift(log);
  return log;
}
