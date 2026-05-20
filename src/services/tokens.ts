import { randomUUID } from "crypto";
import { db } from "../data/store";
import type { Session, User } from "../models";

const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 15 * 60);
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 30 * 24 * 60 * 60);

function expiresAt(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function randomToken(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function tokenMetadata(session: Session) {
  return {
    tokenType: "Bearer",
    expiresAt: session.accessTokenExpiresAt,
    expiresInSeconds: Math.max(0, Math.ceil((new Date(session.accessTokenExpiresAt).getTime() - Date.now()) / 1000)),
    refreshTokenExpiresAt: session.refreshTokenExpiresAt
  };
}

export function createSession(user: User): Session {
  const now = new Date().toISOString();
  const session: Session = {
    token: randomToken("access"),
    userId: user.id,
    refreshToken: randomToken("refresh"),
    accessTokenExpiresAt: expiresAt(ACCESS_TOKEN_TTL_SECONDS),
    refreshTokenExpiresAt: expiresAt(REFRESH_TOKEN_TTL_SECONDS),
    createdAt: now,
    lastUsedAt: now
  };

  db.sessions.push(session);
  return session;
}

export function rotateSession(session: Session): Session {
  session.token = randomToken("access");
  session.refreshToken = randomToken("refresh");
  session.accessTokenExpiresAt = expiresAt(ACCESS_TOKEN_TTL_SECONDS);
  session.refreshTokenExpiresAt = expiresAt(REFRESH_TOKEN_TTL_SECONDS);
  session.lastUsedAt = new Date().toISOString();
  return session;
}

export function findSessionByRefreshToken(refreshToken: string): Session | undefined {
  return db.sessions.find((session) => session.refreshToken === refreshToken);
}
